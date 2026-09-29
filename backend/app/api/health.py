# Health Check Endpoints
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from typing import Optional
import psutil
import time
import structlog

from app.database.session import get_db_session, get_db_session_direct
from app.database.redis_client import get_redis
from app.config import get_settings
from app.core.stream_manager import multi_stream_manager
from app.core.multi_pipeline import multi_pipeline
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

router = APIRouter()

settings = get_settings()


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    timestamp: float
    uptime_seconds: float
    checks: dict


class ReadinessResponse(BaseModel):
    status: str
    checks: dict


class DeepHealthResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    status: str
    inference_fps: Optional[float] = None
    active_tracks: Optional[int] = None
    memory_used_percent: float
    cpu_used_percent: float
    disk_used_percent: float
    frame_queue_size: int
    frame_queue_max: int
    frame_drops: int
    redis_connected: bool
    postgres_connected: bool
    model_loaded: bool
    streams: dict = {}
    total_frames_processed: int = 0
    total_frames_dropped: int = 0
    any_stream_running: bool = False


_start_time = time.time()
_frame_drop_count = 0
_frame_queue_size = 0
_frame_queue_max = 2
_last_inference_fps = 0.0
_active_tracks = 0
_model_loaded = False


@router.get("/healthz", response_model=HealthResponse)
async def liveness_check():
    """Liveness probe - process is up and event loop responsive."""
    return HealthResponse(
        status="ok",
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=time.time(),
        uptime_seconds=time.time() - _start_time,
        checks={
            "event_loop": "responsive",
        }
    )


@router.get("/readyz", response_model=ReadinessResponse)
async def readiness_check():
    """Readiness probe - model loaded, Redis reachable, frame flowing."""
    checks = {}
    all_ready = True
    
    # Check Redis
    try:
        redis_client = get_redis()
        await redis_client.ping()
        checks["redis"] = "connected"
    except Exception as e:
        checks["redis"] = f"failed: {str(e)}"
        all_ready = False
    
    # Check PostgreSQL
    try:
        session = await get_db_session_direct()
        try:
            await session.execute(text("SELECT 1"))
            checks["postgres"] = "connected"
        finally:
            await session.close()
    except Exception as e:
        checks["postgres"] = f"failed: {str(e)}"
        all_ready = False
    
    # Check model loaded
    checks["model"] = "loaded" if _model_loaded else "not_loaded"
    if not _model_loaded:
        all_ready = False
    
    # Check frame pipeline (detection pipelines actually processing frames)
    frame_pipeline_active = False
    frame_pipeline_details = {}
    try:
        stats = multi_pipeline.get_all_stats()
        for stream_id, s in stats.items():
            if s["status"] == "running" and s["frames_processed"] > 0:
                frame_pipeline_active = True
                frame_pipeline_details[stream_id] = {
                    "detection_fps": s["detection_fps"],
                    "frames_processed": s["frames_processed"],
                    "active_tracks": s["active_tracks"],
                }
        checks["frame_pipeline"] = "active" if frame_pipeline_active else "inactive"
        if frame_pipeline_details:
            checks["frame_pipeline_details"] = frame_pipeline_details
    except Exception as e:
        checks["frame_pipeline"] = f"error: {str(e)}"
        logger.warning("Frame pipeline check failed", error=str(e))
    
    readiness_status = "ready" if all_ready else "not_ready"
    
    if not all_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ReadinessResponse(status=readiness_status, checks=checks).model_dump()
        )
    
    return ReadinessResponse(status=readiness_status, checks=checks)


@router.get("/healthz/deps", response_model=DeepHealthResponse)
async def deep_health_check():
    """Deep dependency check - for alerting, not orchestrator restart."""
    # Memory
    mem = psutil.virtual_memory()
    
    # CPU
    cpu_percent = psutil.cpu_percent(interval=0.1)
    
    # Disk
    disk = psutil.disk_usage("/")
    
    # Redis
    redis_connected = False
    try:
        redis_client = get_redis()
        await redis_client.ping()
        redis_connected = True
    except Exception:
        pass
    
    # PostgreSQL
    postgres_connected = False
    try:
        session = await get_db_session_direct()
        try:
            await session.execute(text("SELECT 1"))
            postgres_connected = True
        finally:
            await session.close()
    except Exception:
        pass
    
    # Frame pipeline stats from stream managers
    stream_stats = {}
    total_frames_processed = 0
    total_frames_dropped = 0
    total_queue_size = 0
    total_queue_max = 0
    any_stream_running = False
    try:
        stats = multi_stream_manager.get_all_stats()
        for stream_id, s in stats.items():
            stream_stats[stream_id] = {
                "status": s["status"],
                "fps": s["current_fps"],
                "frames_processed": s["frames_processed"],
                "frames_dropped": s["frames_dropped"],
                "queue_size": s["queue_size"],
                "queue_max": s["queue_max"],
            }
            total_frames_processed += s["frames_processed"]
            total_frames_dropped += s["frames_dropped"]
            total_queue_size += s["queue_size"]
            total_queue_max += s["queue_max"]
            if s["status"] == "running":
                any_stream_running = True
    except Exception:
        pass
    
    return DeepHealthResponse(
        status="healthy" if (redis_connected and postgres_connected and mem.percent < 90) else "degraded",
        inference_fps=_last_inference_fps if _last_inference_fps > 0 else None,
        active_tracks=_active_tracks if _active_tracks > 0 else None,
        memory_used_percent=mem.percent,
        cpu_used_percent=cpu_percent,
        disk_used_percent=(disk.used / disk.total) * 100,
        frame_queue_size=total_queue_size,
        frame_queue_max=total_queue_max,
        frame_drops=total_frames_dropped,
        redis_connected=redis_connected,
        postgres_connected=postgres_connected,
        model_loaded=_model_loaded,
        streams=stream_stats,
        total_frames_processed=total_frames_processed,
        total_frames_dropped=total_frames_dropped,
        any_stream_running=any_stream_running,
    )


# Functions to update metrics from the AI pipeline (called by other modules)
def update_inference_fps(fps: float):
    global _last_inference_fps
    _last_inference_fps = fps


def update_active_tracks(count: int):
    global _active_tracks
    _active_tracks = count


def update_frame_queue(size: int):
    global _frame_queue_size
    _frame_queue_size = size


def increment_frame_drops():
    global _frame_drop_count
    _frame_drop_count += 1


def set_model_loaded(loaded: bool):
    global _model_loaded
    _model_loaded = loaded
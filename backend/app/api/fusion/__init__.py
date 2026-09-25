"""Fusion API routes for multi-camera management."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import json
import asyncio
import structlog

from app.core.multi_pipeline import multi_pipeline
from app.core.websocket_manager import websocket_manager
from app.core.camera_fusion import FusionConfig, CameraView
from app.core.pipeline import PipelineConfig
from app.core.stream_manager import multi_stream_manager, StreamConfig
from app.config import get_settings

router = APIRouter()
settings = get_settings()


class CameraGroupCreate(BaseModel):
    name: str
    stream_ids: List[str]
    fusion_enabled: bool = True


class CameraGroupResponse(BaseModel):
    name: str
    stream_ids: List[str]
    fusion_enabled: bool
    stats: dict


@router.get("/streams")
async def list_fusion_streams():
    """List all streams available for fusion."""
    all_stats = multi_stream_manager.get_all_stats()
    pipeline_stats = multi_pipeline.get_all_stats()

    streams = []
    for stream_id, stat in all_stats.items():
        streams.append({
            "stream_id": stream_id,
            "name": stat.get("name", stream_id),
            "status": stat.get("status", "unknown"),
            "current_fps": stat.get("current_fps", 0),
            "has_pipeline": stream_id in pipeline_stats,
            "pipeline_stats": pipeline_stats.get(stream_id),
        })

    return {
        "streams": streams,
        "fusion": multi_pipeline.get_fusion_stats(),
    }


@router.get("/tracks")
async def get_fused_tracks():
    """Get all active fused tracks across cameras."""
    return {
        "tracks": multi_pipeline.fusion.get_active_tracks(),
        "stats": multi_pipeline.get_fusion_stats(),
    }


@router.get("/coverage")
async def get_camera_coverage():
    """Get camera coverage map."""
    return {
        "coverage": multi_pipeline.fusion.get_camera_coverage(),
        "cameras": list(multi_pipeline.fusion.camera_views.keys()),
    }


@router.post("/start/{stream_id}")
async def start_pipeline(stream_id: str):
    """Start a pipeline for a stream."""
    if multi_pipeline.get_pipeline(stream_id):
        return {"status": "already_running", "stream_id": stream_id}

    # Check stream exists
    stream = multi_stream_manager.get_stream(stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail=f"Stream '{stream_id}' not found")

    config = PipelineConfig(
        stream_id=stream_id,
        model_path=settings.MODEL_PATH,
        conf_threshold=settings.CONFIDENCE_THRESHOLD,
        iou_threshold=settings.IOU_THRESHOLD,
        input_size=(settings.INFERENCE_WIDTH, settings.INFERENCE_HEIGHT),
        track_thresh=settings.TRACK_THRESH,
        track_buffer=settings.TRACK_BUFFER,
        match_thresh=settings.MATCH_THRESH,
        hysteresis_frames=settings.ZONE_HYSTERESIS_FRAMES,
        buffer_px=settings.ZONE_BUFFER_PIXELS,
    )

    pipeline = await multi_pipeline.add_pipeline(stream_id, config)
    return {"status": "started", "stream_id": stream_id}


@router.post("/stop/{stream_id}")
async def stop_pipeline(stream_id: str):
    """Stop a pipeline for a stream."""
    await multi_pipeline.remove_pipeline(stream_id)
    return {"status": "stopped", "stream_id": stream_id}


@router.get("/stats")
async def get_all_stats():
    """Get stats for all pipelines and fusion engine."""
    return {
        "pipelines": multi_pipeline.get_all_stats(),
        "fusion": multi_pipeline.get_fusion_stats(),
    }


@router.websocket("/ws")
async def fusion_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time fused detections."""
    await websocket.accept()
    client_id = f"fusion_{id(websocket)}"

    try:
        await websocket_manager.connect(websocket, client_id)
        await websocket_manager.subscribe(client_id, "fusion")

        # Send initial state
        await websocket.send_json({
            "type": "connected",
            "data": {
                "client_id": client_id,
                "fusion_stats": multi_pipeline.get_fusion_stats(),
            },
        })

        # Keep connection alive and handle messages
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg.get("type") == "get_tracks":
                tracks = multi_pipeline.fusion.get_active_tracks()
                await websocket.send_json({"type": "tracks", "data": tracks})

    except WebSocketDisconnect:
        await websocket_manager.disconnect(client_id)
    except Exception as e:
        logger.error("Fusion WebSocket error", error=str(e))
        await websocket_manager.disconnect(client_id)

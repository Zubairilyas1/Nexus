# Streams API - Phase 1: RTSP ingestion, MJPEG streaming, YouTube fallback
from fastapi import APIRouter, HTTPException, status, Response, WebSocket, WebSocketDisconnect, Query, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
import structlog
import cv2
import json
import numpy as np

from sqlalchemy import select, update, delete, and_
from app.database.session import get_session_factory
from app.models import Stream, Organization
from app.core.multi_pipeline import multi_pipeline, start_pipeline_for_stream
from app.core.stream_manager import StreamManager, StreamConfig as CoreStreamConfig, multi_stream_manager, StreamStatus
from app.core.homography import HomographyCalibrator
from app.core.tmc import TMCGenerator

logger = structlog.get_logger()

router = APIRouter()


class StreamConfig(BaseModel):
    stream_id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    rtsp_url: str = Field(default="", description="RTSP stream URL")
    youtube_url: str = Field(default="", description="YouTube live stream URL for fallback")
    name: str = Field(default="", max_length=128)
    enabled: bool = True
    frame_width: int = Field(default=1280, ge=320, le=3840)
    frame_height: int = Field(default=720, ge=240, le=2160)
    target_fps: int = Field(default=30, ge=1, le=60)
    use_youtube_fallback: bool = False
    reconnect_delay: float = Field(default=5.0, ge=1.0, le=60.0)
    max_reconnect_attempts: int = Field(default=10, ge=1, le=100)


class StreamStatus(BaseModel):
    stream_id: str
    name: str
    rtsp_url: str
    youtube_url: str
    enabled: bool
    status: str  # "running", "stopped", "error", "connecting"
    fps: float
    frame_width: int
    frame_height: int
    last_frame_ts: Optional[float]
    error: Optional[str]
    frames_captured: int
    frames_dropped: int
    frames_processed: int
    queue_size: int
    queue_max: int
    homography_matrix: Optional[list] = None
    calibration_points: Optional[list] = None
    reprojection_error_m: Optional[float] = None


class CalibrationPoint(BaseModel):
    pixel_x: float
    pixel_y: float
    world_x: float
    world_y: float


class CalibrationRequest(BaseModel):
    points: List[CalibrationPoint] = Field(min_length=4)


class CalibrationResponse(BaseModel):
    success: bool
    reprojection_error_m: float
    matrix: list
    message: str


class TMCQueryParams(BaseModel):
    start: Optional[str] = None
    end: Optional[str] = None
    interval: int = 15


def _convert_stats_to_status(stats: dict, db_stream: Optional[Stream] = None) -> StreamStatus:
    """Convert StreamManager stats to StreamStatus model."""
    homography = db_stream.homographyMatrix if db_stream else None
    calib_points = db_stream.calibrationPoints if db_stream else None
    reproj_error = None
    if homography and calib_points:
        try:
            calib = HomographyCalibrator()
            calib.matrix = np.array(homography, dtype=np.float32)
            calib.inv_matrix = np.linalg.inv(calib.matrix)
            # Compute reprojection error
            img_pts = np.array([[p["pixel_x"], p["pixel_y"]] for p in calib_points], dtype=np.float32)
            world_pts = np.array([[p["world_x"], p["world_y"]] for p in calib_points], dtype=np.float32)
            projected = cv2.perspectiveTransform(img_pts.reshape(-1, 1, 2), calib.matrix)
            errors = np.linalg.norm(projected.reshape(-1, 2) - world_pts, axis=1)
            reproj_error = float(np.mean(errors))
        except Exception:
            reproj_error = None
    
    return StreamStatus(
        stream_id=stats["stream_id"],
        name=stats.get("name", ""),
        rtsp_url="",
        youtube_url="",
        enabled=True,
        status=stats["status"],
        fps=stats["current_fps"],
        frame_width=stats["last_frame_shape"][1] if stats["last_frame_shape"] else 0,
        frame_height=stats["last_frame_shape"][0] if stats["last_frame_shape"] else 0,
        last_frame_ts=stats["last_frame_time"],
        error=stats["recent_errors"][-1] if stats["recent_errors"] else None,
        frames_captured=stats["frames_captured"],
        frames_dropped=stats["frames_dropped"],
        frames_processed=stats["frames_processed"],
        queue_size=stats["queue_size"],
        queue_max=stats["queue_max"],
        homography_matrix=homography,
        calibration_points=calib_points,
        reprojection_error_m=reproj_error,
    )


from fastapi import Header

@router.post("", response_model=StreamStatus, status_code=status.HTTP_201_CREATED)
async def create_stream(
    config: StreamConfig,
    x_organization_id: Optional[str] = Header(None)
):
    """Register and start a new RTSP/YouTube stream."""
    if config.stream_id in multi_stream_manager.streams:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Stream '{config.stream_id}' already exists"
        )
    
    if not config.rtsp_url and not config.youtube_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either rtsp_url or youtube_url must be provided"
        )
    
    core_config = CoreStreamConfig(
        stream_id=config.stream_id,
        rtsp_url=config.rtsp_url,
        youtube_url=config.youtube_url,
        name=config.name or config.stream_id,
        frame_width=config.frame_width,
        frame_height=config.frame_height,
        target_fps=config.target_fps,
        reconnect_delay=config.reconnect_delay,
        max_reconnect_attempts=config.max_reconnect_attempts,
        use_youtube_fallback=config.use_youtube_fallback or bool(config.youtube_url),
    )
    
    try:
        # Save to database
        factory = get_session_factory()
        async with factory() as db:
            org_id = x_organization_id
            if not org_id:
                org_result = await db.execute(select(Organization).order_by(Organization.createdAt).limit(1))
                org = org_result.scalar_one_or_none()
                if org:
                    org_id = org.id
            
            db.add(Stream(
                streamId=config.stream_id,
                rtspUrl=config.rtsp_url or None,
                youtubeUrl=config.youtube_url or None,
                name=config.name or config.stream_id,
                frameWidth=config.frame_width,
                frameHeight=config.frame_height,
                targetFps=config.target_fps,
                enabled=config.enabled,
                organizationId=org_id
            ))
            await db.commit()

        manager = await multi_stream_manager.add_stream(core_config)
        
        # Phase 2: Start pipeline if enabled
        if config.enabled:
            await start_pipeline_for_stream(config.stream_id)
            
        stats = manager.get_stats()
        # Mock enabled to True in status returned to UI right now
        status_dict = _convert_stats_to_status(stats)
        status_dict.enabled = config.enabled
        return status_dict
    except Exception as e:
        logger.error("Failed to create stream", stream_id=config.stream_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start stream: {str(e)}"
        )


@router.get("", response_model=List[StreamStatus])
async def list_streams():
    """List all registered streams with their statistics."""
    stats = multi_stream_manager.get_all_stats()
    
    factory = get_session_factory()
    async with factory() as db:
        stream_ids = list(stats.keys())
        if stream_ids:
            result = await db.execute(select(Stream).where(Stream.streamId.in_(stream_ids)))
            db_streams = {s.streamId: s for s in result.scalars().all()}
        else:
            db_streams = {}
    
    return [_convert_stats_to_status(s, db_streams.get(s["stream_id"])) for s in stats.values()]


@router.get("/{stream_id}", response_model=StreamStatus)
async def get_stream(
    stream_id: str,
):
    """Get stream status and statistics."""
    manager = multi_stream_manager.get_stream(stream_id)
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stream '{stream_id}' not found"
        )
    
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(select(Stream).where(Stream.streamId == stream_id))
        db_stream = result.scalar_one_or_none()
    
    stats = manager.get_stats()
    return _convert_stats_to_status(stats, db_stream)


from sqlalchemy import update, delete

@router.patch("/{stream_id}", response_model=StreamStatus)
async def update_stream(
    stream_id: str,
    enabled: Optional[bool] = None,
):
    """Enable or disable a stream."""
    manager = multi_stream_manager.get_stream(stream_id)
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stream '{stream_id}' not found"
        )
    
    if enabled is not None:
        factory = get_session_factory()
        async with factory() as db:
            await db.execute(update(Stream).where(Stream.streamId == stream_id).values(enabled=enabled))
            await db.commit()

        if enabled:
            if manager.stats.status == "stopped":
                await manager.start()
            await start_pipeline_for_stream(stream_id)
        else:
            await multi_pipeline.remove_pipeline(stream_id)
            if manager.stats.status != "stopped":
                await manager.stop()
    
    stats = manager.get_stats()
    status_dict = _convert_stats_to_status(stats)
    if enabled is not None:
        status_dict.enabled = enabled
    return status_dict


@router.delete("/{stream_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stream(
    stream_id: str,
):
    """Delete a stream."""
    manager = multi_stream_manager.get_stream(stream_id)
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stream '{stream_id}' not found"
        )
    
    # Remove from pipeline and capture
    await multi_pipeline.remove_pipeline(stream_id)
    await multi_stream_manager.remove_stream(stream_id)

    # Delete from database
    factory = get_session_factory()
    async with factory() as db:
        await db.execute(delete(Stream).where(Stream.streamId == stream_id))
        await db.commit()


@router.get("/{stream_id}/mjpeg")
async def mjpeg_stream(stream_id: str):
    """MJPEG video stream endpoint."""
    manager = multi_stream_manager.get_stream(stream_id)
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stream '{stream_id}' not found"
        )
    
    # Get status from stats (which returns string value)
    stream_stats = manager.get_stats()
    if stream_stats["status"] != "running":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Stream '{stream_id}' is not running (status: {stream_stats['status']})"
        )
    
    return StreamingResponse(
        manager.generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        }
    )


@router.get("/{stream_id}/snapshot")
async def snapshot(stream_id: str):
    """Get a single JPEG snapshot from the stream."""
    manager = multi_stream_manager.get_stream(stream_id)
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stream '{stream_id}' not found"
        )
    
    frame = manager.get_latest_frame()
    if frame is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No frame available"
        )
    
    encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), 85]
    ret, buffer = cv2.imencode('.jpg', frame, encode_params)
    if not ret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to encode frame"
        )
    
    return Response(
        content=buffer.tobytes(),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-cache"}
    )


@router.post("/{stream_id}/test-youtube")
async def test_youtube_url(
    stream_id: str,
    youtube_url: str,
):
    """Test a YouTube URL to verify it can be resolved."""
    import yt_dlp
    
    ydl_opts = {
        'format': 'best[ext=mp4]/best',
        'quiet': True,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=False)
            stream_url = info['url']
            duration = info.get('duration', 0)
            is_live = info.get('is_live', False)
            
            return {
                "success": True,
                "stream_url": stream_url[:100] + "..." if len(stream_url) > 100 else stream_url,
                "title": info.get('title', ''),
                "duration": duration,
                "is_live": is_live,
                "formats_available": len(info.get('formats', [])),
            }
    except Exception as e:
        logger.error("YouTube URL test failed", url=youtube_url, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to resolve YouTube URL: {str(e)}"
        )


@router.websocket("/{stream_id}/ws")
async def analytics_websocket(stream_id: str, websocket: WebSocket):
    """WebSocket for real-time detection metadata and zone events."""
    from app.core.websocket_manager import websocket_manager
    
    # Verify stream exists
    manager = multi_stream_manager.get_stream(stream_id)
    if not manager:
        await websocket.close(code=1008, reason=f"Stream '{stream_id}' not found")
        return
        
    client_id = f"{stream_id}_{id(websocket)}"
    
    try:
        conn = await websocket_manager.connect(websocket, client_id)
        
        # Auto-subscribe to stream
        conn.stream_ids.add(stream_id)
        if stream_id not in websocket_manager.stream_subscribers:
            websocket_manager.stream_subscribers[stream_id] = set()
        websocket_manager.stream_subscribers[stream_id].add(client_id)
        
        logger.info("WebSocket connected", client_id=client_id, stream_id=stream_id)
        
        # Send initial stream status
        stats = manager.get_stats()
        await websocket.send_json({
            "type": "stream_status",
            "stream_id": stream_id,
            "status": stats["status"],
            "fps": stats["current_fps"],
            "frames_processed": stats["frames_processed"],
        })
        
        # The manager owns the receive loop for this socket; awaiting its task
        # keeps the connection open until the client disconnects.
        await conn.receive_task
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("WebSocket connection error", client_id=client_id, error=str(e))
    finally:
        await websocket_manager.disconnect(client_id)


# ============================================================================
# CALIBRATION ENDPOINT
# ============================================================================

from datetime import datetime
import io
from app.models import TrafficEvent, Zone

MAX_REPROJECTION_ERROR_M = 0.5  # meters


@router.post("/{stream_id}/calibrate", response_model=CalibrationResponse)
async def calibrate_stream(
    stream_id: str,
    request: CalibrationRequest,
):
    """
    Calibrate stream with 4+ ground control points.
    
    Request body: list of {pixel_x, pixel_y, world_x, world_y} points.
    World coordinates in meters (e.g., lane corners measured on site).
    
    Returns calibration matrix and reprojection error.
    Rejects if error > 0.5m.
    """
    manager = multi_stream_manager.get_stream(stream_id)
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stream '{stream_id}' not found"
        )
    
    # Validate minimum points
    if len(request.points) < 4:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least 4 calibration points required"
        )
    
    # Check for duplicate/near-duplicate pixel coordinates
    pixel_coords = [(p.pixel_x, p.pixel_y) for p in request.points]
    for i, p1 in enumerate(pixel_coords):
        for j, p2 in enumerate(pixel_coords[i+1:], i+1):
            dist = np.hypot(p1[0] - p2[0], p1[1] - p2[1])
            if dist < 5.0:  # pixels
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Points {i} and {j} are too close ({dist:.1f}px apart). Minimum 5px separation required."
                )
    
    # Compute homography
    calib = HomographyCalibrator()
    image_points = [(p.pixel_x, p.pixel_y) for p in request.points]
    world_points = [(p.world_x, p.world_y) for p in request.points]
    
    try:
        calib.set_reference_points(image_points, world_points)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Homography computation failed: {str(e)}"
        )
    
    if not calib.is_valid():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Homography computation failed - points may be collinear"
        )
    
    # Compute reprojection error
    img_pts = np.array(image_points, dtype=np.float32)
    world_pts = np.array(world_points, dtype=np.float32)
    projected = cv2.perspectiveTransform(img_pts.reshape(-1, 1, 2), calib.matrix)
    errors = np.linalg.norm(projected.reshape(-1, 2) - world_pts, axis=1)
    mean_error = float(np.mean(errors))
    max_error = float(np.max(errors))
    
    if mean_error > MAX_REPROJECTION_ERROR_M:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Calibration rejected: mean reprojection error {mean_error:.3f}m "
                f"(max {max_error:.3f}m) exceeds threshold {MAX_REPROJECTION_ERROR_M}m. "
                f"Please re-measure points and try again."
            )
        )
    
    # Save to database
    factory = get_session_factory()
    async with factory() as db:
        await db.execute(
            update(Stream)
            .where(Stream.streamId == stream_id)
            .values(
                homographyMatrix=calib.matrix.tolist(),
                calibrationPoints=[
                    {"pixel_x": p.pixel_x, "pixel_y": p.pixel_y, 
                     "world_x": p.world_x, "world_y": p.world_y}
                    for p in request.points
                ]
            )
        )
        await db.commit()
    
    # Pause pipeline during calibration if running
    pipeline = multi_pipeline.get_pipeline(stream_id)
    was_running = False
    if pipeline and pipeline.running:
        await pipeline.stop()
        was_running = True
    
    # Restart pipeline if it was running
    if was_running:
        await start_pipeline_for_stream(stream_id)
    
    return CalibrationResponse(
        success=True,
        reprojection_error_m=mean_error,
        matrix=calib.matrix.tolist(),
        message=f"Calibration saved. Mean reprojection error: {mean_error:.3f}m"
    )


# ============================================================================
# TMC EXPORT ENDPOINT
# ============================================================================

@router.get("/{stream_id}/tmc")
async def export_tmc(
    stream_id: str,
    start: Optional[str] = Query(None, description="Start timestamp (ISO 8601)"),
    end: Optional[str] = Query(None, description="End timestamp (ISO 8601)"),
    interval: int = Query(15, ge=1, le=60, description="Bin interval in minutes"),
    format: str = Query("csv", pattern="^(csv|json)$", description="Output format"),
):
    """
    Export Turning Movement Counts for a stream.
    
    Returns 15-min binned TMC CSV/JSON.
    Zone IDs must follow pattern: {APPROACH}_{MOVEMENT} (e.g., NB_left, SB_through)
    """
    manager = multi_stream_manager.get_stream(stream_id)
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stream '{stream_id}' not found"
        )
    
    # Parse timestamps
    start_dt = None
    end_dt = None
    if start:
        try:
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid start timestamp format. Use ISO 8601."
            )
    if end:
        try:
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid end timestamp format. Use ISO 8601."
            )
    
    # Query TrafficEvent from database
    factory = get_session_factory()
    async with factory() as db:
        query = select(TrafficEvent).where(TrafficEvent.zoneId != None)
        if start_dt:
            query = query.where(TrafficEvent.timestamp >= start_dt)
        if end_dt:
            query = query.where(TrafficEvent.timestamp <= end_dt)
        
        result = await db.execute(query)
        events = result.scalars().all()
    
    # Need zone info to get stream_id mapping
    # For now, we'll filter by zone's streamId
    # This requires joining Zone table - simplified for now
    zone_ids = [e.zoneId for e in events]
    
    # Get zones for this stream
    async with factory() as db:
        zone_result = await db.execute(
            select(Zone).where(Zone.streamId == stream_id)
        )
        stream_zones = {z.id: z for z in zone_result.scalars().all()}
    
    # Filter events to only this stream's zones
    stream_events = [e for e in events if e.zoneId in stream_zones]
    
    # Generate TMC
    gen = TMCGenerator(bin_minutes=interval)
    
    for event in stream_events:
        zone = stream_zones.get(event.zoneId)
        if not zone:
            continue
        
        # Parse zone_id for approach/movement (expects NB_left format)
        gen.add_event(
            timestamp=event.timestamp,
            zone_id=zone.id,  # We'll parse in TMCGenerator
            vehicle_class=event.vehicleClass,
            track_id=int(event.trackId) if event.trackId.isdigit() else hash(event.trackId) % 1000000,
        )
    
    if format == "json":
        # Return aggregated rows as JSON
        gen.generate_csv()  # This populates internal bins
        bins = gen._bins  # Access internal bins
        
        rows = []
        for bin_ts in sorted(bins.keys()):
            for approach in sorted(bins[bin_ts].keys()):
                for movement in sorted(bins[bin_ts][approach].keys()):
                    counts = bins[bin_ts][approach][movement]
                    rows.append({
                        "interval_start": bin_ts.isoformat(),
                        "approach": approach,
                        "movement": movement,
                        "car": counts.get("car", 0),
                        "truck": counts.get("truck", 0),
                        "bus": counts.get("bus", 0),
                        "motorcycle": counts.get("motorcycle", 0),
                        "pedestrian": counts.get("pedestrian", 0),
                        "bicycle": counts.get("bicycle", 0),
                    })
        return {"stream_id": stream_id, "interval_minutes": interval, "data": rows}
    
    # CSV response
    csv_content = gen.generate_csv()
    
    filename = f"tmc_{stream_id}"
    if start_dt:
        filename += f"_{start_dt.strftime('%Y%m%d')}"
    if end_dt:
        filename += f"_to_{end_dt.strftime('%Y%m%d')}"
    filename += ".csv"
    
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )
"""Multi-pipeline manager for running multiple camera pipelines simultaneously."""

import asyncio
from app.core.zone_sync import load_zones_for_pipeline
from app.core.zone_store import record_zone_events
from app.database.session import get_session_factory
from app.models import TrafficEvent, Zone
from sqlalchemy import update, select, func
from datetime import datetime, timezone
from typing import Dict, Optional, Callable, List
import structlog

from app.config import get_settings
from app.core.pipeline import Pipeline, PipelineConfig
from app.core.camera_fusion import CameraFusionEngine, FusionConfig, CameraView
from app.core.websocket_manager import websocket_manager

logger = structlog.get_logger()


class MultiPipeline:
    """Manages multiple camera pipelines with optional fusion."""

    def __init__(self):
        self.pipelines: Dict[str, Pipeline] = {}
        self.fusion = CameraFusionEngine()
        self._fusion_enabled = True
        self._tasks: Dict[str, asyncio.Task] = {}

    async def add_pipeline(
        self,
        stream_id: str,
        config: PipelineConfig,
        camera_view: Optional[CameraView] = None,
    ) -> Pipeline:
        """Add and start a pipeline for a stream."""
        if stream_id in self.pipelines:
            logger.warning("Pipeline already exists", stream_id=stream_id)
            return self.pipelines[stream_id]

        pipeline = Pipeline(
            config=config,
            event_callback=lambda events: self._on_events(stream_id, events),
            detections_callback=lambda dets, w, h: self._on_detections(stream_id, dets, w, h),
            stats_callback=lambda stats: self._on_stats(stream_id, stats),
        )

        await pipeline.initialize()
        self.pipelines[stream_id] = pipeline

        # Register camera for fusion
        self.fusion.register_camera(stream_id, camera_view)

        # Start pipeline
        await pipeline.start()
        logger.info("Pipeline added and started", stream_id=stream_id)
        return pipeline

    async def remove_pipeline(self, stream_id: str):
        """Stop and remove a pipeline."""
        if stream_id in self.pipelines:
            pipeline = self.pipelines[stream_id]
            await pipeline.stop()
            del self.pipelines[stream_id]
            self.fusion.unregister_camera(stream_id)
            logger.info("Pipeline removed", stream_id=stream_id)


    def _on_stats(self, stream_id: str, stats):
        """Handle stats updates from a pipeline."""
        from app.api.health import update_inference_fps, update_active_tracks
        update_inference_fps(stats.detection_fps)
        update_active_tracks(stats.active_tracks)

    def _on_detections(self, stream_id: str, detections: list[dict], frame_width: int, frame_height: int):
        """Handle raw detections from a pipeline."""
        payload = {
            "type": "detections",
            "detections": detections,
            "frame_width": frame_width,
            "frame_height": frame_height
        }
        asyncio.create_task(
            websocket_manager.broadcast_stream_data(
                stream_id,
                "detections",
                payload
            )
        )

    def _on_events(self, stream_id: str, events: list):
        """Handle zone events from a pipeline."""
        ws_events = []
        for event in events:
            event_data = {
                "track_id": event.track_id,
                "zone_id": event.zone_id,
                "class_id": event.class_id,
                "class_name": event.class_name,
                "timestamp": event.timestamp,
                "dwell_time_ms": event.dwell_ms,
                "bbox": event.bbox,
                "camera_id": stream_id,
                "event_type": event.event_type.value,
                "confidence": event.confidence if hasattr(event, 'confidence') else 1.0,
            }
            
            ws_events.append(event_data)
            
            websocket_manager.broadcast_event(
                stream_id=stream_id,
                event_type=event.event_type.value,
                data=event_data,
            )

            # Also broadcast to fusion channel
            if self._fusion_enabled:
                websocket_manager.broadcast_event(
                    stream_id="fusion",
                    event_type=event.event_type.value,
                    data=event_data,
                )

        if ws_events:
            asyncio.create_task(self._persist_events(ws_events))

    async def _persist_events(self, events: list[dict]):
        """Persist TrafficEvents to DB and aggregate Zone metrics."""
        factory = get_session_factory()
        async with factory() as db:
            zone_ids = set()
            try:
                for ev in events:
                    zone_id = ev.get("zone_id")
                    if not zone_id: continue
                    zone_ids.add(zone_id)
                    
                    db.add(TrafficEvent(
                        zoneId=zone_id,
                        trackId=str(ev.get("track_id")),
                        vehicleClass=ev.get("class_name"),
                        eventType=ev.get("event_type"),
                        confidence=int(ev.get("confidence", 0) * 100),
                        dwellTimeMs=int(ev.get("dwell_time_ms", 0)),
                        bbox=ev.get("bbox", []),
                        timestamp=datetime.now(timezone.utc)
                    ))
                await db.commit()
                
                # Update zone aggregates
                for zid in zone_ids:
                    count_res = await db.execute(select(func.count()).select_from(TrafficEvent).where((TrafficEvent.zoneId == zid) & (TrafficEvent.eventType == "entered")))
                    total_entries = count_res.scalar_one_or_none() or 0
                    
                    avg_res = await db.execute(select(func.avg(TrafficEvent.dwellTimeMs)).where((TrafficEvent.zoneId == zid) & (TrafficEvent.eventType == "dwell_exceeded")))
                    avg_dwell = avg_res.scalar_one_or_none() or 0.0
                    
                    await db.execute(update(Zone).where(Zone.id == zid).values(totalEntries=total_entries, avgDwellMs=avg_dwell))
                await db.commit()
            except Exception as e:
                logger.error("Failed to persist traffic events", error=str(e))
                await db.rollback()
                
        # Update Redis live state
        await record_zone_events(events)

    def get_pipeline(self, stream_id: str) -> Optional[Pipeline]:
        """Get a pipeline by stream ID."""
        return self.pipelines.get(stream_id)

    def get_all_stats(self) -> Dict[str, dict]:
        """Get stats for all pipelines."""
        stats = {}
        for stream_id, pipeline in self.pipelines.items():
            s = pipeline.stats
            stats[stream_id] = {
                "frames_processed": s.frames_processed,
                "detection_fps": s.detection_fps,
                "tracking_fps": s.tracking_fps,
                "latency_ms": s.total_latency_ms,
                "active_tracks": s.active_tracks,
                "status": "running" if pipeline._running else "stopped",
            }
        return stats

    def get_fusion_stats(self) -> dict:
        """Get fusion engine statistics."""
        return self.fusion.get_stats()

    async def stop_all(self):
        """Stop all pipelines."""
        for stream_id in list(self.pipelines.keys()):
            await self.remove_pipeline(stream_id)


# Global singleton
multi_pipeline = MultiPipeline()


async def start_pipeline_for_stream(stream_id: str) -> Pipeline:
    """Build a settings-driven detection pipeline for a stream and start it (idempotent)."""
    existing = multi_pipeline.get_pipeline(stream_id)
    if existing:
        return existing

    settings = get_settings()
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
    await load_zones_for_pipeline(pipeline, stream_id)
    return pipeline

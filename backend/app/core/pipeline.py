# Pipeline: Connects Ingestion → Detection → Tracking → Spatial
import asyncio
import time
import structlog
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor

from .stream_manager import multi_stream_manager, StreamManager
from .detector import EdgeDetector, Detection
from .tracker import ByteTrack, create_tracker
from .spatial import SpatialEngine, ZoneEvent, create_spatial_engine, Zone

logger = structlog.get_logger()


@dataclass
class PipelineConfig:
    """Configuration for the processing pipeline."""
    # Stream settings
    stream_id: str = "default"
    
    # Detector settings
    model_path: str = "models/yolov8n.onnx"
    conf_threshold: float = 0.25
    iou_threshold: float = 0.45
    input_size: tuple = (640, 640)
    
    # Tracker settings
    track_thresh: float = 0.5
    track_buffer: int = 30
    match_thresh: float = 0.8
    
    # Spatial settings
    hysteresis_frames: int = 3
    buffer_px: int = 3
    
    # Performance
    max_workers: int = 2
    target_fps: int = 30


@dataclass
class PipelineStats:
    """Pipeline performance statistics."""
    frames_processed: int = 0
    frames_dropped: int = 0
    detection_fps: float = 0.0
    tracking_fps: float = 0.0
    spatial_fps: float = 0.0
    total_latency_ms: float = 0.0
    last_update: float = 0.0
    active_tracks: int = 0
    zone_events: int = 0


class Pipeline:
    """
    End-to-end processing pipeline:
    StreamManager -> EdgeDetector -> ByteTrack -> SpatialEngine -> Events
    """
    
    def __init__(
        self,
        config: PipelineConfig,
        event_callback: Optional[Callable[[List[ZoneEvent]], None]] = None,
        detections_callback: Optional[Callable[[List[dict], int, int], None]] = None,
        stats_callback: Optional[Callable[[PipelineStats], None]] = None,
    ):
        self.config = config
        self.event_callback = event_callback
        self.detections_callback = detections_callback
        self.stats_callback = stats_callback
        
        # Components
        self.detector: Optional[EdgeDetector] = None
        self.tracker: Optional[ByteTrack] = None
        self.spatial: Optional[SpatialEngine] = None
        self.stream_manager: Optional[StreamManager] = None
        
        # Pipeline state
        self.running = False
        self._executor = ThreadPoolExecutor(max_workers=config.max_workers)
        self._frame_task: Optional[asyncio.Task] = None
        
        # Stats
        self.stats = PipelineStats()
        self._last_stats_report = time.time()
        self._frame_times: List[float] = []
        
    async def initialize(self):
        """Initialize all pipeline components."""
        logger.info("Initializing pipeline", stream_id=self.config.stream_id)
        
        # Detector
        self.detector = EdgeDetector(
            model_path=self.config.model_path,
            conf_threshold=self.config.conf_threshold,
            iou_threshold=self.config.iou_threshold,
            input_size=self.config.input_size,
        )
        logger.info("Detector initialized")

        from app.api.health import set_model_loaded
        set_model_loaded(True)
        
        # Tracker
        self.tracker = create_tracker(
            track_thresh=self.config.track_thresh,
            track_buffer=self.config.track_buffer,
            match_thresh=self.config.match_thresh,
        )
        logger.info("Tracker initialized")
        
        # Spatial engine
        self.spatial = create_spatial_engine(
            hysteresis_frames=self.config.hysteresis_frames,
            buffer_px=self.config.buffer_px,
        )
        logger.info("Spatial engine initialized")
        
        # Stream manager (get existing or create)
        self.stream_manager = multi_stream_manager.get_stream(self.config.stream_id)
        if not self.stream_manager:
            raise ValueError(f"Stream {self.config.stream_id} not found in manager")
            
        logger.info("Pipeline initialized", stream_id=self.config.stream_id)
        
    def add_zone(self, zone: Zone):
        """Add a monitoring zone."""
        self.spatial.add_zone(zone)
        logger.info("Zone added", zone_id=zone.zone_id)
        
    def remove_zone(self, zone_id: str):
        """Remove a monitoring zone."""
        self.spatial.remove_zone(zone_id)
        logger.info("Zone removed", zone_id=zone_id)
        
    async def start(self):
        """Start the processing pipeline."""
        if self.running:
            return
            
        self.running = True
        self._frame_task = asyncio.create_task(self._process_loop())
        logger.info("Pipeline started", stream_id=self.config.stream_id)
        
    async def stop(self):
        """Stop the processing pipeline."""
        self.running = False
        if self._frame_task:
            self._frame_task.cancel()
            try:
                await self._frame_task
            except asyncio.CancelledError:
                pass
        self._executor.shutdown(wait=True)
        logger.info("Pipeline stopped", stream_id=self.config.stream_id)
        
    async def _process_loop(self):
        """Main processing loop."""
        frame_interval = 1.0 / self.config.target_fps
        
        while self.running:
            start_time = time.perf_counter()
            
            try:
                # Get frame from stream manager
                frame = await self.stream_manager.get_frame(timeout=1.0)
                
                if frame is None:
                    await asyncio.sleep(0.001)
                    continue
                    
                # Run pipeline
                await self._process_frame(frame)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Pipeline error", error=str(e))
                await asyncio.sleep(0.1)
                
            # Rate limiting
            elapsed = time.perf_counter() - start_time
            sleep_time = max(0, frame_interval - elapsed)
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)
                
    async def _process_frame(self, frame):
        """Process a single frame through the pipeline."""
        frame_start = time.perf_counter()
        
        # 1. Detection
        det_start = time.perf_counter()
        detections = await asyncio.get_event_loop().run_in_executor(
            self._executor, self.detector.infer, frame
        )
        det_time = time.perf_counter() - det_start
        
        # 2. Convert to tracker format
        det_list = [
            {
                'bbox': det.bbox,
                'class_id': det.class_id,
                'confidence': det.confidence,
                'class_name': det.class_name,
            }
            for det in detections
        ]
        
        # 3. Tracking
        track_start = time.perf_counter()
        tracks = await asyncio.get_event_loop().run_in_executor(
            self._executor, self.tracker.update, det_list
        )
        track_time = time.perf_counter() - track_start
        
        # 4. Emit detections for live overlay (tracker output has stable track_ids)
        if self.detections_callback and tracks:
            h, w = frame.shape[:2]
            det_payload = []
            for track in tracks:
                # ByteTrack format: [x1, y1, x2, y2, track_id, score, class_id]
                if len(track) >= 7:
                    x1, y1, x2, y2, track_id, score, class_id = track[:7]
                    det_payload.append({
                        "bbox": [float(x1), float(y1), float(x2 - x1), float(y2 - y1)],
                        "class_id": int(class_id),
                        "confidence": float(score),
                        "class_name": self.detector.class_names[int(class_id)] if self.detector and int(class_id) < len(self.detector.class_names) else "unknown",
                        "track_id": int(track_id),
                    })
            if det_payload:
                try:
                    self.detections_callback(det_payload, w, h)
                except Exception as e:
                    logger.error("Detections callback error", error=str(e))
        
        # 6. Spatial evaluation
        spatial_start = time.perf_counter()
        events = await asyncio.get_event_loop().run_in_executor(
            self._executor, self.spatial.evaluate_tracks, tracks
        )
        spatial_time = time.perf_counter() - spatial_start
        
        # 7. Emit events
        if events and self.event_callback:
            try:
                self.event_callback(events)
            except Exception as e:
                logger.error("Event callback error", error=str(e))
                
        # 8. Update stats
        total_time = time.perf_counter() - frame_start
        self._update_stats(
            detections=len(detections),
            tracks=len(tracks),
            events=len(events),
            det_time=det_time * 1000,
            track_time=track_time * 1000,
            spatial_time=spatial_time * 1000,
            total_time=total_time * 1000,
        )
        
    def _update_stats(
        self,
        detections: int,
        tracks: int,
        events: int,
        det_time: float,
        track_time: float,
        spatial_time: float,
        total_time: float,
    ):
        """Update pipeline statistics."""
        self.stats.frames_processed += 1
        self.stats.active_tracks = tracks
        self.stats.zone_events += events
        self.stats.last_update = time.time()
        
        self._frame_times.append(total_time)
        if len(self._frame_times) > 100:
            self._frame_times.pop(0)
            
        if self._frame_times:
            self.stats.total_latency_ms = np.mean(self._frame_times)
            self.stats.detection_fps = 1000.0 / np.mean([det_time]) if det_time > 0 else 0
            self.stats.tracking_fps = 1000.0 / np.mean([track_time]) if track_time > 0 else 0
            self.stats.spatial_fps = 1000.0 / np.mean([spatial_time]) if spatial_time > 0 else 0
            
        # Periodic stats callback
        if time.time() - self._last_stats_report > 5.0:
            if self.stats_callback:
                try:
                    self.stats_callback(self.stats)
                except Exception as e:
                    logger.error("Stats callback error", error=str(e))
            self._last_stats_report = time.time()
            
    def get_stats(self) -> PipelineStats:
        return self.stats
    
    def get_detection_fps(self) -> float:
        return self.detector.get_fps() if self.detector else 0.0


# Import numpy for stats
import numpy as np
# Core Processing Package
from .stream_manager import (
    StreamManager, 
    StreamConfig, 
    StreamStatus, 
    StreamStats,
    MultiStreamManager,
    multi_stream_manager,
)

from .detector import EdgeDetector, Detection, create_detector

from .tracker import ByteTrack, Track, create_tracker

from .spatial import (
    SpatialEngine, 
    Zone, 
    ZoneEvent, 
    ZoneEventType, 
    TrackZoneState,
    create_spatial_engine,
)

from .pipeline import Pipeline, PipelineConfig, PipelineStats

from .websocket_manager import WebSocketManager, Connection, websocket_manager

__all__ = [
    # Stream
    "StreamManager",
    "StreamConfig", 
    "StreamStatus",
    "StreamStats",
    "MultiStreamManager",
    "multi_stream_manager",
    
    # Detector
    "EdgeDetector",
    "Detection",
    "create_detector",
    
    # Tracker
    "ByteTrack",
    "Track",
    "create_tracker",
    
    # Spatial
    "SpatialEngine",
    "Zone",
    "ZoneEvent",
    "ZoneEventType",
    "TrackZoneState",
    "create_spatial_engine",
    
    # Pipeline
    "Pipeline",
    "PipelineConfig",
    "PipelineStats",
    
    # WebSocket
    "WebSocketManager",
    "Connection",
    "websocket_manager",
]
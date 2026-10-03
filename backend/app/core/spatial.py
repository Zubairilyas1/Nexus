# SpatialEngine: Ray-casting zone detection with hysteresis and state machine
import numpy as np
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
import time


class ZoneEventType(Enum):
    ENTERED = "entered"
    EXITED = "exited"
    DWELL_EXCEEDED = "dwell_exceeded"


@dataclass
class Zone:
    """Monitoring zone with polygon coordinates."""
    zone_id: str
    coordinates: List[Tuple[float, float]]  # [(x1,y1), (x2,y2), ...]
    label: str = ""
    max_dwell_ms: int = 30000  # 30 seconds default
    buffer_px: int = 3  # Inner buffer to avoid edge jitter
    hysteresis_frames: int = 3  # Frames to confirm state change


@dataclass
class TrackZoneState:
    """Track state within a specific zone."""
    inside: bool = False
    entered_at: float = 0.0
    dwell_alerted: bool = False
    hysteresis_counter: int = 0
    last_inside: bool = False


@dataclass
class ZoneEvent:
    """Zone state change event."""
    event_type: ZoneEventType
    track_id: int
    zone_id: str
    class_id: int
    class_name: str
    timestamp: float
    dwell_ms: Optional[int] = None
    bbox: Optional[List[float]] = None


class SpatialEngine:
    """
    Ray-casting spatial engine for custom polygon zone monitoring.
    Features:
    - Even-odd ray-casting algorithm
    - Hysteresis/debouncing (N-frame confirmation)
    - Inner buffer to avoid edge jitter
    - Per-track zone state machine
    - Dwell time monitoring
    """
    
    def __init__(self, default_hysteresis: int = 3, default_buffer: int = 3):
        self.zones: Dict[str, Zone] = {}
        self.track_zone_states: Dict[int, Dict[str, TrackZoneState]] = defaultdict(dict)
        self.default_hysteresis = default_hysteresis
        self.default_buffer = default_buffer
        
    def add_zone(self, zone: Zone):
        """Add or update a monitoring zone."""
        if len(zone.coordinates) < 3:
            raise ValueError(f"Zone {zone.zone_id}: polygon must have at least 3 vertices")
        self.zones[zone.zone_id] = zone
        
    def remove_zone(self, zone_id: str):
        """Remove a zone."""
        if zone_id in self.zones:
            del self.zones[zone_id]
        # Clean up track states for this zone
        for track_states in self.track_zone_states.values():
            if zone_id in track_states:
                del track_states[zone_id]
                
    def get_zone(self, zone_id: str) -> Optional[Zone]:
        return self.zones.get(zone_id)
    
    def list_zones(self) -> List[Zone]:
        return list(self.zones.values())
    
    def _buffer_polygon(self, polygon: List[Tuple[float, float]], buffer_px: int) -> List[Tuple[float, float]]:
        """Shrink polygon inward by buffer_px using simple offset."""
        if buffer_px <= 0:
            return polygon
            
        # Simple approach: move each vertex toward centroid by buffer_px
        # For production, use shapely.buffer(-buffer_px)
        pts = np.array(polygon, dtype=np.float32)
        centroid = pts.mean(axis=0)
        
        # Direction from centroid to each vertex
        dirs = pts - centroid
        norms = np.linalg.norm(dirs, axis=1, keepdims=True)
        norms[norms == 0] = 1
        dirs = dirs / norms
        
        buffered = pts - dirs * buffer_px
        return [(float(x), float(y)) for x, y in buffered]
    
    def _point_in_polygon(self, point: Tuple[float, float], polygon: List[Tuple[float, float]]) -> bool:
        """
        Even-Odd Ray-Casting Algorithm.
        Returns True if point is inside polygon.
        """
        x, y = point
        n = len(polygon)
        if n < 3:
            return False
            
        inside = False
        p1x, p1y = polygon[0]
        
        for i in range(1, n + 1):
            p2x, p2y = polygon[i % n]
            
            # Check if ray intersects edge
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            x_intersect = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        else:
                            x_intersect = p1x
                        if p1x == p2x or x <= x_intersect:
                            inside = not inside
            p1x, p1y = p2x, p2y
            
        return inside
    
    def _is_point_in_zone(self, point: Tuple[float, float], zone: Zone) -> bool:
        """Check if point is in zone with buffer."""
        # Use buffered polygon for edge stability
        if zone.buffer_px > 0:
            buffered = self._buffer_polygon(zone.coordinates, zone.buffer_px)
        else:
            buffered = zone.coordinates
            
        return self._point_in_polygon(point, buffered)
    
    def _get_anchor_point(self, bbox: List[float]) -> Tuple[float, float]:
        """
        Get anchor point for zone checking.
        Uses bottom-center of bounding box (contact point with ground).
        """
        x1, y1, x2, y2 = bbox
        return ((x1 + x2) / 2.0, y2)  # bottom-center
    
    def evaluate_tracks(
        self, 
        tracks: List[Dict], 
        current_time: Optional[float] = None
    ) -> List[ZoneEvent]:
        """
        Evaluate all tracks against all zones.
        Returns list of zone events (ENTERED, EXITED, DWELL_EXCEEDED).
        """
        if current_time is None:
            current_time = time.time() * 1000  # ms
            
        events = []
        
        for track in tracks:
            track_id = track['track_id']
            bbox = track['bbox']
            class_id = track['class_id']
            class_name = track.get('class_name', f"class_{class_id}")
            
            # Get anchor point (bottom-center of bbox)
            anchor = self._get_anchor_point(bbox)
            
            # Initialize track zone states if needed
            if track_id not in self.track_zone_states:
                self.track_zone_states[track_id] = {}
                
            track_states = self.track_zone_states[track_id]
            
            # Evaluate each zone
            for zone_id, zone in self.zones.items():
                if zone_id not in track_states:
                    track_states[zone_id] = TrackZoneState()
                    
                state = track_states[zone_id]
                
                # Check if anchor is inside zone
                is_inside = self._is_point_in_zone(anchor, zone)
                
                # Hysteresis logic
                if is_inside == state.inside:
                    # Same state - increment/decrement counter
                    if is_inside:
                        state.hysteresis_counter = min(
                            state.hysteresis_counter + 1, 
                            zone.hysteresis_frames
                        )
                    else:
                        state.hysteresis_counter = max(
                            state.hysteresis_counter - 1, 
                            -zone.hysteresis_frames
                        )
                else:
                    # State changed - reset counter
                    state.hysteresis_counter = 1 if is_inside else -1
                    
                # Check if hysteresis threshold crossed
                confirmed_inside = state.hysteresis_counter >= zone.hysteresis_frames
                confirmed_outside = state.hysteresis_counter <= -zone.hysteresis_frames
                
                # State transitions
                if confirmed_inside and not state.inside:
                    # ENTERED event
                    state.inside = True
                    state.entered_at = current_time
                    state.dwell_alerted = False
                    state.hysteresis_counter = zone.hysteresis_frames
                    
                    events.append(ZoneEvent(
                        event_type=ZoneEventType.ENTERED,
                        track_id=track_id,
                        zone_id=zone_id,
                        class_id=track['class_id'],
                        class_name=class_name,
                        timestamp=current_time,
                        bbox=track['bbox'],
                    ))
                    
                elif confirmed_outside and state.inside:
                    # EXITED event
                    dwell_ms = int(current_time - state.entered_at)
                    state.inside = False
                    state.entered_at = 0
                    state.dwell_alerted = False
                    state.hysteresis_counter = -zone.hysteresis_frames
                    
                    events.append(ZoneEvent(
                        event_type=ZoneEventType.EXITED,
                        track_id=track_id,
                        zone_id=zone_id,
                        class_id=track['class_id'],
                        class_name=class_name,
                        timestamp=current_time,
                        dwell_ms=dwell_ms,
                        bbox=track['bbox'],
                    ))
                    
                elif state.inside:
                    # Check dwell time
                    dwell_ms = int(current_time - state.entered_at)
                    if (dwell_ms > zone.max_dwell_ms and 
                        not state.dwell_alerted):
                        state.dwell_alerted = True
                        
                        events.append(ZoneEvent(
                            event_type=ZoneEventType.DWELL_EXCEEDED,
                            track_id=track_id,
                            zone_id=zone_id,
                            class_id=track['class_id'],
                            class_name=class_name,
                            timestamp=current_time,
                            dwell_ms=dwell_ms,
                            bbox=track['bbox'],
                        ))
                        
        # Clean up states for tracks that no longer exist
        active_track_ids = {t['track_id'] for t in tracks}
        for track_id in list(self.track_zone_states.keys()):
            if track_id not in active_track_ids:
                # Track disappeared - if it was inside a zone, emit EXITED
                track_states = self.track_zone_states[track_id]
                for zone_id, state in track_states.items():
                    if state.inside:
                        zone = self.zones.get(zone_id)
                        if zone:
                            dwell_ms = int(current_time - state.entered_at)
                            events.append(ZoneEvent(
                                event_type=ZoneEventType.EXITED,
                                track_id=track_id,
                                zone_id=zone_id,
                                class_id=0,
                                class_name="unknown",
                                timestamp=current_time,
                                dwell_ms=dwell_ms,
                                bbox=None,
                            ))
                del self.track_zone_states[track_id]
                
        return events
    
    def get_zone_counts(self) -> Dict[str, int]:
        """Get current vehicle count per zone."""
        counts = {}
        for track_id, track_states in self.track_zone_states.items():
            for zone_id, state in track_states.items():
                if state.inside:
                    counts[zone_id] = counts.get(zone_id, 0) + 1
        return counts
    
    def get_zone_details(self, zone_id: str) -> Optional[Dict]:
        """Get detailed info about a zone."""
        zone = self.zones.get(zone_id)
        if not zone:
            return None
            
        inside_tracks = []
        for track_id, track_states in self.track_zone_states.items():
            if zone_id in track_states and track_states[zone_id].inside:
                state = track_states[zone_id]
                inside_tracks.append({
                    'track_id': track_id,
                    'entered_at': state.entered_at,
                    'dwell_ms': int(time.time() * 1000 - state.entered_at),
                })
                
        return {
            'zone_id': zone_id,
            'label': zone.label,
            'coordinates': zone.coordinates,
            'max_dwell_ms': zone.max_dwell_ms,
            'current_count': len(inside_tracks),
            'tracks': inside_tracks,
        }
    
    def clear_track(self, track_id: int):
        """Clear state for a specific track."""
        if track_id in self.track_zone_states:
            del self.track_zone_states[track_id]


def create_spatial_engine(
    hysteresis_frames: int = 3,
    buffer_px: int = 3,
) -> SpatialEngine:
    """Factory function to create SpatialEngine with defaults."""
    return SpatialEngine(
        default_hysteresis=hysteresis_frames,
        default_buffer=buffer_px,
    )
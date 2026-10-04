"""Track-length filter: suppress spurious short-lived tracks before zone events."""

from dataclasses import dataclass, field
from typing import Dict, Optional
import structlog

logger = structlog.get_logger()


@dataclass
class TrackState:
    """Minimal persistent state per track_id."""
    frames_seen: int = 0
    last_position: Optional[tuple] = None
    confirmed: bool = False


class TrackFilter:
    """
    Filters tracks by minimum persistence before allowing zone events.
    
    Integration pattern (in SpatialEngine.evaluate_tracks):
    
        # Before emitting events:
        confirmed_tracks = self.track_filter.filter(tracks)
        events = self._evaluate_confirmed_tracks(confirmed_tracks)
    
    Or as a decorator on the event callback:
        filtered_events = track_filter.filter_events(events)
    """
    
    def __init__(
        self,
        min_frames: int = 5,
        max_lost_frames: int = 10,
    ):
        """
        Args:
            min_frames: Minimum consecutive frames a track must exist before it's "confirmed".
            max_lost_frames: Frames to keep a track state after it disappears (for re-ID).
        """
        self.min_frames = min_frames
        self.max_lost_frames = max_lost_frames
        self.tracks: Dict[int, TrackState] = {}
        self._frame_counter = 0
    
    def update(self, tracks: list) -> Dict[int, TrackState]:
        """
        Update internal state with current frame's tracks.
        
        Args:
            tracks: List from ByteTrack/BoT-SORT, format [x1,y1,x2,y2,track_id,score,class_id]
        
        Returns:
            Dict of confirmed tracks {track_id: TrackState}
        """
        self._frame_counter += 1
        current_ids = set()
        
        for tr in tracks:
            if len(tr) < 5:
                continue
            track_id = int(tr[4])
            current_ids.add(track_id)
            
            state = self.tracks.get(track_id, TrackState())
            state.frames_seen += 1
            state.last_position = (tr[0], tr[1], tr[2], tr[3])  # bbox
            
            if state.frames_seen >= self.min_frames:
                state.confirmed = True
            
            self.tracks[track_id] = state
        
        # Age out lost tracks
        lost_ids = set(self.tracks.keys()) - current_ids
        for tid in lost_ids:
            state = self.tracks[tid]
            if self._frame_counter - state.frames_seen > self.max_lost_frames:
                del self.tracks[tid]
        
        return {tid: s for tid, s in self.tracks.items() if s.confirmed}
    
    def filter(self, tracks: list) -> list:
        """Return only confirmed tracks from the input list."""
        confirmed = self.update(tracks)
        confirmed_ids = set(confirmed.keys())
        return [tr for tr in tracks if len(tr) >= 5 and int(tr[4]) in confirmed_ids]
    
    def filter_events(self, events: list) -> list:
        """Filter zone events to only those from confirmed tracks."""
        confirmed = self.update([])  # just age out, no new tracks
        confirmed_ids = set(confirmed.keys())
        return [e for e in events if e.get("track_id") in confirmed_ids]
    
    def reset(self):
        """Clear all track state (call on stream restart)."""
        self.tracks.clear()
        self._frame_counter = 0
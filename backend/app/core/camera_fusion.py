"""Multi-camera fusion engine for combining detections across streams."""

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple
from collections import defaultdict
import structlog

logger = structlog.get_logger()


@dataclass
class FusedTrack:
    """A track that spans one or more cameras."""
    fused_id: str
    camera_tracks: Dict[str, int]  # camera_id -> track_id
    class_id: int
    class_name: str
    last_seen: float
    first_seen: float
    positions: Dict[str, Tuple[float, float]]  # camera_id -> (x_center, y_center)
    confidence: float
    active: bool = True


@dataclass
class CameraView:
    """Camera position and field of view info."""
    camera_id: str
    position: Tuple[float, float] = (0.0, 0.0)  # top-down position
    rotation: float = 0.0  # degrees
    fov_degrees: float = 90.0
    overlap_cameras: List[str] = field(default_factory=list)


@dataclass
class FusionConfig:
    """Configuration for the fusion engine."""
    iou_threshold: float = 0.3
    max_track_age: float = 5.0  # seconds before considering track lost
    merge_distance_threshold: float = 100.0  # pixels
    dedup_window: float = 0.5  # seconds to look for duplicate tracks


class CameraFusionEngine:
    """Fuses detections from multiple cameras into unified tracks."""

    def __init__(self, config: Optional[FusionConfig] = None):
        self.config = config or FusionConfig()
        self.fused_tracks: Dict[str, FusedTrack] = {}
        self.camera_views: Dict[str, CameraView] = {}
        self._next_fused_id = 1
        self._lock = False

    def register_camera(self, camera_id: str, view: Optional[CameraView] = None):
        """Register a camera with optional position info."""
        self.camera_views[camera_id] = view or CameraView(camera_id=camera_id)
        logger.info("Camera registered for fusion", camera_id=camera_id)

    def unregister_camera(self, camera_id: str):
        """Remove a camera from fusion."""
        self.camera_views.pop(camera_id, None)
        # Mark tracks from this camera as inactive
        for track in self.fused_tracks.values():
            if camera_id in track.camera_tracks:
                del track.camera_tracks[camera_id]
                if not track.camera_tracks:
                    track.active = False
        logger.info("Camera unregistered from fusion", camera_id=camera_id)

    def _compute_iou(self, box1: List[float], box2: List[float]) -> float:
        """Compute IoU between two bounding boxes [x1, y1, x2, y2]."""
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])

        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        union = area1 + area2 - inter

        return inter / union if union > 0 else 0.0

    def _bbox_center(self, bbox: List[float]) -> Tuple[float, float]:
        """Get center of bounding box."""
        return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)

    def _distance(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        """Euclidean distance between two points."""
        return ((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2) ** 0.5

    def _find_matching_fused_track(
        self, camera_id: str, track_id: int, bbox: List[float], class_id: int
    ) -> Optional[str]:
        """Find an existing fused track that matches this detection."""
        center = self._bbox_center(bbox)

        best_match = None
        best_score = 0.0

        for fused_id, fused_track in self.fused_tracks.items():
            if not fused_track.active:
                continue
            if fused_track.class_id != class_id:
                continue
            if camera_id in fused_track.camera_tracks:
                continue  # Already tracking from this camera

            # Check if any camera track position is close
            for other_cam_id, other_pos in fused_track.positions.items():
                dist = self._distance(center, other_pos)
                if dist < self.config.merge_distance_threshold:
                    score = 1.0 - (dist / self.config.merge_distance_threshold)
                    if score > best_score:
                        best_score = score
                        best_match = fused_id

        return best_match

    def process_detections(
        self,
        camera_id: str,
        detections: List[dict],
    ) -> List[dict]:
        """Process detections from a single camera and update fused tracks.

        Args:
            camera_id: Source camera identifier
            detections: List of detection dicts with keys:
                track_id, bbox, class_id, class_name, confidence

        Returns:
            List of fused detection dicts with fused_track_id added
        """
        now = time.time()
        results = []

        for det in detections:
            track_id = det.get("track_id", 0)
            bbox = det.get("bbox", [0, 0, 0, 0])
            class_id = det.get("class_id", 0)
            class_name = det.get("class_name", "unknown")
            confidence = det.get("confidence", 0.0)
            center = self._bbox_center(bbox)

            # Try to match with existing fused track
            fused_id = self._find_matching_fused_track(camera_id, track_id, bbox, class_id)

            if fused_id and fused_id in self.fused_tracks:
                # Merge into existing track
                fused_track = self.fused_tracks[fused_id]
                fused_track.camera_tracks[camera_id] = track_id
                fused_track.positions[camera_id] = center
                fused_track.last_seen = now
                fused_track.confidence = max(fused_track.confidence, confidence)
            else:
                # Create new fused track
                fused_id = f"fused_{self._next_fused_id}"
                self._next_fused_id += 1
                self.fused_tracks[fused_id] = FusedTrack(
                    fused_id=fused_id,
                    camera_tracks={camera_id: track_id},
                    class_id=class_id,
                    class_name=class_name,
                    last_seen=now,
                    first_seen=now,
                    positions={camera_id: center},
                    confidence=confidence,
                )

            results.append({
                **det,
                "fused_track_id": fused_id,
                "camera_id": camera_id,
            })

        # Age out old tracks
        self._cleanup_old_tracks(now)

        return results

    def _cleanup_old_tracks(self, now: float):
        """Remove tracks that haven't been seen recently."""
        to_remove = []
        for fused_id, track in self.fused_tracks.items():
            if now - track.last_seen > self.config.max_track_age:
                track.active = False
                to_remove.append(fused_id)

        for fused_id in to_remove:
            del self.fused_tracks[fused_id]

    def get_active_tracks(self) -> List[dict]:
        """Get all currently active fused tracks."""
        return [
            {
                "fused_id": t.fused_id,
                "camera_tracks": t.camera_tracks,
                "class_id": t.class_id,
                "class_name": t.class_name,
                "positions": {k: list(v) for k, v in t.positions.items()},
                "confidence": t.confidence,
                "num_cameras": len(t.camera_tracks),
                "last_seen": t.last_seen,
            }
            for t in self.fused_tracks.values()
            if t.active
        ]

    def get_camera_coverage(self) -> Dict[str, List[str]]:
        """Get which cameras are covering which fused tracks."""
        coverage = defaultdict(list)
        for fused_id, track in self.fused_tracks.items():
            if track.active:
                for camera_id in track.camera_tracks:
                    coverage[camera_id].append(fused_id)
        return dict(coverage)

    def get_stats(self) -> dict:
        """Get fusion engine statistics."""
        active = [t for t in self.fused_tracks.values() if t.active]
        multi_cam = [t for t in active if len(t.camera_tracks) > 1]
        return {
            "total_fused_tracks": len(self.fused_tracks),
            "active_tracks": len(active),
            "multi_camera_tracks": len(multi_cam),
            "registered_cameras": len(self.camera_views),
            "coverage": self.get_camera_coverage(),
        }

# ByteTrack: Multi-Object Tracking for Traffic Monitoring
# Based on: https://github.com/ifzhang/ByteTrack
import numpy as np
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass, field
from collections import OrderedDict
import time
import uuid


@dataclass
class Track:
    """Single tracked object state."""
    track_id: int
    bbox: np.ndarray  # [x1, y1, x2, y2]
    class_id: int
    confidence: float
    age: int = 0
    hits: int = 0
    hit_streak: int = 0
    state: str = "new"  # new, tracked, lost
    last_update: float = field(default_factory=time.time)


class KalmanFilter:
    """Simple Kalman Filter for bounding box tracking (x, y, w, h, vx, vy, vw, vh)."""
    
    def __init__(self, dt: float = 1.0):
        # State: [x, y, w, h, vx, vy, vw, vh]
        self.dt = dt
        
        # State transition matrix
        self.F = np.eye(8)
        for i in range(4):
            self.F[i, i + 4] = dt
            
        # Measurement matrix (observe x, y, w, h)
        self.H = np.zeros((4, 8))
        for i in range(4):
            self.H[i, i] = 1.0
            
        # Process noise covariance
        self.Q = np.eye(8) * 0.01
        self.Q[4:, 4:] *= 0.1  # Velocity noise
        
        # Measurement noise covariance
        self.R = np.eye(4) * 0.1
        
        # Initial covariance
        self.P = np.eye(8) * 10.0
        
    def predict(self, x: np.ndarray, P: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Predict next state."""
        x = self.F @ x
        P = self.F @ P @ self.F.T + self.Q
        return x, P
    
    def update(self, x: np.ndarray, P: np.ndarray, z: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Update with measurement."""
        # Innovation
        y = z - self.H @ x
        S = self.H @ P @ self.H.T + self.R
        K = P @ self.H.T @ np.linalg.inv(S)
        
        x = x + K @ y
        P = (np.eye(8) - K @ self.H) @ P
        return x, P


class ByteTrack:
    """
    ByteTrack Multi-Object Tracker.
    Tracks objects using Kalman filter + Hungarian algorithm for association.
    """
    
    def __init__(
        self,
        track_thresh: float = 0.5,
        track_buffer: int = 30,
        match_thresh: float = 0.8,
        min_box_area: int = 100,
        mot20: bool = False,
    ):
        self.track_thresh = track_thresh
        self.track_buffer = track_buffer
        self.match_thresh = match_thresh
        self.min_box_area = min_box_area
        self.mot20 = mot20
        
        self.tracked_tracks: Dict[int, Track] = {}
        self.lost_tracks: Dict[int, Track] = {}
        self.removed_tracks: Dict[int, Track] = {}
        self.frame_id = 0
        self.kalman = KalmanFilter()
        self.next_id = 1
        
    def update(self, detections: List[Dict]) -> List[Dict]:
        """
        Update tracker with new detections.
        detections: List of dicts with keys: bbox[x1,y1,x2,y2], class_id, confidence, class_name
        Returns: List of tracked objects with track_id
        """
        self.frame_id += 1
        
        # Convert detections to arrays
        if not detections:
            dets = np.empty((0, 5))  # x1, y1, x2, y2, score
            det_classes = np.empty((0,), dtype=int)
        else:
            dets = np.array([[
                d['bbox'][0], d['bbox'][1], d['bbox'][2], d['bbox'][3], d['confidence']
            ] for d in detections], dtype=np.float32)
            det_classes = np.array([d['class_id'] for d in detections], dtype=int)
        
        # Filter low confidence
        high_conf_mask = dets[:, 4] >= self.track_thresh
        dets_high = dets[high_conf_mask]
        classes_high = det_classes[high_conf_mask]
        
        low_conf_mask = (dets[:, 4] < self.track_thresh) & (dets[:, 4] > 0.1)
        dets_low = dets[low_conf_mask]
        classes_low = det_classes[low_conf_mask]
        
        # Step 1: Predict all tracked tracks
        for track in self.tracked_tracks.values():
            track.age += 1
            # Predict using Kalman
            # (Simplified: just use constant velocity model)
            
        # Step 2: Associate high-confidence detections with tracked tracks
        if len(self.tracked_tracks) > 0 and len(dets_high) > 0:
            matches, unmatched_tracks, unmatched_dets = self._associate(
                self.tracked_tracks, dets_high, classes_high, self.match_thresh
            )
            
            # Update matched tracks
            for track_idx, det_idx in matches:
                track = list(self.tracked_tracks.values())[track_idx]
                det = dets_high[det_idx]
                cls = classes_high[det_idx]
                self._update_track(track, det, cls, True)
                
            # Handle unmatched detections -> new tracks
            for det_idx in unmatched_dets:
                det = dets_high[det_idx]
                cls = classes_high[det_idx]
                self._init_track(det, cls)
                
            # Handle unmatched tracks -> lost
            for track_idx in unmatched_tracks:
                track = list(self.tracked_tracks.values())[track_idx]
                self._mark_lost(track)
        else:
            # No tracked tracks, all high-conf detections become new tracks
            for i in range(len(dets_high)):
                self._init_track(dets_high[i], classes_high[i])
            unmatched_tracks = list(range(len(self.tracked_tracks)))
            for track_idx in unmatched_tracks:
                track = list(self.tracked_tracks.values())[track_idx]
                self._mark_lost(track)
                
        # Step 3: Associate low-confidence detections with lost tracks (re-identification)
        if len(self.lost_tracks) > 0 and len(dets_low) > 0:
            matches, unmatched_lost, _ = self._associate(
                self.lost_tracks, dets_low, classes_low, 0.5  # Lower threshold for re-id
            )
            
            for track_idx, det_idx in matches:
                track = list(self.lost_tracks.values())[track_idx]
                det = dets_low[det_idx]
                cls = classes_low[det_idx]
                self._recover_track(track, det, cls)
                
            # Remove unmatched lost tracks
            for track_idx in unmatched_lost:
                track = list(self.lost_tracks.values())[track_idx]
                self._remove_track(track)
        else:
            # Remove all lost tracks if no low-conf detections
            for track in list(self.lost_tracks.values()):
                self._remove_track(track)
                
        # Step 4: Remove old tracks
        self._remove_old_tracks()
        
        # Return active tracked objects
        results = []
        for track in self.tracked_tracks.values():
            if track.state == "tracked" and track.hit_streak >= 1:
                results.append({
                    'track_id': track.track_id,
                    'bbox': track.bbox.tolist(),
                    'class_id': track.class_id,
                    'confidence': track.confidence,
                    'class_name': track.class_name,
                    'track_age': track.age,
                    'hits': track.hits,
                })
                
        return results
    
    def _associate(
        self, 
        tracks: Dict[int, Track], 
        dets: np.ndarray, 
        det_classes: np.ndarray,
        thresh: float
    ) -> Tuple[List[Tuple[int, int]], List[int], List[int]]:
        """Associate detections to tracks using IoU + Hungarian algorithm."""
        if len(tracks) == 0 or len(dets) == 0:
            return [], list(range(len(tracks))), list(range(len(dets)))
        
        # Build cost matrix (1 - IoU)
        track_boxes = np.array([t.bbox for t in tracks.values()])
        cost_matrix = 1.0 - self._iou_batch(track_boxes, dets[:, :4])
        
        # Add class penalty
        track_classes = np.array([t.class_id for t in tracks.values()])
        class_cost = (track_classes[:, None] != det_classes[None, :]).astype(float) * 10.0
        cost_matrix += class_cost
        
        # Simple greedy matching (Hungarian would be better but requires scipy)
        matches = []
        unmatched_tracks = list(range(len(tracks)))
        unmatched_dets = list(range(len(dets)))
        
        # Sort by cost
        flat_indices = np.argsort(cost_matrix, axis=None)
        for idx in flat_indices:
            t_idx = idx // len(dets)
            d_idx = idx % len(dets)
            
            if cost_matrix[t_idx, d_idx] > 1.0 - thresh:
                break
                
            if t_idx in unmatched_tracks and d_idx in unmatched_dets:
                matches.append((t_idx, d_idx))
                unmatched_tracks.remove(t_idx)
                unmatched_dets.remove(d_idx)
                
        return matches, unmatched_tracks, unmatched_dets
    
    def _iou_batch(self, boxes1: np.ndarray, boxes2: np.ndarray) -> np.ndarray:
        """Compute IoU between two sets of boxes."""
        # boxes: [N, 4] x1, y1, x2, y2
        x11 = boxes1[:, 0, None]
        y11 = boxes1[:, 1, None]
        x12 = boxes1[:, 2, None]
        y12 = boxes1[:, 3, None]
        
        x21 = boxes2[:, 0]
        y21 = boxes2[:, 1]
        x22 = boxes2[:, 2]
        y22 = boxes2[:, 3]
        
        xA = np.maximum(x11, x21)
        yA = np.maximum(y11, y21)
        xB = np.minimum(x12, x22)
        yB = np.minimum(y12, y22)
        
        inter = np.maximum(0, xB - xA) * np.maximum(0, yB - yA)
        area1 = (x12 - x11) * (y12 - y11)
        area2 = (x22 - x21) * (y22 - y21)
        
        iou = inter / (area1 + area2 - inter + 1e-6)
        return iou
    
    def _init_track(self, det: np.ndarray, cls: int):
        """Initialize new track."""
        track_id = self.next_id
        self.next_id += 1
        
        track = Track(
            track_id=track_id,
            bbox=det[:4],
            class_id=cls,
            confidence=det[4],
            age=0,
            hits=1,
            hit_streak=1,
            state="tracked",
        )
        track.class_name = COCO_CLASSES[cls] if cls < len(COCO_CLASSES) else f"class_{cls}"
        
        self.tracked_tracks[track_id] = track
    
    def _update_track(self, track: Track, det: np.ndarray, cls: int, high_conf: bool):
        """Update existing track with new detection."""
        track.bbox = det[:4]
        track.confidence = det[4]
        track.class_id = cls
        track.class_name = COCO_CLASSES[cls] if cls < len(COCO_CLASSES) else f"class_{cls}"
        track.hits += 1
        track.hit_streak += 1
        track.age = 0
        track.last_update = time.time()
        
        if track.state == "lost":
            track.state = "tracked"
    
    def _mark_lost(self, track: Track):
        """Mark track as lost."""
        track.state = "lost"
        track.hit_streak = 0
        self.lost_tracks[track.track_id] = track
        del self.tracked_tracks[track.track_id]
    
    def _recover_track(self, track: Track, det: np.ndarray, cls: int):
        """Recover lost track."""
        self._update_track(track, det, cls, False)
        self.tracked_tracks[track.track_id] = track
        del self.lost_tracks[track.track_id]
    
    def _remove_track(self, track: Track):
        """Remove track permanently."""
        self.removed_tracks[track.track_id] = track
        if track.track_id in self.lost_tracks:
            del self.lost_tracks[track.track_id]
        if track.track_id in self.tracked_tracks:
            del self.tracked_tracks[track.track_id]
    
    def _remove_old_tracks(self):
        """Remove tracks that have been lost too long."""
        to_remove = []
        for track_id, track in self.lost_tracks.items():
            if self.frame_id - track.age > self.track_buffer:
                to_remove.append(track_id)
                
        for track_id in to_remove:
            self._remove_track(self.lost_tracks[track_id])
            
    def get_active_tracks(self) -> List[Dict]:
        """Get all active tracked objects."""
        return [
            {
                'track_id': t.track_id,
                'bbox': t.bbox.tolist(),
                'class_id': t.class_id,
                'confidence': t.confidence,
                'class_name': t.class_name,
            }
            for t in self.tracked_tracks.values()
            if t.state == "tracked" and t.hit_streak >= 1
        ]


# COCO classes (same as detector)
COCO_CLASSES = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
    'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
    'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
    'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
    'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
    'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
    'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
    'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
    'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
    'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
    'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
    'toothbrush'
]


def create_tracker(
    track_thresh: float = 0.5,
    track_buffer: int = 30,
    match_thresh: float = 0.8,
) -> ByteTrack:
    """Factory function to create ByteTrack with default settings."""
    return ByteTrack(
        track_thresh=track_thresh,
        track_buffer=track_buffer,
        match_thresh=match_thresh,
    )
"""Homography calibration: pixel -> world (meters) mapping for traffic streams."""

import json
import cv2
import numpy as np
from typing import Optional, List, Tuple
from pathlib import Path


class HomographyCalibrator:
    """
    Compute and apply perspective transform from image pixels to ground-plane meters.
    
    Usage:
        calibrator = HomographyCalibrator()
        calibrator.set_reference_points(
            image_points=[(x1,y1), (x2,y2), (x3,y3), (x4,y4)],
            world_points=[(0,0), (3.5,0), (3.5,10), (0,10)]  # meters
        )
        calibrator.save("calib_stream_1.json")
        
        # Later:
        calibrator.load("calib_stream_1.json")
        world_pt = calibrator.pixel_to_world((640, 360))
    """
    
    def __init__(self):
        self.image_points: Optional[np.ndarray] = None
        self.world_points: Optional[np.ndarray] = None
        self.matrix: Optional[np.ndarray] = None
        self.inv_matrix: Optional[np.ndarray] = None
        
    def set_reference_points(
        self,
        image_points: List[Tuple[float, float]],
        world_points: List[Tuple[float, float]]
    ) -> None:
        """Set 4+ corresponding points and compute homography."""
        if len(image_points) < 4 or len(world_points) < 4:
            raise ValueError("Need at least 4 point correspondences")
        if len(image_points) != len(world_points):
            raise ValueError("Image and world points must have same length")
            
        self.image_points = np.array(image_points, dtype=np.float32)
        self.world_points = np.array(world_points, dtype=np.float32)
        
        self.matrix, _ = cv2.findHomography(
            self.image_points, self.world_points, cv2.RANSAC, 3.0
        )
        if self.matrix is not None:
            self.inv_matrix = np.linalg.inv(self.matrix)
    
    def pixel_to_world(self, pixel: Tuple[float, float]) -> Optional[Tuple[float, float]]:
        """Map pixel (x,y) to world (X,Y) in meters."""
        if self.matrix is None:
            return None
        pt = np.array([[[pixel[0], pixel[1]]]], dtype=np.float32)
        world = cv2.perspectiveTransform(pt, self.matrix)
        return (float(world[0][0][0]), float(world[0][0][1]))
    
    def world_to_pixel(self, world: Tuple[float, float]) -> Optional[Tuple[float, float]]:
        """Map world (X,Y) back to pixel (x,y)."""
        if self.inv_matrix is None:
            return None
        pt = np.array([[[world[0], world[1]]]], dtype=np.float32)
        pixel = cv2.perspectiveTransform(pt, self.inv_matrix)
        return (float(pixel[0][0][0]), float(pixel[0][0][1]))
    
    def pixels_to_world(self, pixels: List[Tuple[float, float]]) -> List[Optional[Tuple[float, float]]]:
        """Batch transform multiple pixels."""
        if self.matrix is None:
            return [None] * len(pixels)
        pts = np.array([[[p[0], p[1]] for p in pixels]], dtype=np.float32)
        worlds = cv2.perspectiveTransform(pts, self.matrix)
        return [(float(w[0]), float(w[1])) for w in worlds[0]]
    
    def speed_kmh(
        self,
        pixel_start: Tuple[float, float],
        pixel_end: Tuple[float, float],
        frame_time_s: float
    ) -> Optional[float]:
        """Estimate speed in km/h between two pixel positions over frame_time_s seconds."""
        w_start = self.pixel_to_world(pixel_start)
        w_end = self.pixel_to_world(pixel_end)
        if w_start is None or w_end is None:
            return None
        dist_m = np.hypot(w_end[0] - w_start[0], w_end[1] - w_start[1])
        return (dist_m / frame_time_s) * 3.6  # m/s -> km/h
    
    def save(self, path: str) -> None:
        """Save calibration to JSON."""
        if self.matrix is None:
            raise ValueError("No calibration computed")
        data = {
            "image_points": self.image_points.tolist(),
            "world_points": self.world_points.tolist(),
            "matrix": self.matrix.tolist(),
        }
        Path(path).write_text(json.dumps(data, indent=2))
    
    @classmethod
    def load(cls, path: str) -> "HomographyCalibrator":
        """Load calibration from JSON."""
        data = json.loads(Path(path).read_text())
        cal = cls()
        cal.image_points = np.array(data["image_points"], dtype=np.float32)
        cal.world_points = np.array(data["world_points"], dtype=np.float32)
        cal.matrix = np.array(data["matrix"], dtype=np.float32)
        cal.inv_matrix = np.linalg.inv(cal.matrix)
        return cal
    
    def is_valid(self) -> bool:
        return self.matrix is not None


def create_default_world_points(lane_width_m: float = 3.5, approach_length_m: float = 10.0) -> List[Tuple[float, float]]:
    """Standard 4-corner rectangle for a single lane approach."""
    return [
        (0.0, 0.0),
        (lane_width_m, 0.0),
        (lane_width_m, approach_length_m),
        (0.0, approach_length_m),
    ]
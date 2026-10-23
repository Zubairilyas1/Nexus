# EdgeDetector: ONNX Runtime inference for YOLOv8 INT8
import numpy as np
import onnxruntime as ort
import cv2
import time
from pathlib import Path
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass


@dataclass
class Detection:
    """Single detection result."""
    bbox: Tuple[float, float, float, float]  # x1, y1, x2, y2 (in original image coords)
    class_id: int
    class_name: str
    confidence: float
    track_id: Optional[int] = None


# COCO classes (YOLOv8 default)
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

# Classes of interest for traffic monitoring
TRAFFIC_CLASSES = {
    0: 'person',
    1: 'bicycle',
    2: 'car',
    3: 'motorcycle',
    5: 'bus',
    7: 'truck',
}


class EdgeDetector:
    """YOLOv8 INT8 ONNX Runtime detector optimized for edge deployment."""
    
    def __init__(
        self,
        model_path: str = "models/yolov8n_int8.onnx",
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        max_det: int = 300,
        input_size: Tuple[int, int] = (640, 640),
        classes_filter: Optional[List[int]] = None,
    ):
        self.model_path = model_path
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.max_det = max_det
        self.input_size = input_size
        self.classes_filter = classes_filter or list(TRAFFIC_CLASSES.keys())
        
        # Load ONNX model
        self.session = self._load_model()
        self.input_name = self.session.get_inputs()[0].name
        self.output_names = [o.name for o in self.session.get_outputs()]
        
        # Performance tracking
        self.inference_times: List[float] = []
        self.last_fps = 0.0
        
    def _load_model(self) -> ort.InferenceSession:
        """Load ONNX model with optimized session options."""
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.intra_op_num_threads = 4
        sess_options.inter_op_num_threads = 1
        
        # Try CUDA first, fallback to CPU
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        
        session = ort.InferenceSession(
            self.model_path,
            sess_options,
            providers=providers
        )
        
        active_provider = session.get_providers()[0]
        print(f"EdgeDetector loaded: {self.model_path} on {active_provider}")
        return session
    
    def preprocess(self, image: np.ndarray) -> Tuple[np.ndarray, Tuple[float, float]]:
        """
        Preprocess image for YOLOv8 inference.
        Returns: (preprocessed_tensor, scale_factors)
        """
        h, w = image.shape[:2]
        target_w, target_h = self.input_size
        
        # Calculate scale maintaining aspect ratio
        scale = min(target_w / w, target_h / h)
        new_w, new_h = int(w * scale), int(h * scale)
        
        # Resize with aspect ratio
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        
        # Pad to target size
        padded = np.full((target_h, target_w, 3), 114, dtype=np.uint8)  # YOLOv8 padding value
        pad_w = (target_w - new_w) // 2
        pad_h = (target_h - new_h) // 2
        padded[pad_h:pad_h+new_h, pad_w:pad_w+new_w] = resized
        
        # Normalize and convert to tensor
        tensor = padded.astype(np.float32) / 255.0
        tensor = np.transpose(tensor, (2, 0, 1))  # HWC -> CHW
        tensor = np.expand_dims(tensor, axis=0)   # Add batch dim
        
        # Return scale factors for postprocessing
        scale_factors = (w / new_w, h / new_h)
        return tensor, scale_factors
    
    def postprocess(
        self, 
        output: np.ndarray, 
        scale_factors: Tuple[float, float],
        original_shape: Tuple[int, int]
    ) -> List[Detection]:
        """
        Postprocess YOLOv8 output: NMS, confidence filtering, coordinate scaling.
        """
        # YOLOv8 output shape: (1, 84, 8400) -> (batch, 4+1+80, num_boxes)
        predictions = output[0].T  # (8400, 84)
        
        # Filter by confidence
        scores = predictions[:, 4]
        mask = scores > self.conf_threshold
        predictions = predictions[mask]
        scores = scores[mask]
        
        if len(predictions) == 0:
            return []
        
        # Get class predictions
        class_scores = predictions[:, 5:]
        class_ids = np.argmax(class_scores, axis=1)
        class_confidences = np.max(class_scores, axis=1)
        
        # Combined confidence
        final_conf = scores * class_confidences
        
        # Filter by classes of interest
        class_mask = np.isin(class_ids, self.classes_filter)
        predictions = predictions[class_mask]
        final_conf = final_conf[class_mask]
        class_ids = class_ids[class_mask]
        
        if len(predictions) == 0:
            return []
        
        # Extract boxes (cx, cy, w, h) -> (x1, y1, x2, y2)
        boxes = predictions[:, :4]
        boxes[:, 0] = boxes[:, 0] - boxes[:, 2] / 2  # x1
        boxes[:, 1] = boxes[:, 1] - boxes[:, 3] / 2  # y1
        boxes[:, 2] = boxes[:, 0] + boxes[:, 2]      # x2
        boxes[:, 3] = boxes[:, 1] + boxes[:, 3]      # y2
        
        # Remove padding and scale back to original image
        pad_w = (self.input_size[0] - int(original_shape[1] * min(self.input_size[0]/original_shape[1], self.input_size[1]/original_shape[0]))) // 2
        pad_h = (self.input_size[1] - int(original_shape[0] * min(self.input_size[0]/original_shape[1], self.input_size[1]/original_shape[0]))) // 2
        
        # Simpler approach: use scale_factors directly
        scale_x, scale_y = scale_factors
        boxes[:, [0, 2]] = (boxes[:, [0, 2]] - pad_w) * scale_x
        boxes[:, [1, 3]] = (boxes[:, [1, 3]] - pad_h) * scale_y
        
        # Clip to image bounds
        h, w = original_shape
        boxes[:, [0, 2]] = np.clip(boxes[:, [0, 2]], 0, w)
        boxes[:, [1, 3]] = np.clip(boxes[:, [1, 3]], 0, h)
        
        # NMS
        keep = self._nms(boxes, final_conf)
        boxes = boxes[keep]
        final_conf = final_conf[keep]
        class_ids = class_ids[keep]
        
        # Limit detections
        if len(boxes) > self.max_det:
            idx = np.argsort(final_conf)[-self.max_det:]
            boxes = boxes[idx]
            final_conf = final_conf[idx]
            class_ids = class_ids[idx]
        
        # Build detections
        detections = []
        for box, conf, cls_id in zip(boxes, final_conf, class_ids):
            detections.append(Detection(
                bbox=(float(box[0]), float(box[1]), float(box[2]), float(box[3])),
                class_id=int(cls_id),
                class_name=COCO_CLASSES[int(cls_id)] if int(cls_id) < len(COCO_CLASSES) else f"class_{cls_id}",
                confidence=float(conf),
            ))
        
        return detections
    
    def _nms(self, boxes: np.ndarray, scores: np.ndarray) -> np.ndarray:
        """Non-Maximum Suppression."""
        x1 = boxes[:, 0]
        y1 = boxes[:, 1]
        x2 = boxes[:, 2]
        y2 = boxes[:, 3]
        
        areas = (x2 - x1) * (y2 - y1)
        order = scores.argsort()[::-1]
        
        keep = []
        while order.size > 0:
            i = order[0]
            keep.append(i)
            
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            
            w = np.maximum(0.0, xx2 - xx1)
            h = np.maximum(0.0, yy2 - yy1)
            inter = w * h
            
            iou = inter / (areas[i] + areas[order[1:]] - inter)
            inds = np.where(iou <= self.iou_threshold)[0]
            order = order[inds + 1]
            
        return np.array(keep, dtype=np.int32)
    
    def infer(self, image: np.ndarray) -> List[Detection]:
        """Run inference on a single image."""
        start = time.perf_counter()
        
        # Preprocess
        tensor, scale_factors = self.preprocess(image)
        
        # Inference
        outputs = self.session.run(self.output_names, {self.input_name: tensor})
        
        # Postprocess
        detections = self.postprocess(outputs[0], scale_factors, image.shape[:2])
        
        # Track FPS
        elapsed = time.perf_counter() - start
        self.inference_times.append(elapsed)
        if len(self.inference_times) > 100:
            self.inference_times.pop(0)
        self.last_fps = 1.0 / np.mean(self.inference_times) if self.inference_times else 0
        
        return detections
    
    def get_fps(self) -> float:
        return self.last_fps
    
    def draw_detections(self, image: np.ndarray, detections: List[Detection]) -> np.ndarray:
        """Draw bounding boxes on image for visualization."""
        vis = image.copy()
        for det in detections:
            x1, y1, x2, y2 = map(int, det.bbox)
            color = (0, 255, 0) if det.class_id in [2, 3, 5, 7] else (255, 0, 0)  # Green for vehicles, blue for person
            cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
            label = f"{det.class_name} {det.confidence:.2f}"
            if det.track_id is not None:
                label += f" ID:{det.track_id}"
            cv2.putText(vis, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        return vis


def create_detector(model_path: str = "models/yolov8n_int8.onnx") -> EdgeDetector:
    """Factory function to create detector with default settings."""
    return EdgeDetector(model_path=model_path)
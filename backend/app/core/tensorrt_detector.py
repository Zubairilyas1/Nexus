"""TensorRT detector for edge-optimized inference."""

import time
from typing import List, Optional, Tuple
import structlog

from app.core.detector import Detection

logger = structlog.get_logger()

_HAS_TENSORRT = False
try:
    import tensorrt as trt
    import pycuda.driver as cuda
    import pycuda.autoinit
    _HAS_TENSORRT = True
except ImportError:
    pass


class TensorRTDetector:
    """YOLOv8 detector using TensorRT for fast inference."""

    def __init__(
        self,
        engine_path: str,
        input_size: Tuple[int, int] = (640, 640),
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        class_filter: Optional[List[int]] = None,
    ):
        if not _HAS_TENSORRT:
            raise ImportError(
                "TensorRT not available. Install tensorrt, pycuda: "
                "pip install tensorrt pycuda"
            )

        self.engine_path = engine_path
        self.input_size = input_size
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.class_filter = class_filter or [0, 1, 2, 3, 5, 7]
        self.class_names = {
            0: "person", 1: "bicycle", 2: "car", 3: "motorcycle",
            5: "bus", 7: "truck",
        }

        self._engine = None
        self._context = None
        self._inputs = None
        self._outputs = None
        self._stream = None
        self._fps = 0.0
        self._frame_count = 0
        self._last_fps_time = time.time()

    def initialize(self) -> None:
        """Load TensorRT engine and prepare for inference."""
        logger.info("Loading TensorRT engine", path=self.engine_path)

        logger_ptr = trt.Logger(trt.Logger.WARNING)
        with open(self.engine_path, "rb") as f:
            runtime = trt.Runtime(logger_ptr)
            self._engine = runtime.deserialize_cuda_engine(f.read())

        self._context = self._engine.create_execution_context()
        self._stream = cuda.Stream()

        # Allocate buffers
        self._inputs = []
        self._outputs = []
        self._bindings = []

        for i in range(self._engine.num_io_tensors):
            name = self._engine.get_tensor_name(i)
            dtype = trt.nptype(self._engine.get_tensor_dtype(name))
            shape = self._engine.get_tensor_shape(name)
            size = trt.volume(shape)
            host_mem = cuda.pagelocked_empty(size, dtype)
            device_mem = cuda.mem_alloc(host_mem.nbytes)

            self._bindings.append(int(device_mem))

            if self._engine.get_tensor_mode(name) == trt.TensorIOMode.INPUT:
                self._inputs.append({"host": host_mem, "device": device_mem, "shape": shape, "dtype": dtype})
            else:
                self._outputs.append({"host": host_mem, "device": device_mem, "shape": shape, "dtype": dtype})

        logger.info("TensorRT engine loaded", bindings=len(self._bindings))

    def infer(self, frame) -> List[Detection]:
        """Run inference on a frame."""
        import numpy as np
        import cv2

        if self._engine is None:
            self.initialize()

        # Preprocess
        img, ratio, pad = self._preprocess(frame)
        np.copyto(self._inputs[0]["host"], img.ravel())

        # Transfer input to GPU
        for inp in self._inputs:
            cuda.memcpy_htod_async(inp["device"], inp["host"], self._stream)
            self._context.set_tensor_address(inp["device"], inp["host"], self._stream)

        # Run inference
        self._context.execute_async_v3(stream_handle=self._stream.handle)

        # Transfer output back
        for out in self._outputs:
            cuda.memcpy_dtoh_async(out["host"], out["device"], self._stream)

        self._stream.synchronize()

        # Postprocess
        output = self._outputs[0]["host"].reshape(self._outputs[0]["shape"])
        detections = self._postprocess(output, ratio, pad, frame.shape)

        # FPS tracking
        self._frame_count += 1
        now = time.time()
        if now - self._last_fps_time >= 1.0:
            self._fps = self._frame_count / (now - self._last_fps_time)
            self._frame_count = 0
            self._last_fps_time = now

        return detections

    def _preprocess(self, frame):
        """Letterbox resize and normalize."""
        import numpy as np
        import cv2

        h, w = frame.shape[:2]
        r = min(self.input_size[0] / h, self.input_size[1] / w)
        new_unpad = (int(round(w * r)), int(round(h * r)))
        dw = (self.input_size[1] - new_unpad[0]) / 2
        dh = (self.input_size[0] - new_unpad[1]) / 2

        if (w, h) != new_unpad:
            frame = cv2.resize(frame, new_unpad, interpolation=cv2.INTER_LINEAR)

        top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
        left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
        frame = cv2.copyMakeBorder(frame, top, bottom, left, right,
                                    cv2.BORDER_CONSTANT, value=(114, 114, 114))

        frame = frame[:, :, ::-1].transpose(2, 0, 1).astype(np.float32) / 255.0
        frame = np.expand_dims(frame, axis=0)
        frame = np.ascontiguousarray(frame)

        return frame, r, (dw, dh)

    def _postprocess(self, output, ratio, pad, orig_shape):
        """Parse YOLOv8 output."""
        import numpy as np

        preds = output[0]
        boxes = preds[:, :4]
        scores = preds[:, 4:]
        max_scores = scores.max(axis=1)
        class_ids = scores.argmax(axis=1)

        # Filter by confidence and class
        mask = (max_scores >= self.conf_threshold) & (np.isin(class_ids, self.class_filter))
        boxes = boxes[mask]
        max_scores = max_scores[mask]
        class_ids = class_ids[mask]

        if len(boxes) == 0:
            return []

        # Convert xywh to xyxy
        x1 = boxes[:, 0] - boxes[:, 2] / 2
        y1 = boxes[:, 1] - boxes[:, 3] / 2
        x2 = boxes[:, 0] + boxes[:, 2] / 2
        y2 = boxes[:, 1] + boxes[:, 3] / 2

        # Scale to original image
        x1 = (x1 - pad[0]) / ratio
        y1 = (y1 - pad[1]) / ratio
        x2 = (x2 - pad[0]) / ratio
        y2 = (y2 - pad[1]) / ratio

        # Clip
        h, w = orig_shape[:2]
        x1 = np.clip(x1, 0, w)
        y1 = np.clip(y1, 0, h)
        x2 = np.clip(x2, 0, w)
        y2 = np.clip(y2, 0, h)

        # NMS
        indices = self._nms(x1, y1, x2, y2, max_scores, self.iou_threshold)

        detections = []
        for i in indices:
            detections.append(Detection(
                bbox=[float(x1[i]), float(y1[i]), float(x2[i]), float(y2[i])],
                class_id=int(class_ids[i]),
                class_name=self.class_names.get(class_ids[i], "unknown"),
                confidence=float(max_scores[i]),
            ))

        return detections

    def _nms(self, x1, y1, x2, y2, scores, iou_threshold):
        """Non-maximum suppression."""
        import numpy as np

        areas = (x2 - x1) * (y2 - y1)
        order = scores.argsort()[::-1]
        keep = []

        while len(order) > 0:
            i = order[0]
            keep.append(i)
            if len(order) == 1:
                break

            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])

            inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
            iou = inter / (areas[i] + areas[order[1:]] - inter)

            inds = np.where(iou <= iou_threshold)[0]
            order = order[inds + 1]

        return keep

    @property
    def fps(self) -> float:
        return self._fps

    def cleanup(self) -> None:
        """Release TensorRT resources."""
        if self._context:
            del self._context
        if self._engine:
            del self._engine
        if self._stream:
            self._stream.synchronize()
            del self._stream

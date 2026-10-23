# YOLOv8 Quantization Pipeline: PyTorch FP32 -> ONNX FP32 -> INT8
# Run: python -m backend.core.quantization

import os
import torch
import numpy as np
import cv2
from pathlib import Path
from typing import List
from ultralytics import YOLO
import onnx
import onnxruntime as ort
from onnxruntime.quantization import quantize_static, CalibrationDataReader, QuantType, QuantFormat


MODEL_DIR = Path(__file__).parent.parent / "models"
CALIB_DIR = Path(__file__).parent.parent / "calib_images"

PT_MODEL = MODEL_DIR / "yolov8n.pt"
ONNX_FP32 = MODEL_DIR / "yolov8n.onnx"
ONNX_INT8 = MODEL_DIR / "yolov8n_int8.onnx"
INPUT_SHAPE = (1, 3, 640, 640)
CALIB_SAMPLES = 500


class YOLOCalibrationDataReader(CalibrationDataReader):
    """Calibration data reader for ONNX Runtime static quantization."""
    
    def __init__(self, calib_dir: Path, input_name: str, max_samples: int = CALIB_SAMPLES):
        self.input_name = input_name
        self.max_samples = max_samples
        self.samples: List[dict] = []
        self._load_calibration_data(calib_dir)
        self.enum_data = None
        
    def _load_calibration_data(self, calib_dir: Path):
        """Load and preprocess calibration images."""
        image_files = list(calib_dir.glob("*.jpg")) + list(calib_dir.glob("*.png"))
        image_files = image_files[:self.max_samples]
        
        if not image_files:
            print(f"Warning: No calibration images found in {calib_dir}")
            print("Using synthetic calibration data...")
            self._generate_synthetic_data()
            return
            
        print(f"Loading {len(image_files)} calibration images...")
        for img_path in image_files:
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img = cv2.resize(img, (640, 640))
            img = img.astype(np.float32) / 255.0
            img = np.transpose(img, (2, 0, 1))  # HWC -> CHW
            img = np.expand_dims(img, axis=0)  # Add batch dim
            self.samples.append({self.input_name: img})
            
        if not self.samples:
            print("No valid images loaded, generating synthetic data...")
            self._generate_synthetic_data()
            
    def _generate_synthetic_data(self):
        """Generate synthetic calibration data as fallback."""
        print("Generating synthetic calibration data...")
        for _ in range(min(100, self.max_samples)):
            img = np.random.rand(*INPUT_SHAPE).astype(np.float32)
            self.samples.append({self.input_name: img})
            
    def get_next(self):
        if self.enum_data is None:
            self.enum_data = iter(self.samples)
        return next(self.enum_data, None)
        
    def rewind(self):
        self.enum_data = None


def export_onnx_fp32(pt_path: Path, onnx_path: Path) -> bool:
    """Export PyTorch YOLOv8 to ONNX FP32."""
    print(f"Exporting {pt_path} -> {onnx_path} (FP32)...")
    
    if not pt_path.exists():
        print(f"Downloading YOLOv8n...")
        # This will auto-download yolov8n.pt
        model = YOLO("yolov8n.pt")
    else:
        model = YOLO(str(pt_path))
    
    # Export to ONNX
    model.export(
        format="onnx",
        opset=17,
        imgsz=640,
        simplify=True,
        dynamic=False,  # Static shapes required for INT8
        half=False,     # FP32
    )
    
    # Move to models dir if needed
    exported = Path("yolov8n.onnx")
    if exported.exists() and exported != onnx_path:
        exported.rename(onnx_path)
        
    # Validate
    onnx_model = onnx.load(str(onnx_path))
    onnx.checker.check_model(onnx_model)
    print(f"ONNX FP32 model validated: {onnx_path}")
    return True


def quantize_to_int8(onnx_fp32: Path, onnx_int8: Path, calib_dir: Path) -> bool:
    """Quantize ONNX FP32 to INT8 using static quantization."""
    print(f"Quantizing {onnx_fp32} -> {onnx_int8} (INT8)...")
    
    # Get input name from model
    session = ort.InferenceSession(str(onnx_fp32), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    
    # Create calibration data reader
    calib_reader = YOLOCalibrationDataReader(calib_dir, input_name)
    
    # Static quantization (QDQ format, per-channel)
    quantize_static(
        model_input=str(onnx_fp32),
        model_output=str(onnx_int8),
        calibration_data_reader=calib_reader,
        quant_format=QuantFormat.QDQ,  # Quantize-DeQuantize format
        weight_type=QuantType.QInt8,
        activation_type=QuantType.QInt8,
        per_channel=True,
        reduce_range=False,
        )
    
    # Validate quantized model
    onnx_model = onnx.load(str(onnx_int8))
    onnx.checker.check_model(onnx_model)
    
    # Size comparison
    fp32_size = onnx_fp32.stat().st_size / 1024 / 1024
    int8_size = onnx_int8.stat().st_size / 1024 / 1024
    print(f"FP32 size: {fp32_size:.1f} MB")
    print(f"INT8 size: {int8_size:.1f} MB")
    print(f"Reduction: {fp32_size/int8_size:.1f}x")
    
    return True


def benchmark_model(onnx_path: Path, num_runs: int = 100) -> dict:
    """Benchmark ONNX model inference speed."""
    print(f"Benchmarking {onnx_path.name}...")
    
    session = ort.InferenceSession(
        str(onnx_path),
        providers=["CPUExecutionProvider"]
    )
    input_name = session.get_inputs()[0].name
    
    # Warmup
    dummy = np.random.rand(*INPUT_SHAPE).astype(np.float32)
    for _ in range(10):
        session.run(None, {input_name: dummy})
    
    # Benchmark
    import time
    times = []
    for _ in range(num_runs):
        start = time.perf_counter()
        session.run(None, {input_name: dummy})
        times.append(time.perf_counter() - start)
    
    times = np.array(times[10:])  # Drop first 10
    return {
        "mean_ms": np.mean(times) * 1000,
        "std_ms": np.std(times) * 1000,
        "min_ms": np.min(times) * 1000,
        "max_ms": np.max(times) * 1000,
        "fps": 1.0 / np.mean(times),
    }


def download_yolov8n():
    """Download YOLOv8n if not present."""
    if not PT_MODEL.exists():
        print(f"Downloading YOLOv8n to {PT_MODEL}...")
        model = YOLO("yolov8n.pt")  # Auto-downloads
        # Move to models dir
        downloaded = Path("yolov8n.pt")
        if downloaded.exists() and downloaded != PT_MODEL:
            downloaded.rename(PT_MODEL)
    return PT_MODEL.exists()


def main():
    print("=" * 60)
    print("NexusVision YOLOv8 Quantization Pipeline")
    print("=" * 60)
    
    # Step 1: Ensure PyTorch model exists
    if not download_yolov8n():
        print("Failed to get YOLOv8n model")
        return
    
    # Step 2: Export to ONNX FP32
    if not ONNX_FP32.exists():
        export_onnx_fp32(PT_MODEL, ONNX_FP32)
    else:
        print(f"ONNX FP32 already exists: {ONNX_FP32}")
    
    # Step 3: Quantize to INT8
    if not ONNX_INT8.exists():
        quantize_to_int8(ONNX_FP32, ONNX_INT8, CALIB_DIR)
    else:
        print(f"INT8 model already exists: {ONNX_INT8}")
    
    # Step 4: Benchmark both
    print("\n" + "=" * 60)
    print("BENCHMARK RESULTS")
    print("=" * 60)
    
    fp32_results = benchmark_model(ONNX_FP32)
    print(f"\nFP32 Model:")
    print(f"  Mean: {fp32_results['mean_ms']:.1f} ms")
    print(f"  FPS:  {fp32_results['fps']:.1f}")
    
    int8_results = benchmark_model(ONNX_INT8)
    print(f"\nINT8 Model:")
    print(f"  Mean: {int8_results['mean_ms']:.1f} ms")
    print(f"  FPS:  {int8_results['fps']:.1f}")
    
    speedup = fp32_results['mean_ms'] / int8_results['mean_ms']
    print(f"\nSpeedup: {speedup:.1f}x")
    print(f"Target: >= 30 FPS on CPU - {'PASS' if int8_results['fps'] >= 30 else 'NEEDS OPTIMIZATION'}")


if __name__ == "__main__":
    main()
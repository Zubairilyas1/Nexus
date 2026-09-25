"""Model export pipeline for ONNX and TensorRT conversion."""

import time
from pathlib import Path
from typing import Optional, Dict, Any
import structlog

logger = structlog.get_logger()


def export_onnx_fp32(
    model_name: str = "yolov8n",
    output_dir: str = "models",
    img_size: int = 640,
) -> str:
    """Export YOLOv8 model to ONNX FP32 format.

    Args:
        model_name: YOLOv8 model variant (n/s/m/l/x)
        output_dir: Directory to save the ONNX model
        img_size: Input image size

    Returns:
        Path to the exported ONNX model
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        raise ImportError("ultralytics required: pip install ultralytics")

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    logger.info("Exporting YOLOv8 to ONNX FP32", model=model_name, img_size=img_size)

    model = YOLO(f"{model_name}.pt")
    onnx_path = str(output_path / f"{model_name}.onnx")

    model.export(
        format="onnx",
        imgsz=img_size,
        simplify=True,
        opset=12,
    )

    logger.info("ONNX FP32 export complete", path=onnx_path)
    return onnx_path


def quantize_to_int8(
    onnx_path: str,
    output_path: Optional[str] = None,
    calibration_data_dir: Optional[str] = None,
    num_calib_images: int = 100,
) -> str:
    """Quantize ONNX model to INT8 using QDQ format.

    Args:
        onnx_path: Path to FP32 ONNX model
        output_path: Path for INT8 model (default: same dir with _int8 suffix)
        calibration_data_dir: Directory with calibration images
        num_calib_images: Number of images for calibration

    Returns:
        Path to the INT8 ONNX model
    """
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
    except ImportError:
        raise ImportError("onnxruntime required: pip install onnxruntime")

    if output_path is None:
        p = Path(onnx_path)
        output_path = str(p.parent / f"{p.stem}_int8{p.suffix}")

    logger.info("Quantizing to INT8", input=onnx_path, output=output_path)

    quantize_dynamic(
        model_input=onnx_path,
        model_output=output_path,
        weight_type=QuantType.QInt8,
    )

    logger.info("INT8 quantization complete", path=output_path)
    return output_path


def benchmark_model(
    model_path: str,
    input_size: tuple = (1, 3, 640, 640),
    num_runs: int = 100,
    warmup_runs: int = 10,
) -> Dict[str, float]:
    """Benchmark model inference speed.

    Args:
        model_path: Path to ONNX model
        input_size: Input tensor shape
        num_runs: Number of inference runs
        warmup_runs: Warmup runs before timing

    Returns:
        Dict with mean_ms, min_ms, max_ms, fps
    """
    try:
        import onnxruntime as ort
        import numpy as np
    except ImportError:
        raise ImportError("onnxruntime required: pip install onnxruntime")

    logger.info("Benchmarking model", path=model_path, runs=num_runs)

    session = ort.InferenceSession(model_path)
    input_name = session.get_inputs()[0].name

    # Warmup
    dummy = np.random.randn(*input_size).astype(np.float32)
    for _ in range(warmup_runs):
        session.run(None, {input_name: dummy})

    # Benchmark
    times = []
    for _ in range(num_runs):
        start = time.perf_counter()
        session.run(None, {input_name: dummy})
        times.append((time.perf_counter() - start) * 1000)

    results = {
        "mean_ms": sum(times) / len(times),
        "min_ms": min(times),
        "max_ms": max(times),
        "fps": 1000.0 / (sum(times) / len(times)),
    }

    logger.info("Benchmark complete", **results)
    return results


def convert_onnx_to_tensorrt(
    onnx_path: str,
    output_path: Optional[str] = None,
    fp16: bool = True,
    int8: bool = False,
    max_batch_size: int = 1,
) -> str:
    """Convert ONNX model to TensorRT engine.

    Requires: pip install tensorrt

    Args:
        onnx_path: Path to ONNX model
        output_path: Path for TensorRT engine (default: same dir with .plan extension)
        fp16: Enable FP16 mode
        int8: Enable INT8 mode (requires calibration)
        max_batch_size: Maximum batch size

    Returns:
        Path to TensorRT engine file
    """
    try:
        import tensorrt as trt
    except ImportError:
        raise ImportError("tensorrt required: pip install tensorrt")

    if output_path is None:
        p = Path(onnx_path)
        output_path = str(p.parent / f"{p.stem}.plan")

    logger.info("Converting to TensorRT", input=onnx_path, fp16=fp16, int8=int8)

    logger_ptr = trt.Logger(trt.Logger.WARNING)
    builder = trt.Builder(logger_ptr)
    network = builder.create_network(1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH))
    parser = trt.OnnxParser(network, logger_ptr)

    # Parse ONNX
    with open(onnx_path, "rb") as f:
        if not parser.parse(f.read()):
            for i in range(parser.num_errors):
                logger.error("ONNX parse error", error=str(parser.get_error(i)))
            raise RuntimeError("Failed to parse ONNX model")

    config = builder.create_builder_config()
    config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, 1 << 30)  # 1GB

    if fp16 and builder.platform_has_fast_fp16:
        config.set_flag(trt.BuilderFlag.FP16)
        logger.info("FP16 mode enabled")

    if int8 and builder.platform_has_fast_int8:
        config.set_flag(trt.BuilderFlag.INT8)
        logger.info("INT8 mode enabled")

    # Build engine
    serialized_engine = builder.build_serialized_network(network, config)
    if serialized_engine is None:
        raise RuntimeError("Failed to build TensorRT engine")

    with open(output_path, "wb") as f:
        f.write(serialized_engine)

    logger.info("TensorRT conversion complete", path=output_path)
    return output_path

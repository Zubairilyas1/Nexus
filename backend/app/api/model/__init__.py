"""Model management API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class BenchmarkRequest(BaseModel):
    model_path: str
    input_size: list = [1, 3, 640, 640]
    num_runs: int = 100


class ConvertRequest(BaseModel):
    model_path: str
    fp16: bool = True
    int8: bool = False


@router.get("/info")
async def get_model_info():
    """Get information about available models and backends."""
    from pathlib import Path

    models_dir = Path("models")
    models = []
    if models_dir.exists():
        for f in models_dir.iterdir():
            if f.suffix in (".onnx", ".pt", ".plan"):
                models.append({
                    "name": f.name,
                    "path": str(f),
                    "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
                    "format": f.suffix[1:],
                })

    # Check available backends
    backends = {"onnx_cpu": True}
    try:
        import onnxruntime as ort
        providers = ort.get_available_providers()
        backends["onnx_cuda"] = "CUDAExecutionProvider" in providers
    except ImportError:
        backends["onnx_cpu"] = False

    try:
        import tensorrt
        backends["tensorrt"] = True
    except ImportError:
        backends["tensorrt"] = False

    return {
        "models": models,
        "backends": backends,
    }


@router.post("/benchmark")
async def benchmark_model(req: BenchmarkRequest):
    """Benchmark model inference speed."""
    from pathlib import Path

    if not Path(req.model_path).exists():
        raise HTTPException(status_code=404, detail=f"Model not found: {req.model_path}")

    try:
        from app.core.model_export import benchmark_model as bm
        results = bm(
            model_path=req.model_path,
            input_size=tuple(req.input_size),
            num_runs=req.num_runs,
        )
        return results
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Missing dependency: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/convert")
async def convert_model(req: ConvertRequest):
    """Convert ONNX model to TensorRT."""
    from pathlib import Path

    if not Path(req.model_path).exists():
        raise HTTPException(status_code=404, detail=f"Model not found: {req.model_path}")

    try:
        from app.core.model_export import convert_onnx_to_tensorrt
        output_path = convert_onnx_to_tensorrt(
            onnx_path=req.model_path,
            fp16=req.fp16,
            int8=req.int8,
        )
        return {"status": "converted", "output_path": output_path}
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Missing dependency: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

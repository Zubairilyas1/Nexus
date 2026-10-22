"""Sandboxed execution environment for plugins."""

import asyncio
import sys
from typing import Any, Callable, Dict, Optional
import structlog

logger = structlog.get_logger()

# Resource limits
MAX_CPU_TIME = 10  # seconds
MAX_MEMORY_MB = 256

# resource module only available on Unix
_HAS_RESOURCE = sys.platform != "win32"
if _HAS_RESOURCE:
    import resource


class PluginSandbox:
    """Executes plugin code with resource limits."""

    def __init__(
        self,
        max_cpu_time: int = MAX_CPU_TIME,
        max_memory_mb: int = MAX_MEMORY_MB,
    ):
        self.max_cpu_time = max_cpu_time
        self.max_memory_mb = max_memory_mb

    async def run(
        self,
        func: Callable,
        *args,
        timeout: Optional[int] = None,
        **kwargs,
    ) -> Any:
        """Run a function with resource limits."""
        timeout = timeout or self.max_cpu_time

        try:
            result = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None, lambda: func(*args, **kwargs)
                ),
                timeout=timeout,
            )
            return result
        except asyncio.TimeoutError:
            logger.warning("Plugin execution timed out", timeout=timeout)
            raise TimeoutError(f"Plugin execution timed out after {timeout}s")
        except Exception as e:
            logger.error("Plugin execution error", error=str(e))
            raise

    def check_resources(self) -> Dict[str, Any]:
        """Check current resource usage."""
        if not _HAS_RESOURCE:
            return {"cpu_time": 0, "max_memory_mb": 0, "platform": "windows"}
        try:
            usage = resource.getrusage(resource.RUSAGE_SELF)
            return {
                "cpu_time": usage.ru_utime + usage.ru_stime,
                "max_memory_mb": usage.ru_maxrss / 1024,
            }
        except (AttributeError, OSError):
            return {"cpu_time": 0, "max_memory_mb": 0}

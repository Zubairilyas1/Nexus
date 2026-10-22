"""Security middleware for rate limiting and request validation."""

import time
from collections import defaultdict
from typing import Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitStore:
    """Simple in-memory rate limit store. Use Redis in production."""

    def __init__(self):
        self._requests: dict[str, list[float]] = defaultdict(list)

    def is_rate_limited(self, key: str, max_requests: int, window_seconds: int) -> bool:
        now = time.time()
        window_start = now - window_seconds
        self._requests[key] = [t for t in self._requests[key] if t > window_start]
        if len(self._requests[key]) >= max_requests:
            return True
        self._requests[key].append(now)
        return False

    def get_remaining(self, key: str, max_requests: int, window_seconds: int) -> int:
        now = time.time()
        window_start = now - window_seconds
        self._requests[key] = [t for t in self._requests[key] if t > window_start]
        return max(0, max_requests - len(self._requests[key]))


_store = RateLimitStore()

# Rate limit configurations per endpoint category
RATE_LIMITS = {
    "auth_login": {"max_requests": 10, "window_seconds": 60},
    "auth_register": {"max_requests": 5, "window_seconds": 300},
    "auth_password": {"max_requests": 5, "window_seconds": 300},
    "api_read": {"max_requests": 120, "window_seconds": 60},
    "api_write": {"max_requests": 60, "window_seconds": 60},
    "api_heavy": {"max_requests": 20, "window_seconds": 60},
    "default": {"max_requests": 100, "window_seconds": 60},
}


def _get_rate_limit_category(path: str, method: str) -> str:
    if "/api/auth/login" in path and method == "POST":
        return "auth_login"
    if "/api/auth/register" in path and method == "POST":
        return "auth_register"
    if "/api/auth/reset-password" in path and method == "POST":
        return "auth_password"
    if method in ("POST", "PUT", "DELETE", "PATCH"):
        return "api_write"
    if "/analytics/heatmap" in path or "/analytics/trajectories" in path:
        return "api_heavy"
    return "api_read"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")
        path = request.url.path
        method = request.method

        if path in ("/healthz", "/docs", "/openapi.json"):
            return await call_next(request)

        category = _get_rate_limit_category(path, method)
        config = RATE_LIMITS[category]
        key = f"{client_ip}:{category}"

        if _store.is_rate_limited(key, config["max_requests"], config["window_seconds"]):
            remaining = _store.get_remaining(key, config["max_requests"], config["window_seconds"])
            return Response(
                content='{"detail":"Rate limit exceeded. Try again later."}',
                status_code=429,
                media_type="application/json",
                headers={
                    "X-RateLimit-Limit": str(config["max_requests"]),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time() + config["window_seconds"])),
                    "Retry-After": str(config["window_seconds"]),
                },
            )

        response = await call_next(request)
        remaining = _store.get_remaining(key, config["max_requests"], config["window_seconds"])
        response.headers["X-RateLimit-Limit"] = str(config["max_requests"])
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response

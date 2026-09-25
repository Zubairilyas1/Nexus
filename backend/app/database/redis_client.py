# Redis Client Management
import redis.asyncio as redis
from app.config import get_settings
import structlog

logger = structlog.get_logger()

_redis_client: redis.Redis | None = None
_redis_pool: redis.ConnectionPool | None = None


async def init_redis() -> None:
    """Initialize Redis connection pool."""
    global _redis_client, _redis_pool
    
    settings = get_settings()
    
    _redis_pool = redis.ConnectionPool.from_url(
        settings.REDIS_URL,
        max_connections=settings.REDIS_MAX_CONNECTIONS,
        socket_timeout=settings.REDIS_SOCKET_TIMEOUT,
        socket_connect_timeout=settings.REDIS_SOCKET_CONNECT_TIMEOUT,
        decode_responses=True,
    )
    
    _redis_client = redis.Redis(connection_pool=_redis_pool)
    
    # Test connection
    await _redis_client.ping()
    
    logger.info("Redis connection pool initialized", url=settings.REDIS_URL)


async def close_redis() -> None:
    """Close Redis connections."""
    global _redis_client, _redis_pool
    if _redis_client:
        await _redis_client.close()
    if _redis_pool:
        await _redis_pool.disconnect()
    _redis_client = None
    _redis_pool = None
    logger.info("Redis connections closed")


def get_redis() -> redis.Redis:
    """Get Redis client instance."""
    if _redis_client is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return _redis_client
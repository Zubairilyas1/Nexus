# PostgreSQL Database Session Management
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from app.config import get_settings
import structlog

logger = structlog.get_logger()

_engine = None
_session_factory = None


async def init_db() -> None:
    """Initialize database engine and session factory."""
    global _engine, _session_factory
    
    settings = get_settings()
    
    # Create async engine
    _engine = create_async_engine(
        settings.DATABASE_URL,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        pool_timeout=settings.DATABASE_POOL_TIMEOUT,
        pool_pre_ping=True,
        pool_recycle=3600,
        echo=settings.DEBUG,
    )
    
    # Create session factory
    _session_factory = async_sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    
    # Test connection
    async with _engine.begin() as conn:
        from sqlalchemy import text
        await conn.execute(text("SELECT 1"))
    
    logger.info("Database engine initialized", url=settings.DATABASE_URL.split("@")[-1])


async def close_db() -> None:
    """Close database connections."""
    global _engine
    if _engine:
        await _engine.dispose()
        _engine = None
        logger.info("Database engine closed")


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Get the async session factory."""
    if _session_factory is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _session_factory


async def get_db_session() -> AsyncSession:
    """Dependency for FastAPI to get DB session."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db_session_direct() -> AsyncSession:
    """Get a DB session directly (for non-FastAPI usage like health checks)."""
    session_factory = get_session_factory()
    return session_factory()
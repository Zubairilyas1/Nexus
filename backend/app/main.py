# FastAPI Application Entry Point
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog

from app.config import get_settings
from app.api import zones, health, auth, analytics, streams
from app.api.organizations import router as organizations_router
from app.api.fusion import router as fusion_router
from app.api.plugins import router as plugins_router
from app.api.model import router as model_router
from app.database.session import init_db, close_db
from app.database.redis_client import init_redis, close_redis
from app.core.stream_manager import multi_stream_manager, StreamConfig
from app.core.multi_pipeline import multi_pipeline, start_pipeline_for_stream
from app.core.websocket_manager import websocket_manager

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO level
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup/shutdown."""
    settings = get_settings()

    logger.info("Starting NexusVision backend", version=settings.APP_VERSION, env=settings.ENVIRONMENT)

    # Initialize database connections
    await init_db()
    logger.info("Database initialized")

    # Initialize Redis connection
    await init_redis()
    logger.info("Redis initialized")

    # Initialize WebSocket manager
    await websocket_manager.start()
    logger.info("WebSocket manager started")

    # Seed the demo stream on a fresh database so the UI has a stream to show
    if settings.DEBUG and settings.YOUTUBE_FALLBACK_URL:
        try:
            await _seed_dev_stream(settings)
        except Exception as e:
            logger.warning("Failed to seed development stream", error=str(e))

    # Restore streams persisted in the database (capture always, detection when enabled)
    await _restore_streams()

    yield

    # Shutdown
    logger.info("Shutting down NexusVision backend")
    await multi_pipeline.stop_all()
    await websocket_manager.stop()
    await multi_stream_manager.stop_all()
    await close_redis()
    await close_db()
    logger.info("Connections closed")


async def _seed_dev_stream(settings):
    """Persist the development demo stream on first boot."""
    from sqlalchemy import select
    from app.database.session import get_session_factory
    from app.models import Stream, Organization

    factory = get_session_factory()
    async with factory() as db:
        existing = await db.execute(select(Stream).where(Stream.streamId == "dev_test_stream"))
        if existing.scalar_one_or_none() is not None:
            return

        org_result = await db.execute(select(Organization).order_by(Organization.createdAt).limit(1))
        org = org_result.scalar_one_or_none()
        if org is None:
            return

        db.add(Stream(
            streamId="dev_test_stream",
            rtspUrl=settings.RTSP_SOURCE or None,
            youtubeUrl=settings.YOUTUBE_FALLBACK_URL,
            name="Development Test Stream",
            frameWidth=settings.FRAME_WIDTH,
            frameHeight=settings.FRAME_HEIGHT,
            targetFps=settings.TARGET_FPS,
            enabled=True,
            organizationId=org.id,
        ))
        await db.commit()
        logger.info("Seeded development test stream")


async def _restore_streams():
    """Recreate capture (and detection pipelines) for streams persisted in the database."""
    from sqlalchemy import select
    from app.database.session import get_session_factory
    from app.models import Stream

    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(select(Stream).order_by(Stream.createdAt))
        rows = [
            {
                "stream_id": r.streamId,
                "rtsp_url": r.rtspUrl,
                "youtube_url": r.youtubeUrl,
                "name": r.name,
                "frame_width": r.frameWidth,
                "frame_height": r.frameHeight,
                "target_fps": r.targetFps,
                "enabled": r.enabled,
            }
            for r in result.scalars().all()
        ]

    for row in rows:
        try:
            config = StreamConfig(
                stream_id=row["stream_id"],
                rtsp_url=row["rtsp_url"],
                youtube_url=row["youtube_url"],
                name=row["name"],
                frame_width=row["frame_width"],
                frame_height=row["frame_height"],
                target_fps=row["target_fps"],
                use_youtube_fallback=bool(row["youtube_url"]),
                reconnect_delay=3.0,
                max_reconnect_attempts=5,
            )
            await multi_stream_manager.add_stream(config)
            if row["enabled"]:
                await start_pipeline_for_stream(row["stream_id"])
        except Exception as e:
            logger.warning("Failed to restore stream", stream_id=row["stream_id"], error=str(e))


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="AI-Powered Edge Video Analytics & Virtual Loop Traffic Engine",
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        openapi_url="/openapi.json" if settings.DEBUG else None,
        lifespan=lifespan,
    )
    
    # Rate limiting middleware
    from app.middleware.rate_limit import RateLimitMiddleware
    app.add_middleware(RateLimitMiddleware)

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    
    # Global exception handler
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error("Unhandled exception", path=request.url.path, error=str(exc), exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error" if not settings.DEBUG else str(exc)}
        )
    
    # Include routers
    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router, prefix="/api", tags=["auth"])
    app.include_router(zones.router, prefix="/api/zones", tags=["zones"])
    app.include_router(analytics.router, prefix="/api", tags=["analytics"])
    app.include_router(streams.router, prefix="/api/streams", tags=["streams"])
    app.include_router(organizations_router, prefix="/api/organizations", tags=["organizations"])
    app.include_router(fusion_router, prefix="/api/fusion", tags=["fusion"])
    app.include_router(plugins_router, prefix="/api/plugins", tags=["plugins"])
    app.include_router(model_router, prefix="/api/model", tags=["model"])
    
    # Root endpoint
    @app.get("/")
    async def root():
        return {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "running",
            "docs": "/docs" if settings.DEBUG else "disabled"
        }
    
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        workers=settings.WORKERS,
        loop="uvloop",
        reload=settings.DEBUG,
    )
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import FastAPI


def _install_mock_db_session():
    """Let route dependencies run without calling init_db() / real Postgres."""
    import app.database.session as db_session

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
    )
    mock_session.commit = AsyncMock()
    mock_session.rollback = AsyncMock()
    mock_session.close = AsyncMock()
    mock_session.delete = AsyncMock()

    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_session
    mock_cm.__aexit__.return_value = None

    mock_factory = MagicMock(return_value=mock_cm)
    db_session._session_factory = mock_factory
    return db_session


@pytest_asyncio.fixture
async def app():
    db_session = _install_mock_db_session()
    prev_factory = db_session._session_factory

    with patch("app.main.init_db", new_callable=AsyncMock), \
         patch("app.main.close_db", new_callable=AsyncMock), \
         patch("app.main.init_redis", new_callable=AsyncMock), \
         patch("app.main.close_redis", new_callable=AsyncMock), \
         patch("app.main.websocket_manager") as mock_ws, \
         patch("app.main.multi_stream_manager") as mock_streams:
        mock_ws.start = AsyncMock()
        mock_ws.stop = AsyncMock()
        mock_ws.broadcast_event = MagicMock()
        mock_ws.broadcast_stats = MagicMock()
        mock_streams.get_all_stats = MagicMock(return_value={})

        from app.main import create_app

        application = create_app()
        try:
            yield application
        finally:
            db_session._session_factory = prev_factory


@pytest_asyncio.fixture
async def client(app: FastAPI):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

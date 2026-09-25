import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import FastAPI


@pytest_asyncio.fixture
async def app():
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
        yield application


@pytest_asyncio.fixture
async def client(app: FastAPI):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

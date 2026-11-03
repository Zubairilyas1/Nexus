import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_streams_public_read(client: AsyncClient):
    """Stream list is public so the dashboard can poll without a separate public API."""
    response = await client.get("/api/streams")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_get_stream_not_found(client: AsyncClient):
    response = await client.get("/api/streams/nonexistent")
    assert response.status_code in (401, 403, 404, 422)


@pytest.mark.asyncio
async def test_mjpeg_stream_not_found(client: AsyncClient):
    response = await client.get("/api/streams/nonexistent/mjpeg")
    assert response.status_code in (401, 403, 404, 422)

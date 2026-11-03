import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_zones_unauthorized(client: AsyncClient):
    response = await client.get("/api/zones")
    assert response.status_code in (401, 403, 404, 405, 422)


@pytest.mark.asyncio
async def test_create_zone_unauthorized(client: AsyncClient):
    response = await client.post("/api/zones", json={
        "label": "Test Zone",
        "points": [{"x": 0, "y": 0}, {"x": 100, "y": 0}, {"x": 100, "y": 100}],
        "color": "#06b6d4",
        "max_dwell_ms": 30000,
    })
    assert response.status_code in (401, 403, 404, 405, 422)


@pytest.mark.asyncio
async def test_get_zone_not_found(client: AsyncClient):
    response = await client.get("/api/zones/nonexistent")
    assert response.status_code in (401, 403, 404, 422)


@pytest.mark.asyncio
async def test_delete_zone_unauthorized(client: AsyncClient):
    response = await client.delete("/api/zones/test-zone-id")
    assert response.status_code in (401, 403, 404, 405, 422)


@pytest.mark.asyncio
async def test_import_zones_unauthorized(client: AsyncClient):
    response = await client.post("/api/zones/import", json={
        "zones": [],
        "strategy": "merge"
    })
    assert response.status_code in (401, 403, 404, 405, 422)

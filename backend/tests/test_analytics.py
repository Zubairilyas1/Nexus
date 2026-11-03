import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_heatmap_unauthorized(client: AsyncClient):
    response = await client.get("/api/analytics/heatmap")
    assert response.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_trajectories_unauthorized(client: AsyncClient):
    response = await client.get("/api/analytics/trajectories")
    assert response.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_od_matrix_unauthorized(client: AsyncClient):
    response = await client.get("/api/analytics/od-matrix")
    assert response.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_predictions_unauthorized(client: AsyncClient):
    response = await client.get("/api/analytics/predictions/congestion")
    assert response.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_congestion_alerts_unauthorized(client: AsyncClient):
    response = await client.get("/api/analytics/predictions/congestion/alerts")
    assert response.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_summary_unauthorized(client: AsyncClient):
    response = await client.get("/api/analytics/summary")
    assert response.status_code in (401, 403, 422)

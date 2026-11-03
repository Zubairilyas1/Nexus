import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_register_missing_fields(client: AsyncClient):
    response = await client.post("/api/auth/register", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_register_invalid_email(client: AsyncClient):
    response = await client.post("/api/auth/register", json={
        "email": "not-an-email",
        "password": "securepass123"
    })
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_register_short_password(client: AsyncClient):
    response = await client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "short"
    })
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_missing_fields(client: AsyncClient):
    response = await client.post("/api/auth/login", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_invalid_email(client: AsyncClient):
    response = await client.post("/api/auth/login", json={
        "email": "not-an-email",
        "password": "securepass123"
    })
    # Login uses plain str (not EmailStr) so reserved TLDs work; bad format → lookup miss → 401
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_forgot_password_missing_email(client: AsyncClient):
    response = await client.post("/api/auth/forgot-password", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_reset_password_missing_fields(client: AsyncClient):
    response = await client.post("/api/auth/reset-password", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_verify_email_missing_token(client: AsyncClient):
    response = await client.get("/api/auth/verify-email")
    assert response.status_code == 422

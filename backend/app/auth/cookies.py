from fastapi import Response, Request
from typing import Optional

REFRESH_COOKIE_NAME = "nexus_refresh"
ACCESS_COOKIE_NAME = "nexus_access"  # Not recommended for access tokens, but available

COOKIE_SETTINGS = {
    "httponly": True,
    "secure": True,  # Set to False for localhost dev
    "samesite": "lax",
    "path": "/",
}


def get_cookie_settings(secure: bool = True) -> dict:
    """Get cookie settings, adjusting for dev/prod."""
    return {
        **COOKIE_SETTINGS,
        "secure": secure,
    }


def set_refresh_cookie(response: Response, refresh_token: str, secure: bool = True) -> None:
    """Set the HttpOnly refresh token cookie."""
    settings = get_cookie_settings(secure)
    max_age = 7 * 24 * 60 * 60  # 7 days in seconds
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=max_age,
        **settings,
    )


def set_access_cookie(response: Response, access_token: str, secure: bool = True) -> None:
    """Set the access token cookie (short-lived)."""
    settings = get_cookie_settings(secure)
    max_age = 15 * 60  # 15 minutes in seconds
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=max_age,
        **settings,
    )


def clear_auth_cookies(response: Response, secure: bool = True) -> None:
    """Clear both auth cookies on logout."""
    settings = get_cookie_settings(secure)
    response.delete_cookie(REFRESH_COOKIE_NAME, **settings)
    response.delete_cookie(ACCESS_COOKIE_NAME, **settings)


def get_refresh_token_from_cookie(request: Request) -> Optional[str]:
    """Extract refresh token from HttpOnly cookie."""
    return request.cookies.get(REFRESH_COOKIE_NAME)


def get_access_token_from_cookie(request: Request) -> Optional[str]:
    """Extract access token from cookie."""
    return request.cookies.get(ACCESS_COOKIE_NAME)


def get_access_token_from_header(request: Request) -> Optional[str]:
    """Extract access token from Authorization header."""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


def get_token(request: Request) -> Optional[str]:
    """Get access token from header (preferred) or cookie."""
    return get_access_token_from_header(request) or get_access_token_from_cookie(request)
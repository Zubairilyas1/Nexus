import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from jose import jwt, JWTError
from pydantic import BaseModel

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-super-secret-jwt-key-min-32-chars-change-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
JWT_REFRESH_EXPIRE_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7"))

JWT_ISSUER = "nexusvision"
JWT_AUDIENCE = "nexusvision:api"


class TokenPayload(BaseModel):
    sub: str
    email: str
    name: Optional[str] = None
    global_role: str
    org_id: Optional[str] = None
    org_role: Optional[str] = None
    project_id: Optional[str] = None
    project_role: Optional[str] = None
    iat: int
    exp: int
    jti: str
    iss: str = JWT_ISSUER
    aud: str = JWT_AUDIENCE


def create_access_token(
    subject: str,
    email: str,
    global_role: str,
    name: Optional[str] = None,
    org_id: Optional[str] = None,
    org_role: Optional[str] = None,
    project_id: Optional[str] = None,
    project_role: Optional[str] = None,
) -> str:
    """Create a short-lived access token."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=JWT_ACCESS_EXPIRE_MINUTES)
    jti = secrets.token_urlsafe(16)
    
    payload = {
        "sub": subject,
        "email": email,
        "name": name,
        "global_role": global_role,
        "org_id": org_id,
        "org_role": org_role,
        "project_id": project_id,
        "project_role": project_role,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": jti,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
    }
    
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_refresh_token(
    subject: str,
    email: str,
    global_role: str,
    org_id: Optional[str] = None,
    org_role: Optional[str] = None,
    project_id: Optional[str] = None,
    project_role: Optional[str] = None,
) -> str:
    """Create a long-lived refresh token."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=JWT_REFRESH_EXPIRE_DAYS)
    jti = secrets.token_urlsafe(32)
    
    payload = {
        "sub": subject,
        "email": email,
        "global_role": global_role,
        "org_id": org_id,
        "org_role": org_role,
        "project_id": project_id,
        "project_role": project_role,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": jti,
        "type": "refresh",
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
    }
    
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
        )
        return payload
    except JWTError:
        return None


def verify_token(token: str) -> Optional[TokenPayload]:
    """Verify a token and return parsed payload."""
    payload = decode_token(token)
    if not payload:
        return None
    try:
        return TokenPayload(**payload)
    except Exception:
        return None


def create_token_pair(
    subject: str,
    email: str,
    global_role: str,
    name: Optional[str] = None,
    org_id: Optional[str] = None,
    org_role: Optional[str] = None,
    project_id: Optional[str] = None,
    project_role: Optional[str] = None,
) -> Dict[str, str]:
    """Create both access and refresh tokens."""
    return {
        "access_token": create_access_token(
            subject, email, global_role, name, org_id, org_role, project_id, project_role
        ),
        "refresh_token": create_refresh_token(
            subject, email, global_role, org_id, org_role, project_id, project_role
        ),
        "token_type": "bearer",
        "expires_in": JWT_ACCESS_EXPIRE_MINUTES * 60,
    }
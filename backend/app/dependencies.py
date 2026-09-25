"""Access control dependencies for multi-tenant routes."""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_token, verify_token
from app.database.session import get_db_session
from app.models import User, Organization, Membership, Project, ProjectMembership, UserRole


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """Get current authenticated user from JWT token."""
    token = get_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == payload.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


async def get_current_organization(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> Organization:
    """Get current organization from X-Organization-ID header."""
    org_id = request.headers.get("X-Organization-ID")
    if not org_id:
        raise HTTPException(status_code=400, detail="X-Organization-ID header required")

    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check membership
    membership_result = await db.execute(
        select(Membership).where(
            Membership.userId == user.id,
            Membership.organizationId == org.id,
            Membership.status == "ACTIVE",
        )
    )
    membership = membership_result.scalar_one_or_none()
    if not membership and user.globalRole != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    return org


async def get_current_project(
    request: Request,
    user: User = Depends(get_current_user),
    organization: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db_session),
) -> Project:
    """Get current project from X-Project-ID header."""
    project_id = request.headers.get("X-Project-ID")
    if not project_id:
        raise HTTPException(status_code=400, detail="X-Project-ID header required")

    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.organizationId == organization.id,
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


def require_org_role(*allowed_roles: str):
    """Dependency factory to require specific roles within an organization."""
    async def role_checker(
        user: User = Depends(get_current_user),
        organization: Organization = Depends(get_current_organization),
        db: AsyncSession = Depends(get_db_session),
    ) -> User:
        if user.globalRole == UserRole.SUPER_ADMIN:
            return user

        result = await db.execute(
            select(Membership).where(
                Membership.userId == user.id,
                Membership.organizationId == organization.id,
                Membership.status == "ACTIVE",
            )
        )
        membership = result.scalar_one_or_none()
        if not membership:
            raise HTTPException(status_code=403, detail="Not a member of this organization")

        if membership.role.value not in allowed_roles and membership.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")

        return user
    return role_checker

"""Organizations API routes."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.session import get_db_session
from app.dependencies import get_current_user, get_current_organization, require_org_role
from app.models import User, Organization, Membership, Project, UserRole, MembershipStatus

router = APIRouter()


class OrgCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    logo_url: str | None = None


class OrgUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    logo_url: str | None = None
    settings: dict | None = None


class OrgResponse(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: str | None
    settings: dict | None
    created_at: datetime
    member_count: int = 0
    project_count: int = 0


class MemberInvite(BaseModel):
    email: str
    role: str = "VIEWER"


class MemberUpdate(BaseModel):
    role: str


class MemberResponse(BaseModel):
    id: str
    user_id: str
    email: str
    name: str | None
    role: str
    status: str
    joined_at: datetime | None
    created_at: datetime


class ProjectResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None
    timezone: str
    retention_days: int
    created_at: datetime


@router.get("", response_model=list[OrgResponse])
async def list_organizations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List organizations the user belongs to."""
    if user.globalRole == UserRole.SUPER_ADMIN:
        result = await db.execute(select(Organization))
    else:
        result = await db.execute(
            select(Organization)
            .join(Membership)
            .where(
                Membership.userId == user.id,
                Membership.status == MembershipStatus.ACTIVE,
            )
        )
    orgs = result.scalars().all()

    responses = []
    for org in orgs:
        member_count = await db.execute(
            select(Membership).where(
                Membership.organizationId == org.id,
                Membership.status == MembershipStatus.ACTIVE,
            )
        )
        project_count = await db.execute(
            select(Project).where(Project.organizationId == org.id)
        )
        responses.append(OrgResponse(
            id=org.id,
            name=org.name,
            slug=org.slug,
            logo_url=org.logoUrl,
            settings=org.settings,
            created_at=org.createdAt,
            member_count=len(member_count.scalars().all()),
            project_count=len(project_count.scalars().all()),
        ))
    return responses


@router.post("", response_model=OrgResponse, status_code=201)
async def create_organization(
    data: OrgCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new organization. Creator becomes ORG_ADMIN."""
    # Check slug uniqueness
    existing = await db.execute(select(Organization).where(Organization.slug == data.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Organization slug already exists")

    org = Organization(
        name=data.name,
        slug=data.slug,
        logoUrl=data.logo_url,
    )
    db.add(org)
    await db.flush()

    # Add creator as ORG_ADMIN
    membership = Membership(
        userId=user.id,
        organizationId=org.id,
        role=UserRole.ORG_ADMIN,
        status=MembershipStatus.ACTIVE,
        joinedAt=datetime.utcnow(),
    )
    db.add(membership)
    await db.commit()
    await db.refresh(org)

    return OrgResponse(
        id=org.id,
        name=org.name,
        slug=org.slug,
        logo_url=org.logoUrl,
        settings=org.settings,
        created_at=org.createdAt,
        member_count=1,
        project_count=0,
    )


@router.get("/{org_id}", response_model=OrgResponse)
async def get_organization(
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get organization details."""
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check membership
    if user.globalRole != UserRole.SUPER_ADMIN:
        membership = await db.execute(
            select(Membership).where(
                Membership.userId == user.id,
                Membership.organizationId == org.id,
                Membership.status == MembershipStatus.ACTIVE,
            )
        )
        if not membership.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a member")

    member_count = await db.execute(
        select(Membership).where(
            Membership.organizationId == org.id,
            Membership.status == MembershipStatus.ACTIVE,
        )
    )
    project_count = await db.execute(
        select(Project).where(Project.organizationId == org.id)
    )

    return OrgResponse(
        id=org.id,
        name=org.name,
        slug=org.slug,
        logo_url=org.logoUrl,
        settings=org.settings,
        created_at=org.createdAt,
        member_count=len(member_count.scalars().all()),
        project_count=len(project_count.scalars().all()),
    )


@router.patch("/{org_id}", response_model=OrgResponse)
async def update_organization(
    org_id: str,
    data: OrgUpdate,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db_session),
):
    """Update organization (ORG_ADMIN only)."""
    if user.globalRole != UserRole.SUPER_ADMIN:
        membership = await db.execute(
            select(Membership).where(
                Membership.userId == user.id,
                Membership.organizationId == org.id,
                Membership.role == UserRole.ORG_ADMIN,
                Membership.status == MembershipStatus.ACTIVE,
            )
        )
        if not membership.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="ORG_ADMIN role required")

    if data.name is not None:
        org.name = data.name
    if data.logo_url is not None:
        org.logoUrl = data.logo_url
    if data.settings is not None:
        org.settings = data.settings

    await db.commit()
    await db.refresh(org)

    return OrgResponse(
        id=org.id,
        name=org.name,
        slug=org.slug,
        logo_url=org.logoUrl,
        settings=org.settings,
        created_at=org.createdAt,
    )


@router.delete("/{org_id}", status_code=204)
async def delete_organization(
    org_id: str,
    user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete organization (ORG_ADMIN only)."""
    if user.globalRole != UserRole.SUPER_ADMIN:
        membership = await db.execute(
            select(Membership).where(
                Membership.userId == user.id,
                Membership.organizationId == org.id,
                Membership.role == UserRole.ORG_ADMIN,
                Membership.status == MembershipStatus.ACTIVE,
            )
        )
        if not membership.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="ORG_ADMIN role required")

    await db.delete(org)
    await db.commit()


# --- Members ---

@router.get("/{org_id}/members", response_model=list[MemberResponse])
async def list_members(
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List organization members."""
    # Verify access
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if user.globalRole != UserRole.SUPER_ADMIN:
        membership = await db.execute(
            select(Membership).where(
                Membership.userId == user.id,
                Membership.organizationId == org_id,
                Membership.status == MembershipStatus.ACTIVE,
            )
        )
        if not membership.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a member")

    members_result = await db.execute(
        select(Membership, User)
        .join(User, Membership.userId == User.id)
        .where(Membership.organizationId == org_id)
    )

    return [
        MemberResponse(
            id=m.Membership.id,
            user_id=m.User.id,
            email=m.User.email,
            name=m.User.name,
            role=m.Membership.role.value,
            status=m.Membership.status.value,
            joined_at=m.Membership.joinedAt,
            created_at=m.Membership.createdAt,
        )
        for m in members_result.all()
    ]


@router.post("/{org_id}/members", response_model=MemberResponse, status_code=201)
async def invite_member(
    org_id: str,
    data: MemberInvite,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Invite a member to the organization (ORG_ADMIN only)."""
    # Verify org exists
    org_result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check admin role
    if user.globalRole != UserRole.SUPER_ADMIN:
        membership = await db.execute(
            select(Membership).where(
                Membership.userId == user.id,
                Membership.organizationId == org_id,
                Membership.role.in_([UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN]),
                Membership.status == MembershipStatus.ACTIVE,
            )
        )
        if not membership.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="ORG_ADMIN role required")

    # Find user by email
    user_result = await db.execute(select(User).where(User.email == data.email))
    target_user = user_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found. They must register first.")

    # Check not already a member
    existing = await db.execute(
        select(Membership).where(
            Membership.userId == target_user.id,
            Membership.organizationId == org_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member")

    membership = Membership(
        userId=target_user.id,
        organizationId=org_id,
        role=UserRole(data.role),
        status=MembershipStatus.ACTIVE,
        invitedById=user.id,
        joinedAt=datetime.utcnow(),
    )
    db.add(membership)
    await db.commit()
    await db.refresh(membership)

    return MemberResponse(
        id=membership.id,
        user_id=target_user.id,
        email=target_user.email,
        name=target_user.name,
        role=membership.role.value,
        status=membership.status.value,
        joined_at=membership.joinedAt,
        created_at=membership.createdAt,
    )


@router.patch("/{org_id}/members/{member_id}", response_model=MemberResponse)
async def update_member(
    org_id: str,
    member_id: str,
    data: MemberUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Update member role (ORG_ADMIN only)."""
    if user.globalRole != UserRole.SUPER_ADMIN:
        membership = await db.execute(
            select(Membership).where(
                Membership.userId == user.id,
                Membership.organizationId == org_id,
                Membership.role == UserRole.ORG_ADMIN,
                Membership.status == MembershipStatus.ACTIVE,
            )
        )
        if not membership.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="ORG_ADMIN role required")

    result = await db.execute(
        select(Membership, User)
        .join(User, Membership.userId == User.id)
        .where(Membership.id == member_id, Membership.organizationId == org_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Member not found")

    membership, target_user = row
    membership.role = UserRole(data.role)
    await db.commit()
    await db.refresh(membership)

    return MemberResponse(
        id=membership.id,
        user_id=target_user.id,
        email=target_user.email,
        name=target_user.name,
        role=membership.role.value,
        status=membership.status.value,
        joined_at=membership.joinedAt,
        created_at=membership.createdAt,
    )


@router.delete("/{org_id}/members/{member_id}", status_code=204)
async def remove_member(
    org_id: str,
    member_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove a member from the organization (ORG_ADMIN only)."""
    if user.globalRole != UserRole.SUPER_ADMIN:
        membership = await db.execute(
            select(Membership).where(
                Membership.userId == user.id,
                Membership.organizationId == org_id,
                Membership.role == UserRole.ORG_ADMIN,
                Membership.status == MembershipStatus.ACTIVE,
            )
        )
        if not membership.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="ORG_ADMIN role required")

    result = await db.execute(
        select(Membership).where(
            Membership.id == member_id,
            Membership.organizationId == org_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.delete(membership)
    await db.commit()


# --- Projects ---

@router.get("/{org_id}/projects", response_model=list[ProjectResponse])
async def list_projects(
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List projects in an organization."""
    result = await db.execute(
        select(Project).where(Project.organizationId == org_id)
    )
    return [
        ProjectResponse(
            id=p.id,
            name=p.name,
            slug=p.slug,
            description=p.description,
            timezone=p.timezone,
            retention_days=p.retentionDays,
            created_at=p.createdAt,
        )
        for p in result.scalars().all()
    ]


@router.post("/{org_id}/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
    org_id: str,
    data: OrgCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a project in an organization."""
    # Verify org access
    org_result = await db.execute(select(Organization).where(Organization.id == org_id))
    if not org_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Organization not found")

    if user.globalRole != UserRole.SUPER_ADMIN:
        membership = await db.execute(
            select(Membership).where(
                Membership.userId == user.id,
                Membership.organizationId == org_id,
                Membership.role.in_([UserRole.ORG_ADMIN, UserRole.PROJECT_ADMIN]),
                Membership.status == MembershipStatus.ACTIVE,
            )
        )
        if not membership.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Check slug uniqueness within org
    existing = await db.execute(
        select(Project).where(
            Project.organizationId == org_id,
            Project.slug == data.slug,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Project slug already exists in this organization")

    project = Project(
        name=data.name,
        slug=data.slug,
        organizationId=org_id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    return ProjectResponse(
        id=project.id,
        name=project.name,
        slug=project.slug,
        description=project.description,
        timezone=project.timezone,
        retention_days=project.retentionDays,
        created_at=project.createdAt,
    )

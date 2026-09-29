from datetime import datetime, timedelta
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    hash_password,
    verify_password,
    validate_password_strength,
    create_token_pair,
    verify_token,
    set_refresh_cookie,
    clear_auth_cookies,
    get_refresh_token_from_cookie,
    get_token,
)
from app.auth.email import send_email, get_verification_email_template, get_password_reset_email_template
from app.config import get_settings
from app.database.session import get_db_session
from app.models import (
    User,
    Organization,
    Project,
    Membership,
    ProjectMembership,
    Session,
    VerificationToken,
    UserRole,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

settings = get_settings()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str | None = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    # Not EmailStr: it rejects reserved TLDs like .local, which would lock out
    # seeded accounts (admin@nexusvision.local). Login is a parameterized lookup.
    email: str = Field(min_length=3, max_length=255)
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class MessageResponse(BaseModel):
    message: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    global_role: str
    avatar_url: str | None
    email_verified: bool | None
    created_at: datetime


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """Dependency to get current authenticated user."""
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


async def get_optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> User | None:
    """Dependency to get current user if authenticated, else None."""
    token = get_token(request)
    if not token:
        return None
    payload = verify_token(token)
    if not payload:
        return None
    result = await db.execute(select(User).where(User.id == payload.sub))
    return result.scalar_one_or_none()


def require_role(*allowed_roles: str):
    """Dependency factory to require specific roles."""
    async def role_checker(user: User = Depends(get_current_user)) -> User:
        user_roles = [user.globalRole]
        if user.globalRole in allowed_roles:
            return user
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return role_checker


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    response: Response,
    data: RegisterRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Register a new user."""
    # Check if email exists
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    
    # Validate password
    valid, msg = validate_password_strength(data.password)
    if not valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
    
    # Create user
    user = User(
        email=data.email,
        passwordHash=hash_password(data.password),
        name=data.name,
        globalRole="VIEWER",
    )
    db.add(user)
    await db.flush()
    
    # Create default organization for new user
    org = Organization(
        name=f"{data.name or data.email.split('@')[0]}'s Organization",
        slug=f"{user.id[:8]}-org",
    )
    db.add(org)
    await db.flush()
    
    # Add user as org admin
    membership = Membership(
        userId=user.id,
        organizationId=org.id,
        role="ORG_ADMIN",
        status="ACTIVE",
        joinedAt=datetime.utcnow(),
    )
    db.add(membership)
    
    # Create default project
    project = Project(
        name="Default Project",
        slug="default",
        organizationId=org.id,
    )
    db.add(project)
    await db.flush()
    
    # Add user as project admin
    pm = ProjectMembership(
        userId=user.id,
        projectId=project.id,
        role="PROJECT_ADMIN",
    )
    db.add(pm)
    
    await db.commit()
    await db.refresh(user)
    
    # Create email verification token
    verification_token = secrets.token_urlsafe(32)
    vt = VerificationToken(
        token=verification_token,
        email=user.email,
        type="email_verification",
        expiresAt=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(vt)
    await db.commit()
    
    # Send verification email
    verification_url = f"{settings.NEXT_PUBLIC_APP_URL}/auth/verify-email?token={verification_token}"
    html_content, text_content = get_verification_email_template(verification_url, user.name)
    await send_email(user.email, "Verify your NexusVision account", html_content, text_content)
    
    return {"message": "Registration successful. Please check your email to verify your account."}


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    response: Response,
    data: LoginRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Login with email and password."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(data.password, user.passwordHash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    
    # Check if email is verified
    if not user.emailVerified:
        raise HTTPException(status_code=403, detail="Please verify your email address before logging in")
    
    # Get user's active membership
    result = await db.execute(
        select(Membership)
        .where(Membership.userId == user.id)
        .where(Membership.status == "ACTIVE")
    )
    membership = result.scalar_one_or_none()
    
    org_id = membership.organizationId if membership else None
    org_role = membership.role if membership else None
    
    # Get user's project membership
    result = await db.execute(
        select(ProjectMembership)
        .where(ProjectMembership.userId == user.id)
    )
    pm = result.scalar_one_or_none()
    
    project_id = pm.projectId if pm else None
    project_role = pm.role if pm else None
    
    # Update last login
    user.lastLoginAt = datetime.utcnow()
    await db.commit()
    
    # Create tokens
    tokens = create_token_pair(
        subject=user.id,
        email=user.email,
        global_role=user.globalRole,
        name=user.name,
        org_id=org_id,
        org_role=org_role,
        project_id=project_id,
        project_role=project_role,
    )
    
    # Store refresh token in DB
    session = Session(
        userId=user.id,
        refreshToken=tokens["refresh_token"],
        userAgent=request.headers.get("user-agent"),
        ipAddress=request.client.host if request.client else None,
        expiresAt=datetime.utcnow() + timedelta(days=7),
    )
    db.add(session)
    await db.commit()
    
    # Set refresh cookie
    set_refresh_cookie(response, tokens["refresh_token"])
    
    return TokenResponse(**tokens)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
):
    """Refresh access token using refresh token."""
    refresh_token = get_refresh_token_from_cookie(request)
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    
    # Verify refresh token
    payload = verify_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    
    # Check if session exists and is valid
    result = await db.execute(
        select(Session)
        .where(Session.refreshToken == refresh_token)
        .where(Session.expiresAt > datetime.utcnow())
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    
    # Get user
    result = await db.execute(select(User).where(User.id == payload.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    
    # Get current org/project
    result = await db.execute(
        select(Membership)
        .where(Membership.userId == user.id)
        .where(Membership.status == "ACTIVE")
    )
    membership = result.scalar_one_or_none()
    
    result = await db.execute(
        select(ProjectMembership)
        .where(ProjectMembership.userId == user.id)
    )
    pm = result.scalar_one_or_none()
    
    # Create new token pair
    tokens = create_token_pair(
        subject=user.id,
        email=user.email,
        global_role=user.globalRole,
        name=user.name,
        org_id=membership.organizationId if membership else None,
        org_role=membership.role if membership else None,
        project_id=pm.projectId if pm else None,
        project_role=pm.role if pm else None,
    )
    
    # Invalidate old session
    await db.delete(session)
    
    # Create new session
    new_session = Session(
        userId=user.id,
        refreshToken=tokens["refresh_token"],
        userAgent=request.headers.get("user-agent"),
        ipAddress=request.client.host if request.client else None,
        expiresAt=datetime.utcnow() + timedelta(days=7),
    )
    db.add(new_session)
    await db.commit()
    
    # Set new refresh cookie
    set_refresh_cookie(response, tokens["refresh_token"])
    
    return TokenResponse(**tokens)


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
):
    """Logout and invalidate session."""
    refresh_token = get_refresh_token_from_cookie(request)
    if refresh_token:
        result = await db.execute(
            select(Session).where(Session.refreshToken == refresh_token)
        )
        session = result.scalar_one_or_none()
        if session:
            await db.delete(session)
            await db.commit()
    
    clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    """Get current user info."""
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        global_role=user.globalRole,
        avatar_url=user.avatarUrl,
        email_verified=user.emailVerified is not None,
        created_at=user.createdAt,
    )


@router.get("/verify")
async def verify_token_endpoint(user: User = Depends(get_current_user)):
    """Verify token is valid."""
    return {"valid": True, "user_id": user.id}


# Email Verification
@router.get("/verify-email")
async def verify_email(
    token: str,
    db: AsyncSession = Depends(get_db_session),
):
    """Verify user's email address using token from email."""
    result = await db.execute(
        select(VerificationToken)
        .where(VerificationToken.token == token)
        .where(VerificationToken.type == "email_verification")
    )
    vt = result.scalar_one_or_none()
    
    if not vt:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    
    if vt.expiresAt < datetime.utcnow():
        await db.delete(vt)
        await db.commit()
        raise HTTPException(status_code=400, detail="Verification token has expired")
    
    # Find user and mark email as verified
    result = await db.execute(select(User).where(User.email == vt.email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.emailVerified = datetime.utcnow()
    
    # Delete the used token
    await db.delete(vt)
    await db.commit()
    
    return {"message": "Email verified successfully. You can now log in."}


# Forgot Password
class ForgotPasswordRequest(BaseModel):
    email: EmailStr

@router.post("/forgot-password")
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Request a password reset email."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    
    # Always return success to prevent email enumeration
    if not user:
        return {"message": "If the email exists, a password reset link has been sent."}
    
    # Create password reset token
    reset_token = secrets.token_urlsafe(32)
    rt = VerificationToken(
        token=reset_token,
        email=user.email,
        type="password_reset",
        expiresAt=datetime.utcnow() + timedelta(hours=1),
    )
    db.add(rt)
    await db.commit()
    
    # Send password reset email
    settings = get_settings()
    reset_url = f"{settings.NEXT_PUBLIC_APP_URL}/auth/reset-password?token={reset_token}"
    html_content, text_content = get_password_reset_email_template(reset_url, user.name)
    await send_email(user.email, "Reset your NexusVision password", html_content, None)
    
    return {"message": "If the email exists, a password reset link has been sent."}


# Reset Password
class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8)
    confirm_password: str

@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Reset user's password using token from email."""
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    # Validate password strength
    valid, msg = validate_password_strength(data.password)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)
    
    result = await db.execute(
        select(VerificationToken)
        .where(VerificationToken.token == data.token)
        .where(VerificationToken.type == "password_reset")
    )
    rt = result.scalar_one_or_none()
    
    if not rt:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    if rt.expiresAt < datetime.utcnow():
        await db.delete(rt)
        await db.commit()
        raise HTTPException(status_code=400, detail="Reset token has expired")
    
    # Find user and update password
    result = await db.execute(select(User).where(User.email == rt.email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.passwordHash = hash_password(data.password)
    
    # Delete the used token
    await db.delete(rt)
    await db.commit()
    
    return {"message": "Password reset successfully. You can now log in with your new password."}


def require_role(required_role: str):
    role_hierarchy = {'VIEWER': 1, 'OPERATOR': 2, 'PROJECT_ADMIN': 3, 'ORG_ADMIN': 4, 'SUPER_ADMIN': 5}
    
    async def role_checker(user: User = Depends(get_current_user)):
        user_role = user.global_role.name if hasattr(user.global_role, 'name') else str(user.global_role)
        if role_hierarchy.get(user_role, 0) < role_hierarchy.get(required_role, 0):
            raise HTTPException(status_code=403, detail="Insufficient privileges")
        return user
    return role_checker


# User Management Endpoints
class InviteUserRequest(BaseModel):
    email: EmailStr
    role: UserRole = UserRole.VIEWER

class UpdateUserRoleRequest(BaseModel):
    role: UserRole


class OrgUserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    global_role: str
    org_role: str | None
    status: str
    joined_at: datetime | None
    created_at: datetime

@router.get("/users", response_model=list[OrgUserResponse])
async def list_users(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List all users in the user's organization."""
    # Get user's organization
    result = await db.execute(
        select(Membership)
        .where(Membership.userId == user.id)
        .where(Membership.status == "ACTIVE")
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="No active organization")
    
    org_id = membership.organizationId
    
    # Get all members in the organization
    result = await db.execute(
        select(User, Membership)
        .join(Membership, Membership.userId == User.id)
        .where(Membership.organizationId == org_id)
    )
    
    users = []
    for u, m in result.all():
        users.append(OrgUserResponse(
            id=u.id,
            email=u.email,
            name=u.name,
            global_role=u.globalRole,
            org_role=m.role,
            status=m.status,
            joined_at=m.joinedAt,
            created_at=u.createdAt,
        ))
    
    return users


@router.post("/users/invite", response_model=OrgUserResponse, status_code=status.HTTP_201_CREATED)
async def invite_user(
    data: InviteUserRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Invite a new user to the organization."""
    # Check if current user has permission (ORG_ADMIN or SUPER_ADMIN)
    if current_user.globalRole not in [UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Insufficient privileges")
    
    # Get current user's organization
    result = await db.execute(
        select(Membership)
        .where(Membership.userId == current_user.id)
        .where(Membership.status == "ACTIVE")
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="No active organization")
    
    org_id = membership.organizationId
    
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == data.email))
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        # Check if already a member
        result = await db.execute(
            select(Membership)
            .where(Membership.userId == existing_user.id)
            .where(Membership.organizationId == org_id)
        )
        existing_membership = result.scalar_one_or_none()
        
        if existing_membership:
            raise HTTPException(status_code=400, detail="User is already a member of this organization")
        
        # Add existing user to organization
        new_membership = Membership(
            userId=existing_user.id,
            organizationId=org_id,
            role=data.role,
            status="PENDING",
            invitedById=current_user.id,
        )
        db.add(new_membership)
        await db.commit()
        await db.refresh(existing_user)
        
        return OrgUserResponse(
            id=existing_user.id,
            email=existing_user.email,
            name=existing_user.name,
            global_role=existing_user.globalRole,
            org_role=data.role,
            status="PENDING",
            joined_at=None,
            created_at=existing_user.createdAt,
        )
    
    # Create new user with temporary password (they'll set it via email verification)
    import secrets
    temp_password = secrets.token_urlsafe(16)
    new_user = User(
        email=data.email,
        passwordHash=hash_password(temp_password),
        globalRole=UserRole.VIEWER,
    )
    db.add(new_user)
    await db.flush()
    
    # Create membership
    new_membership = Membership(
        userId=new_user.id,
        organizationId=org_id,
        role=data.role,
        status="PENDING",
        invitedById=current_user.id,
    )
    db.add(new_membership)
    await db.commit()
    await db.refresh(new_user)
    
    # Send invitation email
    settings = get_settings()
    invite_url = f"{settings.NEXT_PUBLIC_APP_URL}/auth/register?invite_token={secrets.token_urlsafe(32)}"
    # TODO: Send invitation email
    
    return OrgUserResponse(
        id=new_user.id,
        email=new_user.email,
        name=new_user.name,
        global_role=new_user.globalRole,
        org_role=data.role,
        status="PENDING",
        joined_at=None,
        created_at=new_user.createdAt,
    )


@router.patch("/users/{user_id}", response_model=OrgUserResponse)
async def update_user_role(
    user_id: str,
    data: UpdateUserRoleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a user's role in the organization."""
    # Check if current user has permission
    if current_user.globalRole not in [UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Insufficient privileges")
    
    # Get current user's organization
    result = await db.execute(
        select(Membership)
        .where(Membership.userId == current_user.id)
        .where(Membership.status == "ACTIVE")
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="No active organization")
    
    org_id = membership.organizationId
    
    # Get target user's membership
    result = await db.execute(
        select(Membership)
        .where(Membership.userId == user_id)
        .where(Membership.organizationId == org_id)
    )
    target_membership = result.scalar_one_or_none()
    
    if not target_membership:
        raise HTTPException(status_code=404, detail="User not found in organization")
    
    # Prevent demoting yourself
    if target_membership.userId == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    
    # Prevent demoting SUPER_ADMIN unless you are SUPER_ADMIN
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if target_user and target_user.globalRole == UserRole.SUPER_ADMIN and current_user.globalRole != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Cannot modify SUPER_ADMIN")
    
    target_membership.role = data.role
    await db.commit()
    
    # Get updated user
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    
    return OrgUserResponse(
        id=target_user.id,
        email=target_user.email,
        name=target_user.name,
        global_role=target_user.globalRole,
        org_role=target_membership.role,
        status=target_membership.status,
        joined_at=target_membership.joinedAt,
        created_at=target_user.createdAt,
    )


@router.delete("/users/{user_id}")
async def remove_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove a user from the organization."""
    # Check if current user has permission
    if current_user.globalRole not in [UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Insufficient privileges")
    
    # Get current user's organization
    result = await db.execute(
        select(Membership)
        .where(Membership.userId == current_user.id)
        .where(Membership.status == "ACTIVE")
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="No active organization")
    
    org_id = membership.organizationId
    
    # Get target user's membership
    result = await db.execute(
        select(Membership)
        .where(Membership.userId == user_id)
        .where(Membership.organizationId == org_id)
    )
    target_membership = result.scalar_one_or_none()
    
    if not target_membership:
        raise HTTPException(status_code=404, detail="User not found in organization")
    
    # Prevent removing yourself
    if target_membership.userId == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    
    # Prevent removing SUPER_ADMIN unless you are SUPER_ADMIN
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if target_user and target_user.globalRole == UserRole.SUPER_ADMIN and current_user.globalRole != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Cannot remove SUPER_ADMIN")
    
    await db.delete(target_membership)
    await db.commit()
    
    return {"message": "User removed from organization"}

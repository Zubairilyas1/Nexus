from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, Enum as SQLEnum, Text, Index, UniqueConstraint, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
import enum
import uuid

Base = declarative_base()


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ORG_ADMIN = "ORG_ADMIN"
    PROJECT_ADMIN = "PROJECT_ADMIN"
    OPERATOR = "OPERATOR"
    VIEWER = "VIEWER"


class MembershipStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    REVOKED = "REVOKED"


class User(Base):
    __tablename__ = "User"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    passwordHash = Column("password", String(255), nullable=True)
    avatarUrl = Column(String(500), nullable=True)
    globalRole = Column(SQLEnum(UserRole, name="UserRole"), default=UserRole.VIEWER, nullable=False)
    emailVerified = Column(DateTime(timezone=True), nullable=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), default=func.now(), server_default=func.now(), onupdate=func.now(), nullable=False)
    lastLoginAt = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    memberships = relationship("Membership", back_populates="user", cascade="all, delete-orphan", foreign_keys="Membership.userId")
    projectMemberships = relationship("ProjectMembership", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    auditLogs = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")
    invitedMemberships = relationship("Membership", back_populates="invitedBy", foreign_keys="Membership.invitedById")
    
    __table_args__ = (Index("idx_user_email", "email"),)


class Organization(Base):
    __tablename__ = "Organization"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    logoUrl = Column(String(500), nullable=True)
    settings = Column(JSONB, nullable=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), default=func.now(), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    memberships = relationship("Membership", back_populates="organization", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="organization", cascade="all, delete-orphan")
    streams = relationship("Stream", back_populates="organization", cascade="all, delete-orphan")
    auditLogs = relationship("AuditLog", back_populates="organization", cascade="all, delete-orphan")
    
    __table_args__ = (Index("idx_org_slug", "slug"),)


class Project(Base):
    __tablename__ = "Project"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    organizationId = Column(String(36), ForeignKey("Organization.id", ondelete="CASCADE"), nullable=False, index=True)
    timezone = Column(String(50), default="UTC", nullable=False)
    retentionDays = Column(Integer, default=30, nullable=False)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), default=func.now(), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    organization = relationship("Organization", back_populates="projects")
    streams = relationship("Stream", back_populates="project", cascade="all, delete-orphan")
    zones = relationship("Zone", back_populates="project", cascade="all, delete-orphan")
    memberships = relationship("ProjectMembership", back_populates="project", cascade="all, delete-orphan")
    
    __table_args__ = (
        UniqueConstraint("organizationId", "slug", name="uq_project_org_slug"),
        Index("idx_project_org", "organizationId"),
    )


class Membership(Base):
    __tablename__ = "Membership"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String(36), ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    organizationId = Column(String(36), ForeignKey("Organization.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(SQLEnum(UserRole, name="UserRole"), default=UserRole.VIEWER, nullable=False)
    status = Column(SQLEnum(MembershipStatus, name="MembershipStatus"), default=MembershipStatus.PENDING, nullable=False)
    invitedById = Column(String(36), ForeignKey("User.id"), nullable=True)
    joinedAt = Column(DateTime(timezone=True), nullable=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), default=func.now(), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="memberships", foreign_keys=[userId])
    organization = relationship("Organization", back_populates="memberships")
    invitedBy = relationship("User", back_populates="invitedMemberships", foreign_keys=[invitedById])
    
    __table_args__ = (
        UniqueConstraint("userId", "organizationId", name="uq_membership_user_org"),
    )


class ProjectMembership(Base):
    __tablename__ = "ProjectMembership"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String(36), ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    projectId = Column(String(36), ForeignKey("Project.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(SQLEnum(UserRole, name="UserRole"), default=UserRole.VIEWER, nullable=False)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="projectMemberships")
    project = relationship("Project", back_populates="memberships")
    
    __table_args__ = (
        UniqueConstraint("userId", "projectId", name="uq_project_membership_user_project"),
    )


class Session(Base):
    __tablename__ = "Session"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String(36), ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    refreshToken = Column(String(500), unique=True, nullable=False, index=True)
    userAgent = Column(Text, nullable=True)
    ipAddress = Column(String(45), nullable=True)
    expiresAt = Column(DateTime(timezone=True), nullable=False)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="sessions")
    
    __table_args__ = (
        Index("idx_session_refresh_token", "refreshToken"),
        Index("idx_session_user", "userId"),
    )


class Stream(Base):
    __tablename__ = "Stream"
    
    streamId = Column(String(100), primary_key=True)
    rtspUrl = Column(String(500), nullable=True)
    youtubeUrl = Column(String(500), nullable=True)
    name = Column(String(255), nullable=False)
    frameWidth = Column(Integer, default=1280)
    frameHeight = Column(Integer, default=720)
    targetFps = Column(Integer, default=30)
    enabled = Column(Boolean, default=True)
    organizationId = Column(String(36), ForeignKey("Organization.id", ondelete="CASCADE"), nullable=False, index=True)
    projectId = Column(String(36), ForeignKey("Project.id", ondelete="SET NULL"), nullable=True, index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), default=func.now(), server_default=func.now(), onupdate=func.now(), nullable=False)
    homographyMatrix = Column(JSONB, nullable=True)
    calibrationPoints = Column(JSONB, nullable=True)
    
    # Relationships
    organization = relationship("Organization", back_populates="streams")
    project = relationship("Project", back_populates="streams")
    
    __table_args__ = (
        Index("idx_stream_org", "organizationId"),
        Index("idx_stream_project", "projectId"),
    )


class Zone(Base):
    __tablename__ = "Zone"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    label = Column(String(255), nullable=False)
    color = Column(String(7), default="#06b6d4")
    maxDwellMs = Column(Integer, default=30000)
    active = Column(Boolean, default=True)
    coordinates = Column(JSONB, nullable=False)
    totalEntries = Column(Integer, default=0)
    avgDwellMs = Column(Integer, default=0)
    projectId = Column(String(36), ForeignKey("Project.id", ondelete="CASCADE"), nullable=False, index=True)
    streamId = Column(String(100), nullable=True, index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), default=func.now(), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    project = relationship("Project", back_populates="zones")
    events = relationship("TrafficEvent", back_populates="zone", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("idx_zone_project", "projectId"),
        Index("idx_zone_stream", "streamId"),
    )


class TrafficEvent(Base):
    __tablename__ = "TrafficEvent"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    zoneId = Column(String(36), ForeignKey("Zone.id", ondelete="CASCADE"), nullable=False, index=True)
    trackId = Column(String(100), nullable=False, index=True)
    vehicleClass = Column(String(50), nullable=False)
    eventType = Column(String(50), nullable=False)
    confidence = Column(Integer, nullable=False)
    dwellTimeMs = Column(Integer, nullable=True)
    bbox = Column(JSONB, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    
    # Relationships
    zone = relationship("Zone", back_populates="events")
    
    __table_args__ = (
        Index("idx_traffic_event_zone_time", "zoneId", "timestamp"),
        Index("idx_traffic_event_track", "trackId"),
    )


class AuditLog(Base):
    __tablename__ = "AuditLog"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String(36), ForeignKey("User.id", ondelete="SET NULL"), nullable=True, index=True)
    organizationId = Column(String(36), ForeignKey("Organization.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)
    resource = Column(String(100), nullable=False)
    resourceId = Column(String(36), nullable=True)
    details = Column(JSONB, nullable=True)  # renamed from metadata (reserved)
    ipAddress = Column(String(45), nullable=True)
    userAgent = Column(Text, nullable=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="auditLogs")
    organization = relationship("Organization", back_populates="auditLogs")
    
    __table_args__ = (
        Index("idx_audit_log_user", "userId"),
        Index("idx_audit_log_org", "organizationId"),
        Index("idx_audit_log_action", "action"),
        Index("idx_audit_log_time", "createdAt"),
    )


class VerificationToken(Base):
    __tablename__ = "VerificationToken"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    token = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    type = Column(String(50), nullable=False)  # "email_verification", "password_reset", "invite"
    expiresAt = Column(DateTime(timezone=True), nullable=False)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    __table_args__ = (
        Index("idx_verification_token_token", "token"),
        Index("idx_verification_token_email_type", "email", "type"),
    )
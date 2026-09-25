"""Add indexes for multi-tenant queries.

Revision ID: 004
Revises: 003
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add composite indexes for common multi-tenant query patterns
    op.create_index(
        "idx_membership_org_status",
        "Membership",
        ["organizationId", "status"],
    )
    op.create_index(
        "idx_membership_user_status",
        "Membership",
        ["userId", "status"],
    )
    op.create_index(
        "idx_project_membership_user_project",
        "ProjectMembership",
        ["userId", "projectId"],
    )
    op.create_index(
        "idx_stream_org_project",
        "Stream",
        ["organizationId", "projectId"],
    )
    op.create_index(
        "idx_zone_project_active",
        "Zone",
        ["projectId", "active"],
    )
    op.create_index(
        "idx_traffic_event_zone_time_type",
        "TrafficEvent",
        ["zoneId", "timestamp", "eventType"],
    )


def downgrade() -> None:
    op.drop_index("idx_traffic_event_zone_time_type", table_name="TrafficEvent")
    op.drop_index("idx_zone_project_active", table_name="Zone")
    op.drop_index("idx_stream_org_project", table_name="Stream")
    op.drop_index("idx_project_membership_user_project", table_name="ProjectMembership")
    op.drop_index("idx_membership_user_status", table_name="Membership")
    op.drop_index("idx_membership_org_status", table_name="Membership")

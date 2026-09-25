"""TimescaleDB continuous aggregates for analytics

Revision ID: 003_timescaledb_aggregates
Revises: 
Create Date: 2026-09-03

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '003_timescaledb_aggregates'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable TimescaleDB extension (skip if not available)
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")
    
    # Create continuous aggregate: hourly zone metrics
    # This pre-computes per-zone per-hour aggregates for fast analytics queries
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_zone_metrics
        WITH (timescaledb.continuous) AS
        SELECT
            "zoneId" AS zone_id,
            time_bucket('1 hour', "timestamp") AS hour,
            "vehicleClass" AS vehicle_class,
            COUNT(*) AS count,
            AVG(CAST("dwellTimeMs" AS FLOAT)) AS avg_dwell_ms,
            COUNT(*) FILTER (WHERE "eventType" = 'dwell_exceeded') AS violations,
            MIN("timestamp") AS first_event,
            MAX("timestamp") AS last_event
        FROM "TrafficEvent"
        WHERE "zoneId" IS NOT NULL
        GROUP BY "zoneId", hour, "vehicleClass"
        WITH DATA
    """)
    
    # Add refresh policy: auto-refresh every hour
    op.execute("""
        SELECT add_continuous_aggregate_policy('hourly_zone_metrics',
            start_offset => INTERVAL '3 hours',
            end_offset => INTERVAL '1 hour',
            schedule_interval => INTERVAL '1 hour'
        )
    """)
    
    # Create continuous aggregate: daily zone summaries
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS daily_zone_metrics
        WITH (timescaledb.continuous) AS
        SELECT
            "zoneId" AS zone_id,
            time_bucket('1 day', "timestamp") AS day,
            COUNT(*) AS total_vehicles,
            COUNT(DISTINCT "trackId") AS unique_tracks,
            AVG(CAST("dwellTimeMs" AS FLOAT)) AS avg_dwell_ms,
            COUNT(*) FILTER (WHERE "eventType" = 'dwell_exceeded') AS violations,
            COUNT(DISTINCT "vehicleClass") AS vehicle_classes
        FROM "TrafficEvent"
        WHERE "zoneId" IS NOT NULL
        GROUP BY "zoneId", day
        WITH DATA
    """)
    
    # Add retention policy: drop data older than 90 days
    op.execute("""
        SELECT add_retention_policy('hourly_zone_metrics', INTERVAL '90 days')
    """)
    op.execute("""
        SELECT add_retention_policy('daily_zone_metrics', INTERVAL '365 days')
    """)
    
    # Create index on the continuous aggregate for fast queries
    op.create_index(
        'idx_hourly_zone_metrics_zone_hour',
        'hourly_zone_metrics',
        ['zone_id', 'hour']
    )
    op.create_index(
        'idx_daily_zone_metrics_zone_day',
        'daily_zone_metrics',
        ['zone_id', 'day']
    )


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS daily_zone_metrics CASCADE")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS hourly_zone_metrics CASCADE")

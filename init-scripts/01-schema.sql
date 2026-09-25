-- NexusVision Database Schema
-- Run on PostgreSQL 15+ with TimescaleDB extension for hypertables

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enum types
CREATE TYPE vehicle_class AS ENUM ('car', 'truck', 'bus', 'motorcycle', 'bicycle', 'pedestrian');
CREATE TYPE zone_event_type AS ENUM ('entered', 'exited', 'dwell_exceeded', 'anomaly');

-- Core tables
CREATE TABLE zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id VARCHAR(64) UNIQUE NOT NULL,
    label VARCHAR(128) NOT NULL,
    coordinates JSONB NOT NULL,  -- [(x,y), ...] normalized to video resolution
    max_dwell_ms INTEGER DEFAULT 30000,
    video_width INTEGER NOT NULL,
    video_height INTEGER NOT NULL,
    camera_source VARCHAR(256) NOT NULL DEFAULT 'default',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(64) NOT NULL DEFAULT 'system',
    
    CONSTRAINT valid_polygon CHECK (jsonb_array_length(coordinates) >= 3)
);

CREATE INDEX idx_zones_camera ON zones(camera_source);
CREATE INDEX idx_zones_active ON zones(active) WHERE active = true;

-- Partitioned traffic events table (by day)
CREATE TABLE traffic_events (
    id BIGSERIAL,
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    track_id VARCHAR(36) NOT NULL,  -- Ephemeral UUID, not linkable to PII
    vehicle_class vehicle_class NOT NULL,
    event_type zone_event_type NOT NULL,
    confidence DECIMAL(4,3) CHECK (confidence BETWEEN 0 AND 1),
    dwell_time_ms INTEGER,  -- NULL for 'entered' events
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Partitioning key
    event_date DATE GENERATED ALWAYS AS (DATE(timestamp)) STORED
) PARTITION BY RANGE (event_date);

-- Indexes on partitioned table (created on each partition automatically)
-- We define them here for documentation; they'll be created on each partition
-- CREATE INDEX idx_traffic_events_zone_time ON traffic_events (zone_id, timestamp DESC);
-- CREATE INDEX idx_traffic_events_track ON traffic_events (track_id, timestamp DESC);
-- CREATE INDEX idx_traffic_events_date ON traffic_events (event_date);

-- Create initial partitions (current month + next 2 months)
DO $$
DECLARE
    start_date DATE := DATE_TRUNC('month', CURRENT_DATE);
    end_date DATE := start_date + INTERVAL '3 months';
    partition_start DATE;
    partition_end DATE;
    partition_name TEXT;
BEGIN
    WHILE start_date < end_date LOOP
        partition_start := start_date;
        partition_end := start_date + INTERVAL '1 month';
        partition_name := 'traffic_events_' || TO_CHAR(partition_start, 'YYYY_MM');
        
        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF traffic_events FOR VALUES FROM (%L) TO (%L)',
            partition_name, partition_start, partition_end
        );
        
        -- Create indexes on each partition
        EXECUTE FORMAT('CREATE INDEX IF NOT EXISTS %I_zone_time ON %I (zone_id, timestamp DESC)', partition_name, partition_name);
        EXECUTE FORMAT('CREATE INDEX IF NOT EXISTS %I_track ON %I (track_id, timestamp DESC)', partition_name, partition_name);
        EXECUTE FORMAT('CREATE INDEX IF NOT EXISTS %I_date ON %I (event_date)', partition_name, partition_name);
        
        start_date := partition_end;
    END LOOP;
END $$;

-- Pre-aggregated rollups for fast dashboard queries
CREATE TABLE hourly_aggregates (
    id BIGSERIAL PRIMARY KEY,
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    hour_bucket TIMESTAMPTZ NOT NULL,
    vehicle_class vehicle_class NOT NULL,
    enter_count INTEGER NOT NULL DEFAULT 0,
    exit_count INTEGER NOT NULL DEFAULT 0,
    avg_dwell_seconds REAL,
    anomaly_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE (zone_id, hour_bucket, vehicle_class)
);

CREATE INDEX idx_hourly_zone_bucket ON hourly_aggregates (zone_id, hour_bucket DESC);
CREATE INDEX idx_hourly_bucket ON hourly_aggregates (hour_bucket DESC);

-- Daily aggregates (for longer-term trends)
CREATE TABLE daily_aggregates (
    id BIGSERIAL PRIMARY KEY,
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    day_bucket DATE NOT NULL,
    vehicle_class vehicle_class NOT NULL,
    enter_count INTEGER NOT NULL DEFAULT 0,
    exit_count INTEGER NOT NULL DEFAULT 0,
    avg_dwell_seconds REAL,
    anomaly_count INTEGER NOT NULL DEFAULT 0,
    peak_hour INTEGER,  -- Hour of day with max entries
    UNIQUE (zone_id, day_bucket, vehicle_class)
);

CREATE INDEX idx_daily_zone_bucket ON daily_aggregates (zone_id, day_bucket DESC);

-- Audit log for compliance
CREATE TABLE audit_log (
    log_id BIGSERIAL PRIMARY KEY,
    action VARCHAR(32) NOT NULL,  -- CREATE_ZONE, DELETE_ZONE, EXPORT_DATA, CONFIG_CHANGE
    user_id VARCHAR(64) NOT NULL,
    user_role VARCHAR(32),
    resource_type VARCHAR(32) NOT NULL,
    resource_id VARCHAR(64),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    hash_chain VARCHAR(64),  -- SHA-256 of previous row hash + current payload
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_user_time ON audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_log_resource ON audit_log (resource_type, resource_id);
CREATE INDEX idx_audit_log_created ON audit_log (created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for zones table
CREATE TRIGGER update_zones_updated_at BEFORE UPDATE ON zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to maintain hash chain for audit log
CREATE OR REPLACE FUNCTION maintain_audit_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(64);
    new_hash VARCHAR(64);
BEGIN
    -- Get previous hash
    SELECT hash_chain INTO prev_hash
    FROM audit_log
    ORDER BY log_id DESC
    LIMIT 1;
    
    -- Compute new hash
    IF prev_hash IS NULL THEN
        new_hash := encode(digest(NEW.details::text || NEW.created_at::text, 'sha256'), 'hex');
    ELSE
        new_hash := encode(digest(prev_hash || NEW.details::text || NEW.created_at::text, 'sha256'), 'hex');
    END IF;
    
    NEW.hash_chain := new_hash;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER audit_log_hash_chain BEFORE INSERT ON audit_log
    FOR EACH ROW EXECUTE FUNCTION maintain_audit_hash_chain();

-- View for zone summary
CREATE OR REPLACE VIEW zone_summary AS
SELECT
    z.id,
    z.zone_id,
    z.label,
    z.coordinates,
    z.max_dwell_ms,
    z.camera_source,
    z.active,
    z.created_at,
    COALESCE(SUM(ha.enter_count), 0) AS total_entries_today,
    COALESCE(SUM(ha.exit_count), 0) AS total_exits_today,
    COALESCE(AVG(ha.avg_dwell_seconds), 0) AS avg_dwell_seconds_today
FROM zones z
LEFT JOIN hourly_aggregates ha ON z.id = ha.zone_id
    AND ha.hour_bucket >= DATE_TRUNC('day', NOW())
GROUP BY z.id, z.zone_id, z.label, z.coordinates, z.max_dwell_ms, z.camera_source, z.active, z.created_at;

-- Grant permissions (adjust for production)
GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
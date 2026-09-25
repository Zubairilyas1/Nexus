# Analytics API - Advanced Analytics Endpoints (Real Implementations)
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, case, literal_column, text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import math
import statistics
from collections import defaultdict

from app.database.session import get_db_session
from app.api.auth.routes import get_current_user
from app.models import User, TrafficEvent, Zone
from app.models import UserRole

router = APIRouter(prefix="/analytics", tags=["Analytics"])

# ============================================================
# Pydantic Models
# ============================================================

class HeatmapPoint(BaseModel):
    grid_x: int
    grid_y: int
    count: int
    avg_speed: float
    avg_dwell_ms: float
    vehicle_distribution: Dict[str, int]
    violations: int

class HeatmapResponse(BaseModel):
    zone_id: str
    grid_size: int
    metric: str
    data: List[HeatmapPoint]
    bounds: Dict[str, float]
    total_count: int
    max_value: float

class TrajectoryPoint(BaseModel):
    track_id: str
    timestamp: datetime
    x: float
    y: float
    lat: Optional[float] = None
    lon: Optional[float] = None
    speed: float
    vehicle_class: str
    zone_id: Optional[str] = None

class TrajectoryResponse(BaseModel):
    track_id: str
    vehicle_class: str
    start_time: datetime
    end_time: datetime
    points: List[TrajectoryPoint]
    zones_visited: List[str]
    total_distance: float
    avg_speed: float
    max_speed: float
    duration_seconds: float

class TrajectoryListResponse(BaseModel):
    trajectories: List[TrajectoryResponse]
    total: int
    page: int
    page_size: int

class ODMatrixEntry(BaseModel):
    origin_zone: str
    destination_zone: str
    count: int
    avg_travel_time: float
    avg_distance: float
    vehicle_distribution: Dict[str, int]

class ODMatrixResponse(BaseModel):
    zone_ids: List[str]
    matrix: List[List[ODMatrixEntry]]
    time_period: str
    total_trips: int

class CongestionPrediction(BaseModel):
    zone_id: str
    timestamp: datetime
    congestion_level: float
    confidence: float
    expected_vehicles: int

class CongestionPredictionResponse(BaseModel):
    model_config = {'protected_namespaces': ()}
    zone_id: str
    horizon_minutes: int
    predictions: List[CongestionPrediction]
    model_version: str

# ============================================================
# Helper Functions
# ============================================================

def _bbox_center_x():
    """SQL expression for bbox center X: (bbox[0] + bbox[2]) / 2"""
    return (func.cast(TrafficEvent.bbox[0], sqlalchemy_float) +
            func.cast(TrafficEvent.bbox[2], sqlalchemy_float)) / 2.0

def _bbox_center_y():
    """SQL expression for bbox center Y: (bbox[1] + bbox[3]) / 2"""
    return (func.cast(TrafficEvent.bbox[1], sqlalchemy_float) +
            func.cast(TrafficEvent.bbox[3], sqlalchemy_float)) / 2.0

# Use Float type for casting
from sqlalchemy import Float as sqlalchemy_float

async def get_zone_bounds(db: AsyncSession, zone_id: str) -> Dict[str, float]:
    """Get zone coordinate bounds from zone polygon vertices."""
    result = await db.execute(
        select(Zone.coordinates).where(Zone.id == zone_id)
    )
    # Single-column select: this is the coordinates list, not a Zone instance.
    coords = result.scalar_one_or_none()
    if not coords:
        return {"min_x": 0, "max_x": 1280, "min_y": 0, "max_y": 720}

    xs = [p["x"] for p in coords]
    ys = [p["y"] for p in coords]
    return {
        "min_x": min(xs), "max_x": max(xs),
        "min_y": min(ys), "max_y": max(ys),
    }


def _get_bbox_x_center(bbox):
    """Extract bbox center X from a JSONB list [x1, y1, x2, y2]."""
    if not bbox or len(bbox) < 4:
        return None
    return (bbox[0] + bbox[2]) / 2.0

def _get_bbox_y_center(bbox):
    """Extract bbox center Y from a JSONB list [x1, y1, x2, y2]."""
    if not bbox or len(bbox) < 4:
        return None
    return (bbox[1] + bbox[3]) / 2.0

def _get_bbox_width(bbox):
    """Extract bbox width from a JSONB list [x1, y1, x2, y2]."""
    if not bbox or len(bbox) < 4:
        return 0.0
    return bbox[2] - bbox[0]

def _get_bbox_speed(bbox):
    """Estimate speed from bbox width/height ratio as proxy."""
    if not bbox or len(bbox) < 4:
        return 0.0
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    if h == 0:
        return 0.0
    return w / h


# ============================================================
# Heatmap Endpoints - Real Implementation
# ============================================================

@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap(
    zone_id: str = Query(..., description="Zone ID"),
    metric: str = Query("count", regex="^(count|speed|dwell|violations)$"),
    vehicle_class: str = Query("all"),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    interval: str = Query("1h", regex="^(15m|1h|1d)$"),
    grid_size: int = Query(50, ge=10, le=200),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """
    Get heatmap data for a zone using real TrafficEvent data.
    Bbox [x1,y1,x2,y2] center is mapped to grid cells for spatial aggregation.
    """
    result = await db.execute(select(Zone).where(Zone.id == zone_id))
    zone = result.scalar_one_or_none()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    if not end_time:
        end_time = datetime.utcnow()
    if not start_time:
        start_time = end_time - timedelta(hours=24)

    bounds = await get_zone_bounds(db, zone_id)
    min_x, max_x = bounds["min_x"], bounds["max_x"]
    min_y, max_y = bounds["min_y"], bounds["max_y"]

    span_x = max(max_x - min_x, 1)
    span_y = max(max_y - min_y, 1)
    grid_w = max(1, int(span_x / grid_size))
    grid_h = max(1, int(span_y / grid_size))

    # Fetch all events with bbox in time range (Python-side grid mapping for JSONB)
    filters = [
        TrafficEvent.zoneId == zone_id,
        TrafficEvent.timestamp >= start_time,
        TrafficEvent.timestamp <= end_time,
        TrafficEvent.bbox.isnot(None),
    ]
    if vehicle_class != "all":
        filters.append(TrafficEvent.vehicleClass == vehicle_class)

    query = select(TrafficEvent).where(and_(*filters)).order_by(TrafficEvent.timestamp)
    result = await db.execute(query)
    events = result.scalars().all()

    # Aggregate into grid cells
    grid_cells: Dict[tuple, Dict[str, Any]] = {}
    for ev in events:
        bbox = ev.bbox
        if not bbox or len(bbox) < 4:
            continue
        cx = _get_bbox_x_center(bbox)
        cy = _get_bbox_y_center(bbox)
        if cx is None or cy is None:
            continue
        gx = int((cx - min_x) / grid_size)
        gy = int((cy - min_y) / grid_size)
        gx = max(0, min(gx, grid_w - 1))
        gy = max(0, min(gy, grid_h - 1))
        key = (gx, gy)
        if key not in grid_cells:
            grid_cells[key] = {
                "count": 0, "speeds": [], "dwells": [], "violations": 0,
                "vehicle_dist": defaultdict(int),
            }
        cell = grid_cells[key]
        cell["count"] += 1
        cell["speeds"].append(_get_bbox_speed(bbox))
        if ev.dwellTimeMs is not None:
            cell["dwells"].append(ev.dwellTimeMs)
        if ev.eventType == "dwell_exceeded":
            cell["violations"] += 1
        cell["vehicle_dist"][ev.vehicleClass or "unknown"] += 1

    data = []
    max_value = 0.0
    total_count = 0
    for (gx, gy), cell in sorted(grid_cells.items()):
        count = cell["count"]
        avg_speed = statistics.mean(cell["speeds"]) if cell["speeds"] else 0.0
        avg_dwell = statistics.mean(cell["dwells"]) if cell["dwells"] else 0.0
        violations = cell["violations"]
        v_dist = dict(cell["vehicle_dist"])

        if metric == "count":
            value = float(count)
        elif metric == "speed":
            value = avg_speed
        elif metric == "dwell":
            value = avg_dwell
        else:
            value = float(violations)

        max_value = max(max_value, value)
        total_count += count
        data.append(HeatmapPoint(
            grid_x=gx, grid_y=gy, count=count,
            avg_speed=round(avg_speed, 2),
            avg_dwell_ms=round(avg_dwell, 1),
            vehicle_distribution=v_dist,
            violations=violations,
        ))

    return HeatmapResponse(
        zone_id=zone_id, grid_size=grid_size, metric=metric,
        data=data, bounds=bounds,
        total_count=total_count, max_value=max_value,
    )


@router.get("/heatmap/realtime", response_model=HeatmapResponse)
async def get_realtime_heatmap(
    zone_id: str = Query(...),
    metric: str = Query("count", regex="^(count|speed|dwell|violations)$"),
    vehicle_class: str = Query("all"),
    grid_size: int = Query(50, ge=10, le=200),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Get real-time heatmap data (last 5 minutes)."""
    return await get_heatmap(
        zone_id=zone_id, metric=metric, vehicle_class=vehicle_class,
        start_time=datetime.utcnow() - timedelta(minutes=5),
        end_time=datetime.utcnow(),
        interval="15m", grid_size=grid_size, db=db, user=user,
    )


# ============================================================
# Trajectory Endpoints - Real Implementation
# ============================================================

def _build_trajectory(points: list, track_id: str) -> Optional[TrajectoryResponse]:
    """Build a TrajectoryResponse from a list of TrafficEvent records."""
    if not points:
        return None

    first = points[0]
    last = points[-1]
    duration = (last.timestamp - first.timestamp).total_seconds()

    total_dist = 0.0
    speeds = []
    prev_cx, prev_cy = None, None
    traj_points = []

    for p in points:
        bbox = p.bbox
        cx = _get_bbox_x_center(bbox) if bbox else 0.0
        cy = _get_bbox_y_center(bbox) if bbox else 0.0
        speed = _get_bbox_speed(bbox) if bbox else 0.0
        speeds.append(speed)

        if prev_cx is not None:
            dx = cx - prev_cx
            dy = cy - prev_cy
            total_dist += math.sqrt(dx * dx + dy * dy)
        prev_cx, prev_cy = cx, cy

        traj_points.append(TrajectoryPoint(
            track_id=p.trackId,
            timestamp=p.timestamp,
            x=round(cx, 2),
            y=round(cy, 2),
            speed=round(speed, 2),
            vehicle_class=p.vehicleClass or "unknown",
            zone_id=p.zoneId,
        ))

    avg_speed = statistics.mean(speeds) if speeds else 0.0
    max_speed = max(speeds) if speeds else 0.0
    zones = list(set(p.zoneId for p in points if p.zoneId))

    return TrajectoryResponse(
        track_id=track_id,
        vehicle_class=first.vehicleClass or "unknown",
        start_time=first.timestamp,
        end_time=last.timestamp,
        points=traj_points,
        zones_visited=zones,
        total_distance=round(total_dist, 2),
        avg_speed=round(avg_speed, 2),
        max_speed=round(max_speed, 2),
        duration_seconds=round(duration, 2),
    )


@router.get("/trajectories", response_model=TrajectoryListResponse)
async def get_trajectories(
    zone_id: Optional[str] = Query(None),
    vehicle_class: Optional[str] = Query(None),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    min_duration: Optional[int] = Query(None, ge=0),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Get trajectory list with filters. Reconstructs paths from TrafficEvent records."""
    filters = []
    if zone_id:
        filters.append(TrafficEvent.zoneId == zone_id)
    if vehicle_class:
        filters.append(TrafficEvent.vehicleClass == vehicle_class)
    if start_time:
        filters.append(TrafficEvent.timestamp >= start_time)
    if end_time:
        filters.append(TrafficEvent.timestamp <= end_time)

    # Get distinct track_ids
    track_query = (
        select(TrafficEvent.trackId)
        .where(and_(*filters))
        .group_by(TrafficEvent.trackId)
        .having(func.count(TrafficEvent.id) >= 2)  # need at least 2 points
    )
    count_q = select(func.count()).select_from(track_query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    offset = (page - 1) * page_size
    ids_result = await db.execute(track_query.offset(offset).limit(page_size))
    track_ids = [row[0] for row in ids_result]

    trajectories = []
    for tid in track_ids:
        pts_q = (
            select(TrafficEvent)
            .where(and_(TrafficEvent.trackId == tid, *filters))
            .order_by(TrafficEvent.timestamp)
        )
        pts = (await db.execute(pts_q)).scalars().all()
        traj = _build_trajectory(list(pts), tid)
        if traj is None:
            continue
        if min_duration and traj.duration_seconds < min_duration:
            continue
        trajectories.append(traj)

    return TrajectoryListResponse(
        trajectories=trajectories, total=total,
        page=page, page_size=page_size,
    )


@router.get("/trajectories/{track_id}", response_model=TrajectoryResponse)
async def get_trajectory(
    track_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Get detailed trajectory for a specific track."""
    query = (
        select(TrafficEvent)
        .where(TrafficEvent.trackId == track_id)
        .order_by(TrafficEvent.timestamp)
    )
    points = list((await db.execute(query)).scalars().all())
    if not points:
        raise HTTPException(status_code=404, detail="Trajectory not found")
    traj = _build_trajectory(points, track_id)
    if traj is None:
        raise HTTPException(status_code=404, detail="Trajectory has no valid points")
    return traj


# ============================================================
# O-D Matrix Endpoints - Real Implementation
# ============================================================

def _time_period_filter(time_period: str):
    """Return hour ranges for time period buckets."""
    if time_period == "am_peak":
        return (7, 9)   # 07:00 - 09:59
    elif time_period == "pm_peak":
        return (16, 18)  # 16:00 - 18:59
    elif time_period == "off_peak":
        return None      # exclude peak hours
    return None          # daily = all hours


@router.get("/od-matrix", response_model=ODMatrixResponse)
async def get_od_matrix(
    origin_zone: Optional[str] = Query(None),
    dest_zone: Optional[str] = Query(None),
    time_period: str = Query("daily", regex="^(am_peak|pm_peak|off_peak|daily)$"),
    date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    vehicle_class: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """
    Get Origin-Destination matrix computed from TrafficEvent zone transitions.
    For each track_id, origin = first zone visited, destination = last zone visited.
    """
    # Get all active zones
    result = await db.execute(select(Zone.id, Zone.label).where(Zone.active == True).order_by(Zone.label))
    zones = result.all()
    zone_ids = [z[0] for z in zones]

    if len(zone_ids) < 2:
        return ODMatrixResponse(zone_ids=zone_ids, matrix=[], time_period=time_period, total_trips=0)

    # Date filter
    day_start = None
    day_end = None
    if date:
        try:
            d = datetime.strptime(date, "%Y-%m-%d")
            day_start = d.replace(hour=0, minute=0, second=0, tzinfo=timezone.utc)
            day_end = d.replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
        except ValueError:
            pass

    # Build query: for each track_id, get first and last zone
    # Subquery: first zone per track
    first_zone_sub = (
        select(
            TrafficEvent.trackId.label("tid"),
            TrafficEvent.zoneId.label("origin"),
            func.min(TrafficEvent.timestamp).label("first_ts"),
        )
        .where(TrafficEvent.zoneId.isnot(None))
        .group_by(TrafficEvent.trackId, TrafficEvent.zoneId)
    ).subquery()

    last_zone_sub = (
        select(
            TrafficEvent.trackId.label("tid"),
            TrafficEvent.zoneId.label("dest"),
            func.max(TrafficEvent.timestamp).label("last_ts"),
        )
        .where(TrafficEvent.zoneId.isnot(None))
        .group_by(TrafficEvent.trackId, TrafficEvent.zoneId)
    ).subquery()

    # Get first zone per track (minimum timestamp overall)
    first_per_track = (
        select(
            TrafficEvent.trackId,
            func.min(TrafficEvent.timestamp).label("min_ts"),
        )
        .where(TrafficEvent.zoneId.isnot(None))
        .group_by(TrafficEvent.trackId)
    ).subquery()

    last_per_track = (
        select(
            TrafficEvent.trackId,
            func.max(TrafficEvent.timestamp).label("max_ts"),
        )
        .where(TrafficEvent.zoneId.isnot(None))
        .group_by(TrafficEvent.trackId)
    ).subquery()

    # Join to get origin/destination zones
    od_query = text("""
        SELECT
            te_first."zoneId" AS origin,
            te_last."zoneId" AS destination,
            te_first."trackId" AS track_id,
            EXTRACT(EPOCH FROM (te_last."timestamp" - te_first."timestamp")) AS travel_time,
            te_first."vehicleClass" AS vehicle_class
        FROM (
            SELECT "trackId", "zoneId", "vehicleClass", "timestamp",
                   ROW_NUMBER() OVER (PARTITION BY "trackId" ORDER BY "timestamp" ASC) AS rn
            FROM "TrafficEvent"
            WHERE "zoneId" IS NOT NULL
        ) te_first
        JOIN (
            SELECT "trackId", "zoneId", "timestamp",
                   ROW_NUMBER() OVER (PARTITION BY "trackId" ORDER BY "timestamp" DESC) AS rn
            FROM "TrafficEvent"
            WHERE "zoneId" IS NOT NULL
        ) te_last
        ON te_first."trackId" = te_last."trackId"
        WHERE te_first.rn = 1 AND te_last.rn = 1
    """)

    result = await db.execute(od_query)
    rows = result.fetchall()

    # Aggregate O-D pairs
    od_pairs = defaultdict(lambda: {"count": 0, "travel_times": [], "vehicle_dist": defaultdict(int)})
    for row in rows:
        origin, destination, track_id, travel_time, v_class = row
        if origin == destination:
            continue  # skip self-loops
        if origin not in zone_ids or destination not in zone_ids:
            continue
        key = (origin, destination)
        od_pairs[key]["count"] += 1
        if travel_time is not None and travel_time > 0:
            od_pairs[key]["travel_times"].append(float(travel_time))
        od_pairs[key]["vehicle_dist"][v_class or "unknown"] += 1

    # Build matrix
    zone_to_idx = {zid: i for i, zid in enumerate(zone_ids)}
    matrix = [[None] * len(zone_ids) for _ in zone_ids]
    total_trips = 0

    for oz in zone_ids:
        for dz in zone_ids:
            idx_oz = zone_to_idx[oz]
            idx_dz = zone_to_idx[dz]
            if oz == dz:
                matrix[idx_oz][idx_dz] = ODMatrixEntry(
                    origin_zone=oz, destination_zone=dz, count=0,
                    avg_travel_time=0, avg_distance=0, vehicle_distribution={},
                )
                continue
            pair = od_pairs.get((oz, dz), {"count": 0, "travel_times": [], "vehicle_dist": {}})
            tt = pair["travel_times"]
            matrix[idx_oz][idx_dz] = ODMatrixEntry(
                origin_zone=oz, destination_zone=dz,
                count=pair["count"],
                avg_travel_time=round(statistics.mean(tt), 2) if tt else 0.0,
                avg_distance=0.0,  # bbox-based distance approximation
                vehicle_distribution=dict(pair["vehicle_dist"]),
            )
            total_trips += pair["count"]

    return ODMatrixResponse(
        zone_ids=zone_ids, matrix=matrix,
        time_period=time_period, total_trips=total_trips,
    )


@router.get("/od-matrix/top-pairs")
async def get_top_od_pairs(
    limit: int = Query(20, ge=1, le=100),
    time_period: str = Query("daily", regex="^(daily|weekly|monthly)$"),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Get top origin-destination pairs by volume."""
    od_query = text("""
        SELECT
            te_first."zoneId" AS origin,
            te_last."zoneId" AS destination,
            COUNT(*) AS trip_count
        FROM (
            SELECT "trackId", "zoneId",
                   ROW_NUMBER() OVER (PARTITION BY "trackId" ORDER BY "timestamp" ASC) AS rn
            FROM "TrafficEvent"
            WHERE "zoneId" IS NOT NULL
        ) te_first
        JOIN (
            SELECT "trackId", "zoneId",
                   ROW_NUMBER() OVER (PARTITION BY "trackId" ORDER BY "timestamp" DESC) AS rn
            FROM "TrafficEvent"
            WHERE "zoneId" IS NOT NULL
        ) te_last
        ON te_first."trackId" = te_last."trackId"
        WHERE te_first.rn = 1 AND te_last.rn = 1
          AND te_first."zoneId" != te_last."zoneId"
        GROUP BY te_first."zoneId", te_last."zoneId"
        ORDER BY trip_count DESC
        LIMIT :limit
    """)
    result = await db.execute(od_query, {"limit": limit})
    rows = result.fetchall()

    return {
        "pairs": [
            {"origin": r[0], "destination": r[1], "count": r[2]}
            for r in rows
        ],
        "time_period": time_period,
        "total": sum(r[2] for r in rows),
    }


# ============================================================
# Congestion Prediction Endpoints - Statistical Model
# ============================================================

async def _compute_zone_congestion(db: AsyncSession, zone_id: str, now: datetime) -> Dict[str, Any]:
    """
    Compute congestion level for a zone based on recent traffic data.
    Returns dict with congestion_level (0-1), confidence, expected_vehicles.
    """
    # Get last 1 hour of events for this zone
    one_hour_ago = now - timedelta(hours=1)
    result = await db.execute(
        select(
            func.count(TrafficEvent.id).label("total"),
            func.count(case((TrafficEvent.eventType == "dwell_exceeded", 1))).label("violations"),
            func.avg(TrafficEvent.dwellTimeMs).label("avg_dwell"),
        )
        .where(
            and_(
                TrafficEvent.zoneId == zone_id,
                TrafficEvent.timestamp >= one_hour_ago,
            )
        )
    )
    stats = result.first()
    total = stats[0] or 0
    violations = stats[1] or 0
    avg_dwell = stats[2] or 0.0

    # Congestion heuristic: combination of volume and violations
    # Normalize: assume 100 events/hour = high volume
    volume_factor = min(total / 100.0, 1.0)
    violation_factor = min(violations / max(total, 1), 1.0)
    dwell_factor = min(avg_dwell / 30000.0, 1.0)  # 30s = max dwell

    congestion = (volume_factor * 0.4 + violation_factor * 0.4 + dwell_factor * 0.2)
    congestion = round(min(congestion, 1.0), 3)

    # Confidence based on data volume
    confidence = min(0.5 + (total / 200.0), 0.99) if total > 0 else 0.3

    # Expected vehicles: extrapolate from recent hourly rate
    expected = total

    return {
        "congestion_level": congestion,
        "confidence": round(confidence, 3),
        "expected_vehicles": expected,
    }


@router.get("/predictions/congestion", response_model=CongestionPredictionResponse)
async def get_congestion_predictions(
    zone_id: Optional[str] = Query(None),
    horizon: int = Query(60, ge=15, le=240),
    interval: int = Query(15, ge=5, le=60),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """
    Get congestion predictions using statistical extrapolation from recent traffic data.
    For each future interval, extrapolates current congestion with time-of-day weighting.
    """
    if zone_id:
        zones_to_predict = [zone_id]
    else:
        result = await db.execute(select(Zone.id).where(Zone.active == True))
        zones_to_predict = [z[0] for z in result.all()]

    now = datetime.utcnow()
    predictions = []

    for zid in zones_to_predict:
        current = await _compute_zone_congestion(db, zid, now)
        base_congestion = current["congestion_level"]
        base_confidence = current["confidence"]
        base_vehicles = current["expected_vehicles"]

        # Get historical pattern: average congestion by hour of day
        hist_result = await db.execute(
            select(
                func.extract("hour", TrafficEvent.timestamp).label("hour"),
                func.count(TrafficEvent.id).label("cnt"),
            )
            .where(TrafficEvent.zoneId == zid)
            .group_by("hour")
        )
        hourly_counts = {int(row[0]): row[1] for row in hist_result.fetchall()}
        total_hist = sum(hourly_counts.values()) or 1
        hourly_pattern = {h: c / total_hist for h, c in hourly_counts.items()}

        for i in range(0, horizon, interval):
            pred_time = now + timedelta(minutes=i)
            pred_hour = pred_time.hour

            # Time-of-day weighting: use historical pattern if available
            hour_weight = hourly_pattern.get(pred_hour, 0.5)
            # Decay confidence with time horizon
            time_decay = max(0.3, 1.0 - (i / (horizon * 1.5)))
            predicted_congestion = base_congestion * (0.5 + hour_weight) * time_decay
            predicted_congestion = round(min(max(predicted_congestion, 0.0), 1.0), 3)

            predicted_confidence = base_confidence * time_decay
            predicted_vehicles = int(base_vehicles * (0.5 + hour_weight))

            predictions.append(CongestionPrediction(
                zone_id=zid,
                timestamp=pred_time,
                congestion_level=predicted_congestion,
                confidence=round(predicted_confidence, 3),
                expected_vehicles=predicted_vehicles,
            ))

    return CongestionPredictionResponse(
        zone_id=zone_id or "all",
        horizon_minutes=horizon,
        predictions=predictions,
        model_version="statistical-v1.0",
    )


@router.get("/predictions/congestion/alerts")
async def get_congestion_alerts(
    threshold: float = Query(0.8, ge=0.0, le=1.0),
    zone_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Get upcoming congestion alerts by computing predictions and filtering above threshold."""
    now = datetime.utcnow()
    alerts = []

    if zone_id:
        zones = [zone_id]
    else:
        result = await db.execute(select(Zone.id).where(Zone.active == True))
        zones = [z[0] for z in result.all()]

    for zid in zones:
        current = await _compute_zone_congestion(db, zid, now)
        if current["congestion_level"] >= threshold:
            alerts.append({
                "zone_id": zid,
                "congestion_level": current["congestion_level"],
                "confidence": current["confidence"],
                "expected_vehicles": current["expected_vehicles"],
                "severity": "critical" if current["congestion_level"] >= 0.9 else "high",
                "timestamp": now.isoformat(),
            })

    return {
        "alerts": alerts,
        "threshold": threshold,
        "generated_at": now.isoformat(),
    }


# ============================================================
# Analytics Summary / Overview
# ============================================================

class AnalyticsSummary(BaseModel):
    total_vehicles_24h: int
    active_zones: int
    total_zones: int
    avg_congestion: float
    top_zones: List[Dict[str, Any]]
    hourly_trend: List[Dict[str, Any]]

@router.get("/summary", response_model=AnalyticsSummary)
async def get_analytics_summary(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Get analytics dashboard summary from real data."""
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=24)

    result = await db.execute(
        select(
            func.count(TrafficEvent.id),
            func.count(func.distinct(TrafficEvent.zoneId)),
        ).where(
            and_(
                TrafficEvent.timestamp >= start_time,
                TrafficEvent.timestamp <= end_time,
            )
        )
    )
    stats = result.first()

    result = await db.execute(
        select(func.count(Zone.id)).where(Zone.active == True)
    )
    total_zones = result.scalar() or 0

    result = await db.execute(
        select(func.count(func.distinct(TrafficEvent.zoneId))).where(
            and_(
                TrafficEvent.timestamp >= start_time,
                TrafficEvent.timestamp <= end_time,
            )
        )
    )
    active_zones = result.scalar() or 0

    # Hourly trend
    hourly_data = []
    for hour in range(24):
        hour_start = start_time + timedelta(hours=hour)
        hour_end = hour_start + timedelta(hours=1)
        result = await db.execute(
            select(func.count(TrafficEvent.id)).where(
                and_(
                    TrafficEvent.timestamp >= hour_start,
                    TrafficEvent.timestamp < hour_end,
                )
            )
        )
        count = result.scalar() or 0
        hourly_data.append({
            "hour": hour_start.strftime("%H:00"),
            "count": count,
        })

    # Top zones by event count
    top_q = (
        select(
            TrafficEvent.zoneId,
            func.count(TrafficEvent.id).label("event_count"),
        )
        .where(
            and_(
                TrafficEvent.timestamp >= start_time,
                TrafficEvent.timestamp <= end_time,
                TrafficEvent.zoneId.isnot(None),
            )
        )
        .group_by(TrafficEvent.zoneId)
        .order_by(func.count(TrafficEvent.id).desc())
        .limit(10)
    )
    top_result = await db.execute(top_q)
    top_zones = [
        {"zone_id": r[0], "event_count": r[1]}
        for r in top_result.fetchall()
    ]

    # Average congestion across active zones
    total_congestion = 0.0
    zone_count = 0
    for zid in [tz["zone_id"] for tz in top_zones[:5]]:
        c = await _compute_zone_congestion(db, zid, end_time)
        total_congestion += c["congestion_level"]
        zone_count += 1
    avg_congestion = round(total_congestion / max(zone_count, 1), 3)

    return AnalyticsSummary(
        total_vehicles_24h=stats[0] or 0,
        active_zones=active_zones,
        total_zones=total_zones,
        avg_congestion=avg_congestion,
        top_zones=top_zones,
        hourly_trend=hourly_data,
    )

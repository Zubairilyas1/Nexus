# Zones API - Persistent zone configuration backed by PostgreSQL
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db_session
from app.models import Project, Zone

router = APIRouter()

DEFAULT_ZONE_COLOR = "#06b6d4"


class ZoneCoordinate(BaseModel):
    x: float = Field(ge=0, le=3840)
    y: float = Field(ge=0, le=2160)


class ZoneCreate(BaseModel):
    zone_id: Optional[str] = Field(default=None, min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    label: str = Field(min_length=1, max_length=255)
    coordinates: List[ZoneCoordinate] = Field(min_length=3, max_length=12)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    max_dwell_ms: int = Field(default=30000, ge=1000)
    project_id: Optional[str] = None
    stream_id: Optional[str] = Field(default=None, description="Optional stream ID to bind this zone to")


class ZoneUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=255)
    coordinates: Optional[List[ZoneCoordinate]] = Field(default=None, min_length=3, max_length=12)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    max_dwell_ms: Optional[int] = Field(default=None, ge=1000)
    active: Optional[bool] = None


class ZoneResponse(BaseModel):
    zone_id: str
    label: str
    stream_id: Optional[str] = None
    color: str
    coordinates: List[ZoneCoordinate]
    max_dwell_ms: int
    active: bool
    total_entries: int
    avg_dwell_ms: float
    project_id: str
    created_at: str


def _segments_intersect(p1, p2, p3, p4) -> bool:
    def orientation(a, b, c):
        val = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
        if abs(val) < 1e-9:
            return 0
        return 1 if val > 0 else 2

    def on_segment(a, b, c):
        return (
            min(a[0], b[0]) <= c[0] <= max(a[0], b[0])
            and min(a[1], b[1]) <= c[1] <= max(a[1], b[1])
        )

    o1 = orientation(p1, p2, p3)
    o2 = orientation(p1, p2, p4)
    o3 = orientation(p3, p4, p1)
    o4 = orientation(p3, p4, p2)

    if o1 != o2 and o3 != o4:
        return True
    if o1 == 0 and on_segment(p1, p2, p3):
        return True
    if o2 == 0 and on_segment(p1, p2, p4):
        return True
    if o3 == 0 and on_segment(p3, p4, p1):
        return True
    if o4 == 0 and on_segment(p3, p4, p2):
        return True
    return False


def _validate_polygon(points: List[ZoneCoordinate]) -> None:
    pts = [(p.x, p.y) for p in points]
    n = len(pts)
    for i in range(n):
        for j in range(i + 1, n):
            # Adjacent edges share a vertex and always "touch" - skip that pair
            if (i == 0 and j == n - 1) or j == i + 1:
                continue
            if _segments_intersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Zone polygon is self-intersecting",
                )


def _to_response(zone: Zone, current_count: int = 0) -> ZoneResponse:
    return ZoneResponse(
        zone_id=zone.id,
        label=zone.label,
        stream_id=zone.streamId,
        color=zone.color or DEFAULT_ZONE_COLOR,
        coordinates=[ZoneCoordinate(x=p["x"], y=p["y"]) for p in zone.coordinates],
        max_dwell_ms=zone.maxDwellMs,
        active=zone.active,
        total_entries=zone.totalEntries or 0,
        avg_dwell_ms=float(zone.avgDwellMs or 0),
        project_id=zone.projectId,
        created_at=zone.createdAt.isoformat() if zone.createdAt else datetime.now(timezone.utc).isoformat(),
    )


async def _resolve_project_id(db: AsyncSession, requested: Optional[str]) -> str:
    if requested:
        result = await db.execute(select(Project).where(Project.id == requested))
        if result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project '{requested}' not found",
            )
        return requested

    result = await db.execute(select(Project).order_by(Project.createdAt).limit(1))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No project exists. Create a project before defining zones.",
        )
    return project.id


@router.post("", response_model=ZoneResponse, status_code=status.HTTP_201_CREATED)
async def create_zone(zone: ZoneCreate, db: AsyncSession = Depends(get_db_session)):
    """Create a new monitoring zone (persisted in PostgreSQL)."""
    _validate_polygon(zone.coordinates)

    zone_id = zone.zone_id
    if zone_id:
        existing = await db.execute(select(Zone).where(Zone.id == zone_id))
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Zone '{zone_id}' already exists",
            )

    project_id = await _resolve_project_id(db, zone.project_id)

    row = Zone(
        id=zone_id,
        label=zone.label,
        color=zone.color or DEFAULT_ZONE_COLOR,
        maxDwellMs=zone.max_dwell_ms,
        active=True,
        coordinates=[{"x": c.x, "y": c.y} for c in zone.coordinates],
        projectId=project_id,
        streamId=zone.stream_id,
    )
    db.add(row)
    await db.commit()
    await sync_zone_to_pipelines(row)
    await db.refresh(row)
    return _to_response(row)


@router.get("", response_model=List[ZoneResponse])
async def list_zones(stream_id: Optional[str] = None, db: AsyncSession = Depends(get_db_session)):
    """List all configured zones."""
    query = select(Zone).order_by(Zone.createdAt)
    if stream_id:
        query = query.where((Zone.streamId == stream_id) | (Zone.streamId.is_(None)))
    result = await db.execute(query)
    zones = result.scalars().all()
    
    zone_ids = [z.id for z in zones]
    live_states = await get_live_states(zone_ids)
    
    return [_to_response(z, current_count=live_states.get(z.id, {}).get("current", 0)) for z in zones]


@router.get("/{zone_id}", response_model=ZoneResponse)
async def get_zone(zone_id: str, db: AsyncSession = Depends(get_db_session)):
    """Get a specific zone by ID."""
    zone = await _get_zone_or_404(db, zone_id)
    live_states = await get_live_states([zone.id])
    return _to_response(zone, current_count=live_states.get(zone.id, {}).get("current", 0))


@router.patch("/{zone_id}", response_model=ZoneResponse)
async def update_zone(zone_id: str, update: ZoneUpdate, db: AsyncSession = Depends(get_db_session)):
    """Update a zone configuration."""
    zone = await _get_zone_or_404(db, zone_id)

    if update.coordinates is not None:
        _validate_polygon(update.coordinates)
        zone.coordinates = [{"x": c.x, "y": c.y} for c in update.coordinates]
    if update.label is not None:
        zone.label = update.label
    if update.color is not None:
        zone.color = update.color
    if update.max_dwell_ms is not None:
        zone.maxDwellMs = update.max_dwell_ms
    if update.active is not None:
        zone.active = update.active

    await db.commit()
    await db.refresh(zone)
    return _to_response(zone)


@router.delete("/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_zone(zone_id: str, db: AsyncSession = Depends(get_db_session)):
    """Delete a zone."""
    zone = await _get_zone_or_404(db, zone_id)
    await db.delete(zone)
    await db.commit()
    await remove_zone_from_pipelines(zone_id)


async def _get_zone_or_404(db: AsyncSession, zone_id: str) -> Zone:
    result = await db.execute(select(Zone).where(Zone.id == zone_id))
    zone = result.scalar_one_or_none()
    if zone is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zone '{zone_id}' not found",
        )
    return zone

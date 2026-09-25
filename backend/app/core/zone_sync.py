from sqlalchemy import select
from app.database.session import get_session_factory
from app.models import Zone
import app.core.spatial as spatial

async def load_zones_for_pipeline(pipeline, stream_id: str):
    """Load matching zones from DB into the given pipeline's spatial engine."""
    factory = get_session_factory()
    async with factory() as db:
        query = select(Zone).where(Zone.active == True)
        query = query.where((Zone.streamId == stream_id) | (Zone.streamId.is_(None)))
        result = await db.execute(query)
        zones = result.scalars().all()
        
        for z in zones:
            pts = [(p["x"], p["y"]) for p in z.coordinates]
            zone_obj = spatial.Zone(
                zone_id=z.id,
                coordinates=pts,
                label=z.label,
                max_dwell_ms=z.maxDwellMs,
            )
            pipeline.add_zone(zone_obj)

async def sync_zone_to_pipelines(zone_row: Zone):
    """Push a zone to running pipelines after a DB update."""
    from app.core.multi_pipeline import multi_pipeline
    
    stream_id = zone_row.streamId
    pipelines_to_update = []
    
    if stream_id is None:
        pipelines_to_update = [multi_pipeline.get_pipeline(sid) for sid in multi_pipeline.pipelines.keys()]
    else:
        p = multi_pipeline.get_pipeline(stream_id)
        if p:
            pipelines_to_update.append(p)
            
    pts = [(p["x"], p["y"]) for p in zone_row.coordinates]
    for p in pipelines_to_update:
        if p is None: continue
        # To handle updates, remove and re-add
        p.remove_zone(zone_row.id)
        if zone_row.active:
            zone_obj = spatial.Zone(
                zone_id=zone_row.id,
                coordinates=pts,
                label=zone_row.label,
                max_dwell_ms=zone_row.maxDwellMs,
            )
            p.add_zone(zone_obj)

async def remove_zone_from_pipelines(zone_id: str):
    """Remove a zone from all running pipelines."""
    from app.core.multi_pipeline import multi_pipeline
    for p in multi_pipeline.pipelines.values():
        p.remove_zone(zone_id)

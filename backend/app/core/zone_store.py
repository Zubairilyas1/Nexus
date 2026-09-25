from app.database.redis_client import get_redis
import json

async def record_zone_events(events: list):
    """Update Redis live state for zone current counts."""
    try:
        redis = get_redis()
    except RuntimeError:
        return
        return
        
    try:
        pipeline = redis_client.redis.pipeline()
        for ev in events:
            zone_id = ev.get("zone_id")
            event_type = ev.get("event_type")
            if not zone_id or not event_type:
                continue
                
            current_key = f"zone:{zone_id}:current"
            total_key = f"zone:{zone_id}:total"
            
            if event_type == "entered":
                pipeline.incr(current_key)
                pipeline.incr(total_key)
            elif event_type == "exited":
                pipeline.decr(current_key)
                
        await pipeline.execute()
    except Exception as e:
        import structlog
        logger = structlog.get_logger()
        logger.error("Failed to update redis zone state", error=str(e))

async def get_live_states(zone_ids: list) -> dict:
    """Get live states for a list of zones."""
    try:
        redis = get_redis()
    except RuntimeError:
        return {}
    if not zone_ids:
        return {}
        
    try:
        pipeline = redis.pipeline()
        for zid in zone_ids:
            pipeline.get(f"zone:{zid}:current")
            pipeline.get(f"zone:{zid}:total")
            
        results = await pipeline.execute()
        
        live_state = {}
        for i, zid in enumerate(zone_ids):
            current_val = results[i*2]
            total_val = results[i*2 + 1]
            live_state[zid] = {
                "current": int(current_val) if current_val else 0,
                "total": int(total_val) if total_val else 0
            }
        return live_state
    except Exception as e:
        return {}

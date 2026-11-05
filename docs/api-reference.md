# NexusVision API Reference

## Base URL
```
http://localhost:8000
```

## Authentication
All `/api/*` endpoints require a JWT token in the `Authorization` header:
```
Authorization: Bearer <token>
```

### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}

Response: { "access_token": "...", "token_type": "bearer" }
```

### Register
```
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password",
  "name": "User Name"
}
```

---

## Health
```
GET /healthz
Response: { "status": "ok", "version": "1.0.0" }
```

---

## Zones
```
GET    /api/zones              - List all zones
POST   /api/zones              - Create zone
GET    /api/zones/{id}         - Get zone
PUT    /api/zones/{id}         - Update zone
DELETE /api/zones/{id}         - Delete zone
POST   /api/zones/bulk         - Bulk operations (activate/deactivate/delete)
```

### Zone Object
```json
{
  "id": "zone_1",
  "label": "Main Lane",
  "color": "#3b82f6",
  "points": [{"x": 300, "y": 300}, {"x": 980, "y": 300}],
  "maxDwellMs": 30000,
  "active": true
}
```

---

## Streams
```
GET    /api/streams                    - List streams
POST   /api/streams                    - Add stream
DELETE /api/streams/{id}               - Remove stream
GET    /api/streams/{id}/stats         - Get stats
WS     /api/streams/{id}/ws            - WebSocket connection
```

### WebSocket Messages
```json
// Subscribe
{ "type": "subscribe", "stream_id": "stream_1" }

// Receive detections
{ "type": "detections", "data": { "tracks": [...], "frame_id": 123 } }

// Receive stats
{ "type": "stats", "data": { "fps": 30, "latency_ms": 45 } }
```

---

## Analytics

### Summary
```
GET /api/analytics/summary
Response: {
  "total_vehicles_24h": 1234,
  "avg_speed_kmh": 45.2,
  "violations_24h": 12,
  "active_zones": 5
}
```

### Heatmap
```
GET /api/analytics/heatmap?zone_id=zone_1&metric=count&hours=24
GET /api/analytics/heatmap/realtime?zone_id=zone_1&window=5

Response: {
  "cells": [{ "x": 10, "y": 20, "value": 15.5 }],
  "bounds": { "min_x": 0, "max_x": 1280, "min_y": 0, "max_y": 720 }
}
```

### Trajectories
```
GET /api/analytics/trajectories?limit=100
GET /api/analytics/trajectories/{track_id}

Response: {
  "track_id": "track_123",
  "points": [{ "x": 100, "y": 200, "timestamp": 1234567890, "speed_kmh": 45.2 }],
  "total_distance_m": 1234.5,
  "avg_speed_kmh": 45.2,
  "duration_s": 120.5,
  "zones_visited": ["zone_1", "zone_2"]
}
```

### O-D Matrix
```
GET /api/analytics/od-matrix?period=daily
GET /api/analytics/od-matrix?period=am_peak

Response: {
  "matrix": [
    { "origin_zone": "zone_1", "dest_zone": "zone_2", "count": 45, "avg_travel_time_s": 120 }
  ]
}
```

### Predictions
```
GET /api/analytics/predictions/congestion?horizon=60&interval=15
GET /api/analytics/predictions/congestion/alerts?threshold=0.7

Response: {
  "predictions": [
    { "zone_id": "zone_1", "timestamp": 1234567890, "congestion_level": 0.85, "confidence": 0.92 }
  ],
  "model_version": "v1.0"
}
```

---

## Rate Limits
| Category | Limit | Window |
|----------|-------|--------|
| Auth login | 10 req | 60s |
| Auth register | 5 req | 300s |
| API reads | 120 req | 60s |
| API writes | 60 req | 60s |
| Heavy queries | 20 req | 60s |

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

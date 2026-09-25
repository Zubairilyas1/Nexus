# NexusVision Runbook

## Service Health Checks

```bash
# API health
curl http://localhost:8000/healthz

# Frontend
curl -o /dev/null -s -w "%{http_code}" http://localhost:3000

# PostgreSQL
docker compose exec postgres pg_isready -U postgres

# Redis
docker compose exec redis redis-cli ping
```

---

## Common Issues

### High Memory Usage
```bash
# Check container stats
docker stats --format "table {{.Name}}\t{{.MemUsage}}"

# Restart API if OOM
docker compose restart api
```

### Database Connection Pool Exhausted
```bash
# Check active connections
docker compose exec postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections
docker compose exec postgres psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < now() - interval '10 minutes';"
```

### WebSocket Disconnections
```bash
# Check WebSocket connections
docker compose exec api ss -tlnp | grep 8000

# Restart WebSocket manager (via API restart)
docker compose restart api
```

### Stream Offline
```bash
# Check stream status
curl http://localhost:8000/api/streams | jq '.[].status'

# Restart specific stream
curl -X POST http://localhost:8000/api/streams/dev_test_stream/restart
```

---

## Scaling

### Horizontal (Docker Compose)
```bash
docker compose -f docker-compose.prod.yml up -d --scale api=3
```

### Horizontal (Kubernetes)
```bash
kubectl scale deployment nexus-api -n nexusvision --replicas=5
```

---

## Backup & Restore

### Database Backup
```bash
docker compose exec postgres pg_dump -U postgres nexusvision > backup_$(date +%Y%m%d).sql
```

### Database Restore
```bash
cat backup_20260901.sql | docker compose exec -T postgres psql -U postgres nexusvision
```

---

## Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api

# Last 100 lines
docker compose logs --tail 100 api

# Kubernetes
kubectl logs -n nexusvision -l app=nexus-api -f --tail=100
```

---

## Incident Response

1. **Service Down**: `docker compose restart <service>`
2. **Database Down**: `docker compose restart postgres && docker compose restart api`
3. **High Latency**: Check `docker stats`, restart if memory/CPU maxed
4. **Security Breach**: Rotate `JWT_SECRET_KEY`, check logs for unauthorized access

# NexusVision Deployment Guide

## Prerequisites
- Docker + Docker Compose
- kubectl (for Kubernetes)
- kustomize (for K8s overlays)

---

## Quick Start (Docker Compose)

### Development
```bash
# Start all services with hot-reload
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f api

# Access
# Frontend: http://localhost:3000
# API:      http://localhost:8000
# DB:       localhost:5432
```

### Production
```bash
# Create .env with production secrets
cat > .env << EOF
POSTGRES_PASSWORD=<secure-password>
JWT_SECRET_KEY=<random-64-char-string>
NEXT_PUBLIC_API_URL=https://api.nexusvision.ai
NEXT_PUBLIC_WS_URL=wss://api.nexusvision.ai
EOF

# Build and start
docker compose -f docker-compose.prod.yml up -d --build

# Scale API
docker compose -f docker-compose.prod.yml up -d --scale api=3
```

---

## Kubernetes Deployment

### Dev
```bash
kubectl apply -k k8s/overlays/dev/
```

### Production
```bash
# Create secrets
kubectl create secret generic nexus-secrets \
  --from-literal=POSTGRES_PASSWORD=<password> \
  --from-literal=JWT_SECRET_KEY=<key> \
  -n nexusvision

# Deploy
kubectl apply -k k8s/overlays/prod/
```

### Verify
```bash
kubectl get pods -n nexusvision
kubectl get ingress -n nexusvision
kubectl logs -n nexusvision -l app=nexus-api
```

---

## Docker Build (Multi-Arch)

```bash
# Create buildx builder
docker buildx create --name multiarch --driver docker-container --use

# Build backend
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/nexusvision/backend:latest \
  --push ./backend

# Build frontend
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/nexusvision/frontend:latest \
  --push ./frontend
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `REDIS_URL` | Yes | - | Redis connection string |
| `JWT_SECRET_KEY` | Yes | - | JWT signing key (min 32 chars) |
| `ENVIRONMENT` | No | production | `development` or `production` |
| `DEBUG` | No | false | Enable debug mode |
| `RTSP_SOURCE` | No | - | RTSP stream URL |
| `YOUTUBE_FALLBACK_URL` | No | - | YouTube stream fallback |
| `NEXT_PUBLIC_API_URL` | No | http://localhost:8000 | Frontend API URL |
| `NEXT_PUBLIC_WS_URL` | No | ws://localhost:8000 | Frontend WebSocket URL |

---

## Troubleshooting

### API won't start
```bash
docker compose logs api
# Check: DB connection, Redis connection, JWT_SECRET_KEY set
```

### Frontend can't reach API
```bash
# Ensure NEXT_PUBLIC_API_URL matches the API container's exposed port
# In Docker, use container names: http://api:8000
```

### Database migration
```bash
docker compose exec api alembic upgrade head
```

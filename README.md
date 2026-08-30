# NexusVision: AI-Powered Edge Video Analytics & Virtual Loop Traffic Engine

> Transform any RTSP camera stream into an intelligent, programmable spatial sensor — no new hardware required.

## Overview at zubair branch

NexusVision is a pure-software solution that replaces expensive physical traffic infrastructure (inductive loops, radar sensors) with AI-powered video analytics running on commodity edge hardware. It turns existing IP/CCTV cameras into virtual loop counters with real-time zone monitoring, vehicle classification, and historical analytics.

### Key Features
--
- **Live Analytics Stream**: Real-time bounding boxes, classifications, and confidence scores overlaid on video
- **Interactive Zone Designer**: Draw custom polygon zones directly on the live feed via browser
- **Virtual Loop Engine**: Track vehicles across frames, trigger ENTER/EXIT/DWELL events on zone intersection
- **Time-Series Analytics**: Peak hours, vehicle distributions, dwell times, anomaly detection
- **Edge-Optimized Inference**: YOLOv8 INT8 quantization achieving 30+ FPS on CPU/edge devices
- **Zero-Copy Streaming**: Decoupled WebSocket metadata + MJPEG video streams with backpressure handling

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ RTSP Camera │────▶│   Ingestion  │────▶│  YOLOv8 INT8│────▶│  ByteTrack   │
└─────────────┘     │   (OpenCV)   │     │  (ONNX RT)  │     └──────┬───────┘
                    └──────────────┘     └─────────────┘            │
                                                                    ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Browser    │◀────│   Nginx      │◀────│  FastAPI    │◀────│  Spatial     │
│  (Next.js)  │     │  (TLS/WSS)   │     │  (WebSocket)│     │  Engine      │
└─────────────┘     └──────────────┘     └──────┬──────┘     └──────────────┘
                                                 │
                    ┌──────────────┐     ┌───────┴───────┐
                    │  PostgreSQL  │◀────│    Redis      │
                    │ (Analytics)  │     │ (Real-time)   │
                    └──────────────┘     └──────────────┘
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Git
- (Optional) NVIDIA GPU for TensorRT acceleration

### Development Setup

```bash
# Clone and enter directory
git clone <repository>
cd nexus-vision

# Generate self-signed certificates for local HTTPS
cd nginx && ./generate-certs.sh && cd ..

# Copy environment template
cp .env.example .env
# Edit .env with your RTSP source or YouTube fallback URL

# Start all services
docker compose up -d --build

# View logs
docker compose logs -f api
```

### Access Points

| Service | URL |
|---------|-----|
| Frontend Dashboard | https://localhost |
| API Documentation | https://localhost/api/docs |
| Health Check | https://localhost/healthz |
| pgAdmin (dev) | http://localhost:5050 |

## Configuration

Key environment variables (`.env`):

```bash
# Video source (choose one)
RTSP_SOURCE=rtsp://user:pass@camera:554/stream
YOUTUBE_FALLBACK_URL=https://youtube.com/watch?v=...

# Database
DB_PASSWORD=secure-password

# JWT (generate with: openssl rand -hex 32)
JWT_SECRET_KEY=your-32-char-secret

# Model
MODEL_PATH=models/yolov8n_int8.onnx
```

## Development Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Foundation: Monorepo, Docker, CI, Config | ✅ Complete |
| 1 | Ingestion: RTSP capture, MJPEG, YouTube fallback | 🔄 Next |
| 2 | Detection: YOLOv8 INT8, ByteTrack, 30+ FPS | ⏳ Pending |
| 3 | Spatial: Ray-casting, zones, hysteresis, Redis | ⏳ Pending |
| 4 | WebSocket: Real-time events, backpressure, auth | ⏳ Pending |
| 5 | Frontend: Canvas drawing, overlay, charts | ⏳ Pending |
| 6 | Analytics: PostgreSQL, materialized views, Recharts | ⏳ Pending |
| 7 | Security: TLS, JWT, RBAC, rate limits, audit | ⏳ Pending |
| 8 | Deploy: Multi-stream, Prometheus, Grafana | ⏳ Pending |
| 9 | Polish: Tests, benchmarks, docs, portfolio | ⏳ Pending |

See [PHASES.md](PHASES.md) for detailed phase breakdown.

## Model Quantization

```bash
# Export YOLOv8 to ONNX FP32
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='onnx', opset=17, imgsz=640)"

# Quantize to INT8 (requires calibration images)
python backend/core/quantization.py
```

## Testing

```bash
# Backend tests
cd backend && pytest -v --cov=app

# Frontend tests
cd frontend && npm run test:ci

# Integration tests (requires running services)
docker compose -f docker-compose.yml up -d postgres redis
cd backend && pytest tests/integration -v
```

## Performance Targets

| Metric | Target |
|--------|--------|
| Inference Throughput | ≥ 30 FPS @ 720p on Intel i5 / Jetson Nano |
| End-to-End Latency | < 250 ms (frame capture → browser render) |
| Zone Intersection Accuracy | ≥ 99% |
| Vehicle Re-ID (ID Switch) | < 2% over 5 minutes |
| WebSocket Stability | Zero unhandled disconnects in 24h soak |
| System Cost | Single commodity machine (no cloud GPU) |

## Security

- TLS 1.3 everywhere (Nginx termination)
- JWT authentication (ES256 in production)
- Role-based access (admin/operator/viewer)
- Rate limiting (login, zone writes, WebSocket)
- Privacy by design: no video retention, pseudonymized tracks
- Audit logging with hash chaining

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## Acknowledgments

- Ultralytics YOLOv8
- ByteTrack
- ONNX Runtime
- FastAPI
- Next.js
- All open-source contributors
# Backend configuration management
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional
import os


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "NexusVision"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = Field(default="development", description="development|staging|production")
    DEBUG: bool = Field(default=True, description="Enable debug mode")
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 1
    
    # Video Ingestion
    RTSP_SOURCE: str = Field(default="", description="RTSP stream URL (e.g., rtsp://user:pass@ip:554/stream)")
    YOUTUBE_FALLBACK_URL: str = Field(default="", description="YouTube live stream URL for dev testing")
    FRAME_WIDTH: int = 1280
    FRAME_HEIGHT: int = 720
    INFERENCE_WIDTH: int = 640
    INFERENCE_HEIGHT: int = 640
    TARGET_FPS: int = 30
    MAX_FRAME_QUEUE_SIZE: int = 2
    
    # AI Model
    MODEL_PATH: str = Field(default="models/yolov8n.onnx", description="Path to quantized ONNX model")
    MODEL_FP32_PATH: str = Field(default="models/yolov8n.onnx", description="Path to FP32 ONNX model")
    CONFIDENCE_THRESHOLD: float = 0.25
    IOU_THRESHOLD: float = 0.45
    MAX_DETECTIONS: int = 300
    CLASSES_OF_INTEREST: list[int] = Field(default=[2, 3, 5, 7], description="COCO classes: car, motorcycle, bus, truck")
    
    # Object Tracking (ByteTrack)
    TRACK_THRESH: float = 0.5
    TRACK_BUFFER: int = 30
    MATCH_THRESH: float = 0.8
    MIN_BOX_AREA: int = 100
    MOT20: bool = False
    
    # Spatial Engine
    ZONE_HYSTERESIS_FRAMES: int = 3
    ZONE_BUFFER_PIXELS: int = 3
    MAX_ZONE_VERTICES: int = 12
    MIN_ZONE_AREA: int = 100
    
    # Database
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/nexusvision",
        description="PostgreSQL async connection string"
    )
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_POOL_TIMEOUT: int = 30
    
    # Redis
    REDIS_URL: str = Field(default="redis://localhost:6379/0", description="Redis connection string")
    REDIS_MAX_CONNECTIONS: int = 50
    REDIS_SOCKET_TIMEOUT: int = 5
    REDIS_SOCKET_CONNECT_TIMEOUT: int = 5
    
    # WebSocket
    WS_MAX_QUEUE_DEPTH: int = 50
    WS_HEARTBEAT_INTERVAL: int = 30
    WS_CLIENT_MAX_RATE: int = 15
    
    # MJPEG Stream
    MJPEG_QUALITY: int = 75
    MJPEG_BOUNDARY: str = "frame"
    
    # Security
    JWT_SECRET_KEY: str = Field(default="", description="JWT signing secret (required in production)")
    JWT_ALGORITHM: str = "ES256"
    JWT_PRIVATE_KEY_PATH: str = Field(default="", description="Path to ES256 private key")
    JWT_PUBLIC_KEY_PATH: str = Field(default="", description="Path to ES256 public key")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    JWT_ISSUER: str = "nexusvision"
    JWT_AUDIENCE: str = "nexusvision:api"
    NEXT_PUBLIC_APP_URL: str = Field(
        default="http://localhost:3000",
        description="Frontend origin used to build verify-email, reset-password and invite links"
    )
    
    # Rate Limiting
    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_ZONE_WRITE: str = "10/minute"
    RATE_LIMIT_WEBSOCKET: str = "60/second"
    
    # CORS
    ALLOWED_ORIGINS: list[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"],
        description="Allowed CORS origins"
    )
    ALLOWED_WS_ORIGINS: list[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"],
        description="Allowed WebSocket origins"
    )
    
    # Privacy & Retention
    RETENTION_DAYS: int = 30
    ENABLE_VIDEO_RECORDING: bool = False
    RECORDING_PATH: str = "/app/recordings"
    
    # Monitoring
    ENABLE_PROMETHEUS: bool = True
    METRICS_PORT: int = 9090
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    
    # Model calibration
    CALIBRATION_IMAGES_DIR: str = "calib_images"
    CALIBRATION_SAMPLE_COUNT: int = 500
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    return settings
#!/usr/bin/env python3
"""
NexusVision Development Startup Script - Phase 1

This script starts the backend API with a test YouTube stream
for development without requiring a physical RTSP camera.

Usage:
    python scripts/dev_start.py                    # Start with default YouTube stream
    python scripts/dev_start.py --youtube-url "..."  # Custom YouTube URL
    python scripts/dev_start.py --rtsp-url "..."     # Use RTSP instead
"""

import sys
import asyncio
import uvicorn
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.stream_manager import multi_stream_manager, StreamConfig
from app.config import settings


DEFAULT_YOUTUBE_URL = "https://www.youtube.com/watch?v=gCNeDWCI0vo"  # EarthCam NYC live


async def start_test_stream(youtube_url: str = None, rtsp_url: str = None):
    """Start a test stream for development."""
    stream_id = "dev_test_stream"
    
    # Remove existing test stream if any
    if stream_id in multi_stream_manager.streams:
        await multi_stream_manager.remove_stream(stream_id)
    
    config = StreamConfig(
        stream_id=stream_id,
        rtsp_url=rtsp_url or "",
        youtube_url=youtube_url or DEFAULT_YOUTUBE_URL,
        name="Development Test Stream",
        frame_width=1280,
        frame_height=720,
        target_fps=30,
        use_youtube_fallback=bool(youtube_url),
        reconnect_delay=3.0,
        max_reconnect_attempts=5,
    )
    
    print(f"Starting development test stream: {stream_id}")
    print(f"   YouTube URL: {config.youtube_url}")
    print(f"   RTSP URL: {config.rtsp_url or 'N/A'}")
    print(f"   Resolution: {config.frame_width}x{config.frame_height} @ {config.target_fps} FPS")
    
    manager = await multi_stream_manager.add_stream(config)
    
    # Wait a bit for stream to start
    await asyncio.sleep(3)
    
    stats = manager.get_stats()
    print(f"\nStream Status:")
    print(f"   Status: {stats['status']}")
    print(f"   FPS: {stats['current_fps']:.1f}")
    print(f"   Frames Captured: {stats['frames_captured']}")
    print(f"   Frames Processed: {stats['frames_processed']}")
    print(f"   Frames Dropped: {stats['frames_dropped']}")
    print(f"   Queue: {stats['queue_size']}/{stats['queue_max']}")
    
    if stats['recent_errors']:
        print(f"   Errors: {stats['recent_errors']}")
    
    return manager


async def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Start NexusVision backend with test stream")
    parser.add_argument("--youtube-url", help="YouTube live stream URL")
    parser.add_argument("--rtsp-url", help="RTSP stream URL")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind")
    parser.add_argument("--no-reload", action="store_true", help="Disable auto-reload")
    parser.add_argument("--stream-only", action="store_true", help="Only start stream, don't run server")
    
    args = parser.parse_args()
    
    # Start test stream
    await start_test_stream(
        youtube_url=args.youtube_url,
        rtsp_url=args.rtsp_url
    )
    
    if args.stream_only:
        print("\nStream-only mode. Press Ctrl+C to stop.")
        try:
            while True:
                await asyncio.sleep(10)
                stats = multi_stream_manager.get_all_stats()
                for sid, s in stats.items():
                    print(f"  {sid}: {s['status']} | FPS: {s['current_fps']:.1f} | Frames: {s['frames_processed']}")
        except KeyboardInterrupt:
            print("\nStopping...")
        finally:
            await multi_stream_manager.stop_all()
        return
    
    # Start FastAPI server
    print(f"\nStarting FastAPI server on {args.host}:{args.port}")
    print(f"   API Docs: http://{args.host}:{args.port}/docs")
    print(f"   Health: http://{args.host}:{args.port}/healthz")
    print(f"   MJPEG: http://{args.host}:{args.port}/stream/mjpeg/dev_test_stream")
    print(f"   Snapshot: http://{args.host}:{args.port}/stream/dev_test_stream/snapshot")
    
    config = uvicorn.Config(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=not args.no_reload,
        log_level="info",
    )
    server = uvicorn.Server(config)
    
    try:
        await server.serve()
    finally:
        await multi_stream_manager.stop_all()


if __name__ == "__main__":
    asyncio.run(main())
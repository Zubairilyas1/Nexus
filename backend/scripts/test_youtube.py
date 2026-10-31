#!/usr/bin/env python3
"""
YouTube Live Stream Test Script for NexusVision Development

This script tests YouTube live stream URL resolution using yt-dlp
and verifies the stream can be opened with OpenCV.

Usage:
    python scripts/test_youtube.py "https://youtube.com/watch?v=..."
    python scripts/test_youtube.py --list-samples
"""

import sys
import cv2
import yt_dlp
import time
import argparse
from typing import Optional


# Sample YouTube live traffic camera streams for testing
SAMPLE_STREAMS = {
    "nyc_times_square": "https://www.youtube.com/watch?v=1-iS5Yc3M3Q",  # Times Square cam
    "london_traffic": "https://www.youtube.com/watch?v=j7cH8m5kL2s",     # London traffic
    "tokyo_shibuya": "https://www.youtube.com/watch?v=K1234567890",      # Shibuya crossing
    "la_freeway": "https://www.youtube.com/watch?v=abcdefghijk",         # LA freeway
}


def resolve_youtube_url(youtube_url: str) -> Optional[str]:
    """Extract direct stream URL from YouTube using yt-dlp."""
    ydl_opts = {
        'format': 'best[ext=mp4]/best',
        'quiet': True,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=False)
            return info['url']
    except Exception as e:
        print(f"❌ Failed to resolve YouTube URL: {e}")
        return None


def test_opencv_capture(stream_url: str, width: int = 1280, height: int = 720, duration: float = 10.0) -> bool:
    """Test OpenCV can capture frames from the stream."""
    print(f"\n🔍 Testing OpenCV capture...")
    print(f"   URL: {stream_url[:80]}...")
    print(f"   Resolution: {width}x{height}")
    print(f"   Duration: {duration}s")
    
    cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
    
    if not cap.isOpened():
        print("❌ Failed to open video capture")
        return False
        
    # Optimize capture settings
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    
    actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    actual_fps = cap.get(cv2.CAP_PROP_FPS)
    
    print(f"   Actual: {actual_width}x{actual_height} @ {actual_fps:.1f} FPS")
    
    frame_count = 0
    start_time = time.time()
    last_fps_time = start_time
    
    try:
        while time.time() - start_time < duration:
            ret, frame = cap.read()
            if not ret:
                print("❌ Frame read failed")
                break
                
            frame_count += 1
            
            # Print FPS every 2 seconds
            if time.time() - last_fps_time >= 2.0:
                elapsed = time.time() - last_fps_time
                fps = (frame_count - (frame_count // 2)) / elapsed if elapsed > 0 else 0
                print(f"   📊 FPS: {fps:.1f}, Frames: {frame_count}")
                last_fps_time = time.time()
                
    except KeyboardInterrupt:
        print("\n⏹️  Interrupted by user")
    finally:
        cap.release()
        elapsed = time.time() - start_time
        avg_fps = frame_count / elapsed if elapsed > 0 else 0
        print(f"\n✅ Capture test completed:")
        print(f"   Frames: {frame_count}")
        print(f"   Duration: {elapsed:.1f}s")
        print(f"   Average FPS: {avg_fps:.1f}")
        
    return frame_count > 0


def test_youtube_url(youtube_url: str, test_capture: bool = True) -> bool:
    """Test a YouTube URL end-to-end."""
    print(f"\n{'='*60}")
    print(f"Testing YouTube URL: {youtube_url}")
    print(f"{'='*60}")
    
    # Step 1: Resolve URL
    print("\n1️⃣  Resolving YouTube URL with yt-dlp...")
    stream_url = resolve_youtube_url(youtube_url)
    if not stream_url:
        return False
    print(f"✅ Resolved: {stream_url[:80]}...")
    
    # Step 2: Test capture
    if test_capture:
        print("\n2️⃣  Testing OpenCV capture...")
        return test_opencv_capture(stream_url)
    
    return True


def list_samples():
    """List available sample streams."""
    print("\n📋 Available sample YouTube traffic streams:")
    print("-" * 60)
    for name, url in SAMPLE_STREAMS.items():
        print(f"  {name}: {url}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Test YouTube live streams for NexusVision")
    parser.add_argument("url", nargs="?", help="YouTube URL to test")
    parser.add_argument("--list-samples", action="store_true", help="List sample streams")
    parser.add_argument("--no-capture", action="store_true", help="Only resolve URL, don't test capture")
    parser.add_argument("--duration", type=float, default=10.0, help="Capture test duration (seconds)")
    parser.add_argument("--width", type=int, default=1280, help="Frame width")
    parser.add_argument("--height", type=int, default=720, help="Frame height")
    
    args = parser.parse_args()
    
    if args.list_samples:
        list_samples()
        return 0
        
    if not args.url:
        parser.print_help()
        return 1
        
    success = test_youtube_url(args.url, test_capture=not args.no_capture)
    
    if success:
        print("\n✅ All tests passed!")
        return 0
    else:
        print("\n❌ Tests failed!")
        return 1


if __name__ == "__main__":
    sys.exit(main())
# Stream Manager - RTSP/YouTube Ingestion with OpenCV
import asyncio
import cv2
try:
    import yt_dlp
except ImportError:
    yt_dlp = None
import numpy as np
import time
import structlog
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from enum import Enum
from concurrent.futures import ThreadPoolExecutor
import threading

logger = structlog.get_logger()


class StreamStatus(Enum):
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    ERROR = "error"
    RECONNECTING = "reconnecting"


@dataclass
class StreamConfig:
    stream_id: str
    rtsp_url: str = ""
    youtube_url: str = ""
    name: str = ""
    frame_width: int = 1280
    frame_height: int = 720
    target_fps: int = 30
    buffer_size: int = 2
    reconnect_delay: float = 5.0
    max_reconnect_attempts: int = 10
    use_youtube_fallback: bool = False


@dataclass
class StreamStats:
    frames_captured: int = 0
    frames_dropped: int = 0
    frames_processed: int = 0
    last_frame_time: float = 0.0
    last_frame_shape: tuple = (0, 0, 0)
    current_fps: float = 0.0
    reconnect_count: int = 0
    errors: list = field(default_factory=list)
    status: StreamStatus = StreamStatus.STOPPED


class StreamManager:
    """Manages RTSP/YouTube video stream capture with frame buffering and MJPEG encoding."""
    
    def __init__(self, config: StreamConfig):
        self.config = config
        self.stats = StreamStats()
        self._frame_queue: asyncio.Queue = None
        self._capture_task: Optional[asyncio.Task] = None
        self._mjpeg_task: Optional[asyncio.Task] = None
        self._running = False
        self._cap: Optional[cv2.VideoCapture] = None
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix=f"stream-{config.stream_id}")
        self._lock = threading.Lock()
        self._last_frame: Optional[np.ndarray] = None
        self._frame_times: list = []
        self._fps_window = 30  # frames for FPS calculation
        self._resolved_stream_url: Optional[str] = None  # Cached resolved URL
        self._url_resolved_at: float = 0  # Timestamp of last resolution
        self._url_ttl: float = 3600  # YouTube URLs typically valid for ~1 hour
        
    async def initialize(self):
        """Initialize the stream manager."""
        self._frame_queue = asyncio.Queue(maxsize=self.config.buffer_size)
        self._running = True
        self.stats.status = StreamStatus.STARTING
        logger.info("StreamManager initialized", stream_id=self.config.stream_id)
        
    async def start(self):
        """Start the capture loop."""
        if self._capture_task and not self._capture_task.done():
            logger.warning("Capture task already running", stream_id=self.config.stream_id)
            return
            
        self._capture_task = asyncio.create_task(self._capture_loop())
        logger.info("StreamManager capture loop started", stream_id=self.config.stream_id)
        
    async def stop(self):
        """Stop the capture loop and cleanup."""
        self._running = False
        self.stats.status = StreamStatus.STOPPED
        
        if self._capture_task:
            self._capture_task.cancel()
            try:
                await self._capture_task
            except asyncio.CancelledError:
                pass
                
        if self._mjpeg_task:
            self._mjpeg_task.cancel()
            try:
                await self._mjpeg_task
            except asyncio.CancelledError:
                pass
                
        await self._cleanup_capture()
        self._executor.shutdown(wait=True)
        logger.info("StreamManager stopped", stream_id=self.config.stream_id)
        
    async def _cleanup_capture(self):
        """Clean up OpenCV capture."""
        if self._cap:
            self._cap.release()
            self._cap = None
            
    def _invalidate_url_cache(self):
        """Invalidate the cached stream URL (force re-resolution on next access)."""
        self._resolved_stream_url = None
        self._url_resolved_at = 0
        
    def _get_stream_url(self) -> str:
        """Get the stream URL, resolving YouTube if needed (with caching)."""
        current_time = time.time()
        
        # Return cached URL if still valid
        if self._resolved_stream_url and (current_time - self._url_resolved_at) < self._url_ttl:
            return self._resolved_stream_url
            
        # Need to resolve URL
        if self.config.youtube_url and self.config.use_youtube_fallback:
            logger.info("Resolving YouTube URL", url=self.config.youtube_url)
            self._resolved_stream_url = self._resolve_youtube_url(self.config.youtube_url)
            self._url_resolved_at = time.time()
            return self._resolved_stream_url
            
        return self.config.rtsp_url
        
    def _resolve_youtube_url(self, youtube_url: str) -> str:
        """Extract direct stream URL from YouTube using yt-dlp."""
        if yt_dlp is None:
            logger.error("yt_dlp is not installed. YouTube fallback is unavailable.")
            return None
        
        ydl_opts = {
            'format': 'bestvideo[ext=mp4]/bestvideo/best',
            'quiet': True,
            'no_warnings': True,
        }
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(youtube_url, download=False)
                stream_url = info['url']
                logger.info("YouTube URL resolved", stream_id=self.config.stream_id)
                return stream_url
        except Exception as e:
            logger.error("Failed to resolve YouTube URL", error=str(e))
            raise
            
    def _open_capture(self, url: str) -> bool:
        """Open OpenCV VideoCapture with optimized settings."""
        try:
            self._cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            
            if not self._cap.isOpened():
                logger.error("Failed to open video capture", url=url)
                return False
                
            # Optimize capture settings
            self._cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize internal buffer
            self._cap.set(cv2.CAP_PROP_FPS, self.config.target_fps)
            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.frame_width)
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.frame_height)
            
            # Verify settings
            actual_width = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = self._cap.get(cv2.CAP_PROP_FPS)
            
            logger.info(
                "Video capture opened",
                stream_id=self.config.stream_id,
                width=actual_width,
                height=actual_height,
                fps=actual_fps
            )
            return True
            
        except Exception as e:
            logger.error("Error opening capture", error=str(e))
            return False
            
    def _read_frame_sync(self) -> tuple:
        """Synchronous frame read (runs in thread pool)."""
        if not self._cap:
            return False, None
            
        ret, frame = self._cap.read()
        return ret, frame
        
    async def _capture_loop(self):
        """Main capture loop with reconnection logic."""
        reconnect_attempts = 0
        last_reconnect = 0
        
        while self._running:
            try:
                # Get stream URL
                stream_url = self._get_stream_url()
                if not stream_url:
                    logger.error("No stream URL configured", stream_id=self.config.stream_id)
                    await asyncio.sleep(self.config.reconnect_delay)
                    continue
                    
                # Open capture if needed
                if not self._cap or not self._cap.isOpened():
                    if not self._open_capture(stream_url):
                        self.stats.status = StreamStatus.ERROR
                        self.stats.errors.append(f"Failed to open capture: {stream_url}")
                        self._invalidate_url_cache()  # Force URL re-resolution on retry
                        reconnect_attempts += 1
                        if reconnect_attempts >= self.config.max_reconnect_attempts:
                            logger.error("Max reconnect attempts reached", stream_id=self.config.stream_id)
                            break
                        await asyncio.sleep(self.config.reconnect_delay)
                        continue
                        
                    reconnect_attempts = 0
                    self.stats.status = StreamStatus.RUNNING
                    
                # Read frame in thread pool (releases GIL)
                loop = asyncio.get_event_loop()
                ret, frame = await loop.run_in_executor(self._executor, self._read_frame_sync)
                
                if not ret or frame is None:
                    logger.warning("Frame read failed, invalidating URL cache and attempting reconnect", stream_id=self.config.stream_id)
                    self._invalidate_url_cache()
                    await self._cleanup_capture()
                    self.stats.status = StreamStatus.RECONNECTING
                    await asyncio.sleep(self.config.reconnect_delay)
                    continue
                    
                # Resize frame to target resolution
                if frame.shape[1] != self.config.frame_width or frame.shape[0] != self.config.frame_height:
                    frame = cv2.resize(frame, (self.config.frame_width, self.config.frame_height))
                    
                # Update stats
                current_time = time.time()
                self.stats.frames_captured += 1
                self.stats.last_frame_time = current_time
                self.stats.last_frame_shape = frame.shape
                
                # Calculate FPS
                self._frame_times.append(current_time)
                if len(self._frame_times) > self._fps_window:
                    self._frame_times.pop(0)
                if len(self._frame_times) > 1:
                    time_diff = self._frame_times[-1] - self._frame_times[0]
                    if time_diff > 0:
                        self.stats.current_fps = (len(self._frame_times) - 1) / time_diff
                        
                # Put frame in queue (non-blocking, drop if full)
                try:
                    self._frame_queue.put_nowait(frame.copy())
                    self.stats.frames_processed += 1
                    self._last_frame = frame
                except asyncio.QueueFull:
                    self.stats.frames_dropped += 1
                    logger.debug("Frame dropped - queue full", stream_id=self.config.stream_id)
                    
                # Control frame rate
                frame_interval = 1.0 / self.config.target_fps
                elapsed = time.time() - current_time
                sleep_time = max(0, frame_interval - elapsed)
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Capture loop error", stream_id=self.config.stream_id, error=str(e))
                self.stats.errors.append(str(e))
                await self._cleanup_capture()
                await asyncio.sleep(self.config.reconnect_delay)
                
    async def get_frame(self, timeout: float = 1.0) -> Optional[np.ndarray]:
        """Get the latest frame from the queue."""
        try:
            frame = await asyncio.wait_for(self._frame_queue.get(), timeout=timeout)
            return frame
        except asyncio.TimeoutError:
            return None
            
    def get_latest_frame(self) -> Optional[np.ndarray]:
        """Get the latest frame synchronously (non-blocking)."""
        if self._last_frame is not None:
            return self._last_frame.copy()
        return None
        
    async def generate_mjpeg(self):
        """Generate MJPEG stream frames."""
        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), 75]
        
        while self._running:
            frame = await self.get_frame(timeout=1.0)
            if frame is None:
                await asyncio.sleep(0.01)
                continue
                
            # Encode to JPEG
            ret, buffer = cv2.imencode('.jpg', frame, encode_params)
            if not ret:
                continue
                
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n' + 
                buffer.tobytes() + b'\r\n'
            )
            
    def get_stats(self) -> Dict[str, Any]:
        """Get stream statistics."""
        return {
            "stream_id": self.config.stream_id,
            "name": self.config.name,
            "status": self.stats.status.value,
            "frames_captured": self.stats.frames_captured,
            "frames_dropped": self.stats.frames_dropped,
            "frames_processed": self.stats.frames_processed,
            "current_fps": round(self.stats.current_fps, 2),
            "last_frame_time": self.stats.last_frame_time,
            "last_frame_shape": self.stats.last_frame_shape,
            "reconnect_count": self.stats.reconnect_count,
            "recent_errors": self.stats.errors[-5:] if self.stats.errors else [],
            "queue_size": self._frame_queue.qsize() if self._frame_queue else 0,
            "queue_max": self.config.buffer_size,
        }


class MultiStreamManager:
    """Manages multiple StreamManager instances."""
    
    def __init__(self):
        self.streams: Dict[str, StreamManager] = {}
        self._lock = asyncio.Lock()
        
    async def add_stream(self, config: StreamConfig) -> StreamManager:
        """Add and start a new stream."""
        async with self._lock:
            if config.stream_id in self.streams:
                raise ValueError(f"Stream {config.stream_id} already exists")
                
            manager = StreamManager(config)
            await manager.initialize()
            await manager.start()
            self.streams[config.stream_id] = manager
            return manager
            
    async def remove_stream(self, stream_id: str):
        """Remove and stop a stream."""
        async with self._lock:
            if stream_id not in self.streams:
                raise ValueError(f"Stream {stream_id} not found")
                
            manager = self.streams[stream_id]
            await manager.stop()
            del self.streams[stream_id]
            
    def get_stream(self, stream_id: str) -> Optional[StreamManager]:
        """Get a stream manager by ID."""
        return self.streams.get(stream_id)
        
    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics for all streams."""
        return {sid: mgr.get_stats() for sid, mgr in self.streams.items()}
        
    async def stop_all(self):
        """Stop all streams."""
        for stream_id in list(self.streams.keys()):
            await self.remove_stream(stream_id)


# Global instance for app lifespan
multi_stream_manager = MultiStreamManager()
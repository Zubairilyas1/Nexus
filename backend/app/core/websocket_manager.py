# WebSocket Manager: Real-time event broadcasting with backpressure handling
import asyncio
import json
import time
import structlog
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field
from fastapi import WebSocket, WebSocketDisconnect

logger = structlog.get_logger()


@dataclass
class Connection:
    """WebSocket connection info."""
    websocket: WebSocket
    client_id: str
    stream_ids: Set[str] = field(default_factory=set)
    connected_at: float = field(default_factory=time.time)
    last_ping: float = field(default_factory=time.time)
    message_queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=50))
    receive_task: Optional[asyncio.Task] = None


class WebSocketManager:
    """
    Manages WebSocket connections for real-time analytics streaming.
    Features:
    - Per-connection message queues with backpressure
    - Stream subscription management
    - Heartbeat/ping-pong for connection health
    - Automatic cleanup of slow/stale connections
    """
    
    def __init__(
        self,
        max_queue_size: int = 50,
        heartbeat_interval: int = 30,
        max_idle_time: int = 120,
    ):
        self.connections: Dict[str, Connection] = {}
        self.max_queue_size = max_queue_size
        self.heartbeat_interval = heartbeat_interval
        self.max_idle_time = max_idle_time
        
        # Stream -> connection mapping for efficient broadcasting
        self.stream_subscribers: Dict[str, Set[str]] = {}
        
        # Background tasks
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._cleanup_task: Optional[asyncio.Task] = None
        self._running = False
        
    async def start(self):
        """Start background tasks."""
        self._running = True
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("WebSocketManager started")
        
    async def stop(self):
        """Stop background tasks and close all connections."""
        self._running = False
        
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
        if self._cleanup_task:
            self._cleanup_task.cancel()
            
        # Close all connections
        for conn in list(self.connections.values()):
            await self._close_connection(conn.client_id, code=1001, reason="Server shutdown")
            
        logger.info("WebSocketManager stopped")
        
    async def connect(self, websocket: WebSocket, client_id: str) -> Connection:
        """Accept new WebSocket connection."""
        await websocket.accept()
        
        conn = Connection(
            websocket=websocket,
            client_id=client_id,
        )
        
        self.connections[client_id] = conn
        logger.info("WebSocket connected", client_id=client_id, total=len(self.connections))
        
        # Start message handler for this connection
        conn.receive_task = asyncio.create_task(self._handle_messages(conn))
        
        return conn
        
    async def disconnect(self, client_id: str, code: int = 1000, reason: str = "Disconnected"):
        """Disconnect a client."""
        await self._close_connection(client_id, code, reason)
        
    async def _close_connection(self, client_id: str, code: int, reason: str):
        """Close connection and cleanup."""
        conn = self.connections.pop(client_id, None)
        if conn:
            # Remove from stream subscriptions
            for stream_id in conn.stream_ids:
                if stream_id in self.stream_subscribers:
                    self.stream_subscribers[stream_id].discard(client_id)
                    if not self.stream_subscribers[stream_id]:
                        del self.stream_subscribers[stream_id]
                        
            try:
                await conn.websocket.close(code=code, reason=reason)
            except Exception:
                pass
                
            logger.info("WebSocket disconnected", client_id=client_id, total=len(self.connections))
            
    async def _handle_messages(self, conn: Connection):
        """Handle incoming messages from a connection."""
        try:
            while True:
                data = await conn.websocket.receive_json()
                await self._process_message(conn, data)
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error("WebSocket message error", client_id=conn.client_id, error=str(e))
        finally:
            await self._close_connection(conn.client_id, 1000, "Client disconnected")
            
    async def _process_message(self, conn: Connection, data: dict):
        """Process incoming message from client."""
        msg_type = data.get("type")
        
        if msg_type == "subscribe":
            stream_id = data.get("stream_id")
            if stream_id:
                conn.stream_ids.add(stream_id)
                if stream_id not in self.stream_subscribers:
                    self.stream_subscribers[stream_id] = set()
                self.stream_subscribers[stream_id].add(conn.client_id)
                logger.debug("Client subscribed", client_id=conn.client_id, stream_id=stream_id)
                
        elif msg_type == "unsubscribe":
            stream_id = data.get("stream_id")
            if stream_id:
                conn.stream_ids.discard(stream_id)
                if stream_id in self.stream_subscribers:
                    self.stream_subscribers[stream_id].discard(conn.client_id)
                    
        elif msg_type == "ping":
            conn.last_ping = time.time()
            await self._send(conn, {"type": "pong", "timestamp": time.time()})
            
        elif msg_type == "zone_update":
            # Client sending zone configuration
            pass  # Handle via REST API instead
            
    async def _send(self, conn: Connection, message: dict):
        """Send message to connection with backpressure handling."""
        try:
            conn.message_queue.put_nowait(message)
        except asyncio.QueueFull:
            # Client too slow - mark for disconnect
            logger.warning("Client queue full, disconnecting", client_id=conn.client_id)
            await self._close_connection(conn.client_id, 1009, "Client too slow")
            
    async def _sender_loop(self, conn: Connection):
        """Send messages from queue to WebSocket."""
        try:
            while True:
                message = await conn.message_queue.get()
                await conn.websocket.send_json(message)
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error("Sender loop error", client_id=conn.client_id, error=str(e))
            
    def broadcast_to_stream(self, stream_id: str, message: dict):
        """Broadcast message to all subscribers of a stream."""
        if stream_id not in self.stream_subscribers:
            return
            
        # Add metadata
        message["stream_id"] = stream_id
        message["timestamp"] = time.time()
        
        dead_clients = []
        for client_id in self.stream_subscribers[stream_id]:
            conn = self.connections.get(client_id)
            if conn:
                try:
                    conn.message_queue.put_nowait(message)
                except asyncio.QueueFull:
                    dead_clients.append(client_id)
                    
        # Clean up slow clients
        for client_id in dead_clients:
            asyncio.create_task(self._close_connection(client_id, 1009, "Client too slow"))
            
    def broadcast_event(self, stream_id: str, event_type: str, data: dict):
        """Broadcast a zone event to stream subscribers."""
        self.broadcast_to_stream(stream_id, {
            "type": "event",
            "event_type": event_type,
            "data": data,
        })
        
    def broadcast_detections(self, stream_id: str, detections: list):
        """Broadcast detection results to stream subscribers."""
        self.broadcast_to_stream(stream_id, {
            "type": "detections",
            "detections": detections,
        })
        
    def broadcast_stats(self, stream_id: str, stats: dict):
        """Broadcast pipeline stats to stream subscribers."""
        self.broadcast_to_stream(stream_id, {
            "type": "stats",
            "stats": stats,
        })
        
    async def _heartbeat_loop(self):
        """Send periodic heartbeats to all connections."""
        while self._running:
            try:
                current_time = time.time()
                for conn in list(self.connections.values()):
                    # Send ping
                    await self._send(conn, {
                        "type": "ping",
                        "timestamp": current_time,
                    })
                    
                    # Check for stale connections
                    if current_time - conn.last_ping > self.max_idle_time:
                        logger.warning("Connection stale, disconnecting", client_id=conn.client_id)
                        await self._close_connection(conn.client_id, 1000, "Heartbeat timeout")
                        
                await asyncio.sleep(self.heartbeat_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Heartbeat loop error", error=str(e))
                await asyncio.sleep(5)
                
    async def _cleanup_loop(self):
        """Periodic cleanup of dead connections."""
        while self._running:
            try:
                await asyncio.sleep(60)  # Every minute
                
                # Remove connections with full queues
                dead = []
                for client_id, conn in self.connections.items():
                    if conn.message_queue.full():
                        dead.append(client_id)
                        
                for client_id in dead:
                    logger.warning("Cleaning up slow client", client_id=client_id)
                    await self._close_connection(client_id, 1009, "Queue full")
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Cleanup loop error", error=str(e))
                
    def get_stats(self) -> dict:
        """Get manager statistics."""
        return {
            "total_connections": len(self.connections),
            "stream_subscribers": {
                sid: len(cids) for sid, cids in self.stream_subscribers.items()
            },
            "connections": [
                {
                    "client_id": c.client_id,
                    "stream_ids": list(c.stream_ids),
                    "queue_size": c.message_queue.qsize(),
                    "connected_duration": time.time() - c.connected_at,
                }
                for c in self.connections.values()
            ],
        }


# Global instance
websocket_manager = WebSocketManager()
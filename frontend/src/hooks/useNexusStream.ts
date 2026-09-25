"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface Detection {
  track_id: number;
  bbox: [number, number, number, number];
  class: string;
  confidence: number;
  zone_events?: Array<{
    event: "entered" | "exited" | "dwell_exceeded";
    zone_id: string;
  }>;
}

export interface ZoneEvent {
  event_type: "entered" | "exited" | "dwell_exceeded";
  track_id: number;
  zone_id: string;
  class_id: number;
  class_name: string;
  timestamp: number;
  dwell_ms?: number;
  bbox?: number[];
}

// Shape of the "stats" messages broadcast by backend multi_pipeline._on_stats
export interface StreamStats {
  frames_processed: number;
  frames_dropped: number;
  detection_fps: number;
  tracking_fps: number;
  spatial_fps: number;
  total_latency_ms: number;
  active_tracks: number;
  zone_events: number;
  camera_id?: string;
}

// Initial status message sent by the backend on WebSocket connect
export interface StreamStatus {
  stream_id: string;
  status: string;
  fps: number;
  frames_processed: number;
}

interface UseNexusStreamOptions {
  streamId: string;
  wsBaseUrl?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxRetries?: number;
  heartbeatInterval?: number;
}

interface UseNexusStreamReturn {
  detections: Detection[];
  frameWidth: number | null;
  frameHeight: number | null;
  zoneEvents: ZoneEvent[];
  streamStats: StreamStats | null;
  streamStatus: StreamStatus | null;
  isConnected: boolean;
  connectionStatus: "connecting" | "open" | "closing" | "closed";
  sendZoneUpdate: (zone: { zone_id: string; coordinates: number[][] }) => void;
  subscribe: (streamId: string) => void;
  unsubscribe: (streamId: string) => void;
  connect: () => void;
  disconnect: () => void;
}

const PLACEHOLDER_STREAM_IDS = new Set(["", "none", "null", "undefined"]);

export function useNexusStream(options: UseNexusStreamOptions): UseNexusStreamReturn {
  const {
    streamId,
    wsBaseUrl = "",
    autoConnect = true,
    heartbeatInterval = 30000,
  } = options;

  const [detections, setDetections] = useState<Detection[]>([]);
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const [zoneEvents, setZoneEvents] = useState<ZoneEvent[]>([]);
  const [streamStats, setStreamStats] = useState<StreamStats | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "open" | "closing" | "closed"
  >("closed");

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const buildWsUrl = useCallback(() => {
    // Next.js rewrites() proxy HTTP but not WebSocket upgrades, so the socket
    // must target the API origin directly rather than the page origin.
    const base =
      wsBaseUrl ||
      process.env.NEXT_PUBLIC_WS_URL ||
      (typeof window !== "undefined"
        ? window.location.origin.replace("http", "ws")
        : "");
    return `${base.replace("http", "ws")}/api/streams/${streamId}/ws`;
  }, [streamId, wsBaseUrl]);

  const handleMessage = useCallback((message: any) => {
    switch (message.type) {
      case "detections":
        setDetections(message.detections || []);
        if (message.frame_width) setFrameWidth(message.frame_width);
        if (message.frame_height) setFrameHeight(message.frame_height);
        break;
      case "event": {
        // Zone events from websocket_manager.broadcast_event
        const event: ZoneEvent = { ...message.data, event_type: message.event_type };
        setZoneEvents((prev) => [event, ...prev.slice(0, 99)]);
        break;
      }
      case "zone_event":
        // Fusion channel variant: {type, data}
        setZoneEvents((prev) => [message.data, ...prev.slice(0, 99)]);
        break;
      case "stats":
        setStreamStats(message.stats);
        break;
      case "stream_status":
        setStreamStatus(message);
        break;
      case "ping":
      case "pong":
        // Server heartbeat; our own 30s ping keeps the connection fresh
        break;
      case "zone_ack":
        break;
      default:
        console.log("[NexusStream] Unknown message type:", message.type);
    }
  }, []);

  const connect = useCallback(() => {
    if (PLACEHOLDER_STREAM_IDS.has(streamId)) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = buildWsUrl();
    setConnectionStatus("connecting");

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionStatus("open");
        retryCountRef.current = 0;

        // Subscribe to stream events
        ws.send(
          JSON.stringify({
            type: "subscribe",
            stream_id: streamId,
          }),
        );

        // Start heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
          }
        }, heartbeatInterval);
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        setConnectionStatus("closed");

        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // Attempt reconnection
        if (retryCountRef.current < 10 && !PLACEHOLDER_STREAM_IDS.has(streamId)) {
          retryCountRef.current++;
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          reconnectTimeoutRef.current = setTimeout(() => connect(), 3000);
        }
      };

      ws.onerror = () => {
        setConnectionStatus("closed");
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error("[NexusStream] Failed to parse message:", error);
        }
      };
    } catch (err) {
      console.error("[NexusStream] WebSocket setup failed:", err);
    }
  }, [streamId, buildWsUrl, handleMessage, heartbeatInterval]);

  const disconnect = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }
    setIsConnected(false);
    setConnectionStatus("closed");
  }, []);

  const sendZoneUpdate = useCallback(
    (zone: { zone_id: string; coordinates: number[][] }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "zone_update",
            zone,
          }),
        );
      }
    },
    []
  );

  const subscribe = useCallback((streamId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "subscribe",
          stream_id: streamId,
        }),
      );
    }
  }, []);

  const unsubscribe = useCallback((streamId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "unsubscribe",
          stream_id: streamId,
        }),
      );
    }
  }, []);

  // Initialize connection on mount if autoConnect; reconnect when streamId changes
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      // Detach handlers first so the socket's onclose cannot schedule a
      // reconnect after this component is gone or the stream changed.
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [autoConnect, connect]);

  return {
    detections,
    frameWidth,
    frameHeight,
    zoneEvents,
    streamStats,
    streamStatus,
    isConnected,
    connectionStatus,
    sendZoneUpdate,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
  };
}

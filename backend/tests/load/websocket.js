// k6 Load Test - WebSocket Connections
// Run: k6 run tests/load/websocket.js
// Requirements: k6 with WebSocket support (k6 v0.46+)

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const WS_URL = __ENV.WS_URL || 'ws://localhost:8003';
const errorRate = new Rate('ws_errors');

export const options = {
  scenarios: {
    websocket_connections: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 10 },
        { duration: '30s', target: 20 },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    ws_connecting: ['p(95)<3000'],
    ws_errors: ['rate<0.15'],
  },
};

export default function () {
  const streamId = 'dev_test_stream';
  const url = `${WS_URL}/api/streams/${streamId}/ws`;

  const res = ws.connect(url, {}, function (socket) {
    let messagesReceived = 0;

    socket.on('open', () => {
      // Subscribe to stream
      socket.send(JSON.stringify({
        type: 'subscribe',
        stream_id: streamId,
      }));
    });

    socket.on('message', (msg) => {
      messagesReceived++;
      try {
        const data = JSON.parse(msg);
        check(data, {
          'message has type': (d) => d.type !== undefined,
          'message type is valid': (d) =>
            ['detections', 'zone_event', 'stats', 'pong', 'zone_ack'].includes(d.type),
        });
      } catch (e) {
        errorRate.add(1);
      }
    });

    socket.on('error', (e) => {
      errorRate.add(1);
    });

    // Send periodic pings
    const pingInterval = setInterval(() => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, 5000);

    // Close after 20 seconds
    socket.setTimeout(() => {
      clearInterval(pingInterval);
      socket.close();
    }, 20000);
  });

  check(res, {
    'websocket connected': (r) => r && r.status === 101,
  });
}

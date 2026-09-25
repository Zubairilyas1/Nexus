// k6 Load Test - API Endpoints
// Run: k6 run tests/load/api.js
// Requirements: k6 installed (https://k6.io/docs/get-started/installation/)

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const API_URL = __ENV.API_URL || 'http://localhost:8003';
const errorRate = new Rate('errors');
const latencyP95 = new Trend('api_latency_p95');

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
    },
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    errors: ['rate<0.1'],
  },
};

function getAuthToken() {
  const loginRes = http.post(`${API_URL}/api/auth/login`, JSON.stringify({
    email: 'admin@nexusvision.local',
    password: 'password',
  }), { headers: { 'Content-Type': 'application/json' } });

  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    return body.access_token || body.token;
  }
  return null;
}

export function setup() {
  const token = getAuthToken();
  return { token };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (data.token) {
    headers['Authorization'] = `Bearer ${data.token}`;
  }

  // Health check (no auth)
  const healthRes = http.get(`${API_URL}/healthz`);
  check(healthRes, {
    'healthz status 200': (r) => r.status === 200,
    'healthz has status ok': (r) => {
      try { return JSON.parse(r.body).status === 'ok'; } catch { return false; }
    },
  });
  errorRate.add(healthRes.status !== 200);
  latencyP95.add(healthRes.timings.duration);

  sleep(0.1);

  // Root endpoint
  const rootRes = http.get(`${API_URL}/`);
  check(rootRes, {
    'root status 200': (r) => r.status === 200,
  });
  errorRate.add(rootRes.status !== 200);

  sleep(0.1);

  // Analytics summary
  if (data.token) {
    const summaryRes = http.get(`${API_URL}/api/analytics/summary`, { headers });
    check(summaryRes, {
      'summary status 200': (r) => r.status === 200,
      'summary has total_vehicles': (r) => {
        try { return JSON.parse(r.body).total_vehicles_24h !== undefined; } catch { return false; }
      },
    });
    errorRate.add(summaryRes.status !== 200);
    latencyP95.add(summaryRes.timings.duration);
  }

  sleep(0.2);

  // Predictions endpoint
  if (data.token) {
    const predRes = http.get(`${API_URL}/api/analytics/predictions/congestion?horizon=60`, { headers });
    check(predRes, {
      'predictions status 200': (r) => r.status === 200,
      'predictions has data': (r) => {
        try { return JSON.parse(r.body).predictions.length > 0; } catch { return false; }
      },
    });
    errorRate.add(predRes.status !== 200);
  }

  sleep(0.5);
}

export function teardown(data) {
  // Cleanup
}

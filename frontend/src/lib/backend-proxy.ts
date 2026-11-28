import { SignJWT } from "jose";
import { auth } from "@/lib/auth/config";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8003";

// These must mirror backend/app/auth/jwt.py. FastAPI's decode_token rejects any
// token whose iss/aud differ, and get_current_user looks `sub` up in the User
// table, so `sub` has to be a real user id.
const JWT_SECRET_KEY =
  process.env.JWT_SECRET_KEY ||
  "your-super-secret-jwt-key-min-32-chars-change-in-production";
const JWT_ISSUER = process.env.JWT_ISSUER || "nexusvision";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "nexusvision:api";
const JWT_EXPIRE_MINUTES = Number(
  process.env.JWT_ACCESS_TOKEN_EXPIRE_MINUTES || "15",
);

const secretKey = new TextEncoder().encode(JWT_SECRET_KEY);

/**
 * Exchange the next-auth session for a FastAPI-signed access token.
 * Returns null when there is no session — callers still forward the request so
 * the backend can decide, keeping public endpoints reachable while logged out.
 */
async function mintBackendToken(): Promise<string | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user?.email) return null;

  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    email: user.email,
    name: user.name ?? null,
    global_role: user.globalRole ?? "VIEWER",
    org_id: user.orgId ?? null,
    org_role: user.orgRole ?? null,
    project_id: user.projectId ?? null,
    project_role: user.projectRole ?? null,
    jti: crypto.randomUUID(),
  })
    .setSubject(user.id)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + JWT_EXPIRE_MINUTES * 60)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(secretKey);
}

// Set by the hops themselves; forwarding them corrupts framing and breaks
// long-lived streams like MJPEG.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function copyHeaders(source: Headers): Headers {
  const target = new Headers();
  source.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) target.set(key, value);
  });
  return target;
}

/** Forward a browser request to FastAPI at `backendPath`, injecting auth. */
export async function proxyToBackend(
  request: Request,
  backendPath: string,
): Promise<Response> {
  const { search } = new URL(request.url);
  const target = `${BACKEND_URL}${backendPath}${search}`;

  const headers = copyHeaders(request.headers);
  const token = await mintBackendToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const upstream = await fetch(target, init);

  // Passing the upstream body through untouched is what keeps MJPEG streaming
  // instead of buffering the whole multipart response.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: copyHeaders(upstream.headers),
  });
}

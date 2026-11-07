const WINDOW_MS = 60_000;
const MAX_TRACKED_CLIENTS = 2_000;

type RateLimitEntry = { count: number; resetAt: number };
type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

const requestCounts = new Map<string, RateLimitEntry>();

function clientKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwarded = forwardedFor?.split(",", 1)[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown-client";
}

export function isTrustedSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function limitRequest(request: Request, bucket: string, limit: number): RateLimitResult {
  const now = Date.now();
  const key = `${bucket}:${clientKey(request)}`;
  const current = requestCounts.get(key);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;

  entry.count += 1;
  requestCounts.set(key, entry);
  if (requestCounts.size > MAX_TRACKED_CLIENTS) {
    for (const [candidate, candidateEntry] of requestCounts) {
      if (candidateEntry.resetAt <= now || requestCounts.size > MAX_TRACKED_CLIENTS) {
        requestCounts.delete(candidate);
      }
    }
  }

  const remaining = Math.max(0, limit - entry.count);
  return {
    allowed: entry.count <= limit,
    limit,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
  };
}

export function apiHeaders(rateLimit?: RateLimitResult) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow",
    ...(rateLimit
      ? {
          "RateLimit-Limit": String(rateLimit.limit),
          "RateLimit-Remaining": String(rateLimit.remaining),
          ...(rateLimit.allowed ? {} : { "Retry-After": String(rateLimit.retryAfterSeconds) }),
        }
      : {}),
  };
}

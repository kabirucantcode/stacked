/**
 * Tiny in-memory rate limiter for the auth endpoints.
 *
 * This is deliberately simple and only correct for a single server process.
 * Behind more than one instance (or on serverless) it must be replaced with a
 * shared store such as Redis/Upstash — swap the Map for that and nothing else
 * changes. Render runs one instance by default, so this is a genuine limit
 * today rather than decoration.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_TRACKED = 5_000;

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Cheap guard against unbounded growth from spoofed keys.
  if (buckets.size > MAX_TRACKED) {
    for (const [k, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

/** Best-effort client identity from proxy headers, falling back to a shared bucket. */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  return `${scope}:${ip}`;
}

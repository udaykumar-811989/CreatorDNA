// Basic per-user rate limiting for edge functions.
//
// State lives in the isolate's memory: each deployed instance keeps its own
// buckets, so this is a fixed-window limiter per instance rather than a
// distributed one. That is enough to stop one signed-in client from burning
// paid AI quota in a tight loop, which is the threat here — it is not a
// substitute for platform-level abuse protection.
//
// Windows are lazy: a bucket is created on first use and expires on read, so
// an idle key costs nothing. The bucket map is capped so a flood of distinct
// keys (many throwaway accounts) cannot grow memory without bound.

export interface RateLimitOptions {
  /** Requests allowed inside one window for a single key. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable clock so tests never have to sleep. */
  now?: () => number;
}

export interface RateLimitResult {
  /** False when the key is over its budget — respond 429. */
  allowed: boolean;
  /** Requests still allowed in this window (always 0 when blocked). */
  remaining: number;
  /** Whole seconds until the window resets; send as `Retry-After`. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function sweepExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

/**
 * Counts one request against `key`. Returns `allowed: false` once the limit
 * is reached inside the current window; the counter resets when the window
 * elapses (checked lazily on the next call for that key).
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = (options.now ?? Date.now)();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      sweepExpired(now);
      if (buckets.size >= MAX_BUCKETS) {
        // Still full: Map preserves insertion order, so the first entry is
        // the oldest one — drop it and start fresh for this key.
        const oldest = buckets.keys().next();
        if (!oldest.done) {
          buckets.delete(oldest.value);
        }
      }
    }
    bucket = { count: 0, resetAt: now + options.windowMs };
    buckets.set(key, bucket);
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count >= options.limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  bucket.count += 1;
  return { allowed: true, remaining: options.limit - bucket.count, retryAfterSeconds };
}

/** Number of live buckets — diagnostics and tests only. */
export function rateLimitSize(): number {
  return buckets.size;
}

/** Drops every bucket (tests only). */
export function resetRateLimits(): void {
  buckets.clear();
}

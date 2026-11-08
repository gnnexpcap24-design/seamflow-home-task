type Entry = { count: number; resetAt: number };
type Options = { limit: number; windowMs: number };
export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

// Fixed-window limiter kept in memory. Each serverless instance has its own counters.
export function createRateLimiter({ limit, windowMs }: Options) {
  const entries = new Map<string, Entry>();

  function removeExpired(now: number): void {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key);
    }
  }

  return function check(key: string, now = Date.now()): RateLimitResult {
    removeExpired(now);
    const entry = entries.get(key) ?? { count: 0, resetAt: now + windowMs };
    entry.count += 1;
    entries.set(key, entry);
    if (entry.count <= limit) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  };
}

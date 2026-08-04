import { redis } from '@/infrastructure/redis';

interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

// Predefined rate limiting configurations
export const RATE_LIMIT_PRESETS: Record<string, RateLimitConfig> = {
  standard: { limit: 100, windowSeconds: 60 }, // 100 req/min for general API
  auth: { limit: 5, windowSeconds: 60 },       // 5 req/min for login, forgot-password
  dgii: { limit: 20, windowSeconds: 60 },      // 20 req/min for DGII submissions
};

// ---------------------------------------------------------------------------
// In-memory fallback for the 'auth' preset only.
// Used when Redis is unavailable to prevent fail-open on authentication
// endpoints (login, forgot-password, register). General API and DGII presets
// keep fail-open to avoid degrading service when Redis is temporarily down.
// ---------------------------------------------------------------------------
interface MemoryBucket {
  count: number;
  resetAt: number; // Unix ms timestamp
}
const memoryStore = new Map<string, MemoryBucket>();

function checkMemoryRateLimit(key: string, preset: keyof typeof RATE_LIMIT_PRESETS): boolean {
  const { limit, windowSeconds } = RATE_LIMIT_PRESETS[preset];
  const now = Date.now();
  const existing = memoryStore.get(key);

  if (!existing || now > existing.resetAt) {
    // Start a new window
    memoryStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }

  existing.count += 1;

  if (existing.count > limit) {
    console.warn(`[Rate Limit / Memory] Key ${key} exceeded the limit for preset "${preset}" (${existing.count}/${limit})`);
    return false;
  }

  return true;
}

// Periodically purge expired entries to avoid unbounded memory growth
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memoryStore.entries()) {
      if (now > v.resetAt) memoryStore.delete(k);
    }
  }, 60_000);
}

/**
 * Checks if the request exceeds the rate limit for the given key (e.g. IP or User ID).
 * Returns true if the request is ALLOWED, and false if it is RATE LIMITED.
 *
 * Behavior when Redis is unavailable:
 *   - 'auth' preset  → uses in-memory fallback (fail-closed: still enforces limit)
 *   - other presets  → fail-open (allow) to avoid service degradation
 */
export async function checkRateLimit(
  key: string,
  preset: keyof typeof RATE_LIMIT_PRESETS = 'standard'
): Promise<boolean> {
  const r = redis;
  const redisOffline = !r || r.status !== 'ready';

  if (redisOffline) {
    // Auth endpoints are protected by an in-memory fallback to prevent brute-force
    // attacks even when Redis is down. Other presets degrade gracefully (fail-open).
    if (preset === 'auth') {
      return checkMemoryRateLimit(`mem:${key}`, preset);
    }
    return true;
  }

  const { limit, windowSeconds } = RATE_LIMIT_PRESETS[preset];
  const redisKey = `ratelimit:${preset}:${key}`;

  try {
    // Increment with a 200ms timeout to avoid blocking the request if Redis is slow
    const incrPromise = r.incr(redisKey);
    const timeoutPromise = new Promise<number>((_, reject) =>
      setTimeout(() => reject(new Error('Redis timeout')), 200)
    );

    const currentCount = await Promise.race([incrPromise, timeoutPromise]);

    // If it's the first request in the window, set the expiration
    if (currentCount === 1) {
      r.expire(redisKey, windowSeconds).catch(() => {}); // Fire and forget
    }

    if (currentCount > limit) {
      console.warn(`[Rate Limit] Key ${key} exceeded the limit for preset "${preset}" (${currentCount}/${limit})`);
      return false;
    }

    return true;
  } catch (error) {
    // Redis query timed out or threw — fall back to memory for 'auth', fail-open for others
    console.error(`[Rate Limit] Redis error for key ${key} (preset: ${preset}):`, error);
    if (preset === 'auth') {
      return checkMemoryRateLimit(`mem:${key}`, preset);
    }
    return true;
  }
}

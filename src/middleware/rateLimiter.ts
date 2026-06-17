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

/**
 * Checks if the request exceeds the rate limit for the given key (e.g. IP or User ID).
 * Returns true if the request is ALLOWED, and false if it is RATE LIMITED.
 */
export async function checkRateLimit(
  key: string,
  preset: keyof typeof RATE_LIMIT_PRESETS = 'standard'
): Promise<boolean> {
  // If Redis is offline, not configured, or in closed/end state, allow the request to prevent service outage
  if (!redis || redis.status === 'close' || redis.status === 'end') {
    return true;
  }

  const { limit, windowSeconds } = RATE_LIMIT_PRESETS[preset];
  const redisKey = `ratelimit:${preset}:${key}`;

  try {
    // Incrementar con un timeout rápido de 200ms para evitar que el request se demore si Redis está caído
    const incrPromise = redis.incr(redisKey);
    const timeoutPromise = new Promise<number>((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 200));
    
    const currentCount = await Promise.race([incrPromise, timeoutPromise]);

    // If it's the first request in the window, set the expiration
    if (currentCount === 1) {
      redis.expire(redisKey, windowSeconds).catch(() => {}); // Fire and forget
    }

    // If count exceeds limit, rate limit the request
    if (currentCount > limit) {
      console.warn(`[Rate Limit] Key ${key} exceeded the limit for preset "${preset}" (${currentCount}/${limit})`);
      return false;
    }

    return true;
  } catch (error) {
    // If a Redis query error occurs, log it and allow the request (fail-open strategy)
    console.error(`Rate limiting error for key ${key}:`, error);
    return true;
  }
}

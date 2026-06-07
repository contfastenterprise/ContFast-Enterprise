import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redis: Redis | null = null;

try {
  console.log('Initializing Redis client...');
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    lazyConnect: true, // Connect lazily so we can catch initial connect errors
  });

  redis.on('connect', () => {
    console.log('Successfully connected to Redis.');
  });

  redis.on('error', (err) => {
    console.error('Redis Connection Error:', err.message);
  });
} catch (error: any) {
  console.error('Failed to initialize Redis client:', error.message);
}

export { redis };

// Caching Helpers
export async function getCache(key: string): Promise<string | null> {
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch (error) {
    console.error(`Cache get error for key ${key}:`, error);
    return null;
  }
}

export async function setCache(key: string, value: string, expireSeconds?: number): Promise<void> {
  if (!redis) return;
  try {
    if (expireSeconds) {
      await redis.set(key, value, 'EX', expireSeconds);
    } else {
      await redis.set(key, value);
    }
  } catch (error) {
    console.error(`Cache set error for key ${key}:`, error);
  }
}

export async function delCache(key: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Cache delete error for key ${key}:`, error);
  }
}

export async function clearCachePattern(pattern: string): Promise<void> {
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`Cleared ${keys.length} cached keys matching pattern: ${pattern}`);
    }
  } catch (error) {
    console.error(`Cache clear pattern error for ${pattern}:`, error);
  }
}

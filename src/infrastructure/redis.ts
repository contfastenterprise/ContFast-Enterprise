import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

let redis: Redis | null = null;

if (REDIS_URL || process.env.NODE_ENV !== 'production') {
  const finalRedisUrl = REDIS_URL || 'redis://localhost:6379';
  try {
    console.log('Initializing Redis client...');
    redis = new Redis(finalRedisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
      lazyConnect: true, // Connect lazily so we can catch initial connect errors
      enableOfflineQueue: false, // Prevents hanging when Redis is down
      retryStrategy(times) {
        // Retry every 5 seconds to prevent event loop flooding
        return 5000;
      }
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
} else {
  console.log('Redis URL not provided. Redis is disabled (running in fallback mode).');
}

export { redis };

// Caching Helpers
export async function getCache(key: string): Promise<string | null> {
  if (!redis || redis.status !== 'ready') return null;
  try {
    return await redis.get(key);
  } catch (error) {
    console.error(`Cache get error for key ${key}:`, error);
    return null;
  }
}

export async function setCache(key: string, value: string, expireSeconds?: number): Promise<void> {
  if (!redis || redis.status !== 'ready') return;
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
  if (!redis || redis.status !== 'ready') return;
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Cache delete error for key ${key}:`, error);
  }
}

export async function clearCachePattern(pattern: string): Promise<void> {
  if (!redis || redis.status !== 'ready') return;
  try {
    let cursor = '0';
    let allKeys: string[] = [];
    do {
      const res = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = res[0];
      allKeys.push(...res[1]);
    } while (cursor !== '0');

    if (allKeys.length > 0) {
      await redis.del(...allKeys);
      console.log(`Cleared ${allKeys.length} cached keys matching pattern: ${pattern}`);
    }
  } catch (error) {
    console.error(`Cache clear pattern error for ${pattern}:`, error);
  }
}

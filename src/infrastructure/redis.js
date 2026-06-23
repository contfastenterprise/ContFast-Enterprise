"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.getCache = getCache;
exports.setCache = setCache;
exports.delCache = delCache;
exports.clearCachePattern = clearCachePattern;
const ioredis_1 = require("ioredis");
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
let redis = null;
exports.redis = redis;
try {
    console.log('Initializing Redis client...');
    exports.redis = redis = new ioredis_1.default(REDIS_URL, {
        maxRetriesPerRequest: null, // Required by BullMQ
        lazyConnect: true, // Connect lazily so we can catch initial connect errors
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
}
catch (error) {
    console.error('Failed to initialize Redis client:', error.message);
}
// Caching Helpers
async function getCache(key) {
    if (!redis)
        return null;
    try {
        return await redis.get(key);
    }
    catch (error) {
        console.error(`Cache get error for key ${key}:`, error);
        return null;
    }
}
async function setCache(key, value, expireSeconds) {
    if (!redis)
        return;
    try {
        if (expireSeconds) {
            await redis.set(key, value, 'EX', expireSeconds);
        }
        else {
            await redis.set(key, value);
        }
    }
    catch (error) {
        console.error(`Cache set error for key ${key}:`, error);
    }
}
async function delCache(key) {
    if (!redis)
        return;
    try {
        await redis.del(key);
    }
    catch (error) {
        console.error(`Cache delete error for key ${key}:`, error);
    }
}
async function clearCachePattern(pattern) {
    if (!redis)
        return;
    try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
            console.log(`Cleared ${keys.length} cached keys matching pattern: ${pattern}`);
        }
    }
    catch (error) {
        console.error(`Cache clear pattern error for ${pattern}:`, error);
    }
}

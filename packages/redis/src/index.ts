/**
 * Redis Module Entry Point
 *
 * Initializes and exports a singleton ioredis client connected to Redis.
 * Reuses the connection in development to prevent connection leaks during
 * hot-reloads (same pattern as the DB package).
 */
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const globalForRedis = globalThis as unknown as { redisClient: Redis | undefined };

const redis = globalForRedis.redisClient ?? new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redisClient = redis;
}

redis.on('error', (err) => {
  console.error('[redis] Connection error:', err.message);
});

redis.on('connect', () => {
  console.log('[redis] Connected to', redisUrl);
});

export { redis };

import { Request, Response, NextFunction } from 'express';
import { redis } from '@ai-gatekeeper/redis';

/** Rate limit: max requests per window */
const RATE_LIMIT_MAX = 60;

/** Rate limit window size in seconds */
const RATE_LIMIT_WINDOW = 60;

/** Redis key prefix for rate limit counters */
const RL_KEY_PREFIX = 'gk:rl:';

/**
 * Rate Limiting Middleware
 *
 * Uses a fixed-window counter in Redis. Each API key gets a counter
 * that increments per request and expires after the window elapses.
 *
 * Must be placed AFTER `requireVirtualKey` so `req.gatekeeper` is available.
 */
export const rateLimit = async (req: Request, res: Response, next: NextFunction) => {
  const apiKeyId = req.gatekeeper?.apiKeyId;
  if (!apiKeyId) {
    // If gatekeeper isn't set, auth middleware already rejected — just pass through
    return next();
  }

  const windowKey = Math.floor(Date.now() / (RATE_LIMIT_WINDOW * 1000));
  const redisKey = `${RL_KEY_PREFIX}${apiKeyId}:${windowKey}`;

  try {
    const results = await redis
      .multi()
      .incr(redisKey)
      .expire(redisKey, RATE_LIMIT_WINDOW)
      .exec();

    // results is [[null, count], [null, 1]] — first element of first pair is the counter
    const currentCount = (results?.[0]?.[1] as number) ?? 0;
    const remaining = Math.max(0, RATE_LIMIT_MAX - currentCount);

    // Always set rate limit headers
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', (windowKey + 1) * RATE_LIMIT_WINDOW);

    if (currentCount > RATE_LIMIT_MAX) {
      const retryAfter = Math.ceil(((windowKey + 1) * RATE_LIMIT_WINDOW) - (Date.now() / 1000));
      res.setHeader('Retry-After', Math.max(1, retryAfter));
      return res.status(429).json({
        error: {
          message: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW}s. Retry after ${Math.max(1, retryAfter)}s.`,
          type: 'rate_limit_error',
        },
      });
    }
  } catch (err) {
    // Redis failure shouldn't block requests — allow through
    console.error('[rateLimit] Redis error, allowing request:', err);
  }

  next();
};

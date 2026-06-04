import { redis } from '@ai-gatekeeper/redis';
import { db, usageEvents } from '@ai-gatekeeper/db';

/** Redis key for the usage event buffer list */
const BUFFER_KEY = 'gk:usage:buffer';

/** Maximum events to flush in a single batch */
const FLUSH_BATCH_SIZE = 50;

/** Flush interval in milliseconds */
const FLUSH_INTERVAL_MS = 5_000;

export interface UsageEvent {
  projectId: string;
  userId: string;
  apiKeyId: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
  httpStatus: number;
  userTags: string[];
}

/**
 * Buffer a usage event into Redis for deferred Postgres insertion.
 * Falls back to direct DB insert if Redis is unavailable.
 */
export async function bufferUsageEvent(event: UsageEvent): Promise<void> {
  try {
    await redis.rpush(BUFFER_KEY, JSON.stringify(event));
  } catch (err) {
    // Fallback: insert directly so we never lose data
    console.error('[usageBuffer] Redis push failed, inserting directly:', err);
    try {
      await db.insert(usageEvents).values(event);
    } catch (dbErr) {
      console.error('[usageBuffer] Direct DB insert also failed:', dbErr);
    }
  }
}

/**
 * Flush buffered events from Redis into Postgres in batches.
 */
async function flushEvents(): Promise<void> {
  try {
    const len = await redis.llen(BUFFER_KEY);
    if (len === 0) return;

    const batchSize = Math.min(len, FLUSH_BATCH_SIZE);

    // Atomically read + trim the batch from the list
    const pipeline = redis.multi();
    pipeline.lrange(BUFFER_KEY, 0, batchSize - 1);
    pipeline.ltrim(BUFFER_KEY, batchSize, -1);
    const results = await pipeline.exec();

    const rawEvents = (results?.[0]?.[1] as string[]) ?? [];
    if (rawEvents.length === 0) return;

    const events: UsageEvent[] = rawEvents.map((raw) => JSON.parse(raw));

    await db.insert(usageEvents).values(events);
    console.log(`[usageBuffer] Flushed ${events.length} events to Postgres`);
  } catch (err) {
    console.error('[usageBuffer] Flush error:', err);
  }
}

let flushInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic usage flusher.
 * Should be called once on proxy startup.
 */
export function startUsageFlusher(): void {
  if (flushInterval) return;

  console.log(`[usageBuffer] Flusher started (interval=${FLUSH_INTERVAL_MS}ms, batchSize=${FLUSH_BATCH_SIZE})`);
  flushInterval = setInterval(flushEvents, FLUSH_INTERVAL_MS);

  // Graceful shutdown: flush remaining events before exit
  const shutdown = async () => {
    console.log('[usageBuffer] Shutting down — flushing remaining events...');
    if (flushInterval) {
      clearInterval(flushInterval);
      flushInterval = null;
    }
    // Drain the buffer completely
    let remaining = await redis.llen(BUFFER_KEY).catch(() => 0);
    while (remaining > 0) {
      await flushEvents();
      remaining = await redis.llen(BUFFER_KEY).catch(() => 0);
    }
    console.log('[usageBuffer] Buffer drained.');
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

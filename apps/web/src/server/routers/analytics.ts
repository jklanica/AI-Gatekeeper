import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db, usageEvents, users, projectMembers } from '@ai-gatekeeper/db';
import { eq, and, sql, gte, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { redis } from '@ai-gatekeeper/redis';
import crypto from 'crypto';

/** TTL for cached analytics results (seconds) */
const ANALYTICS_CACHE_TTL = 30;

/** Redis key prefix for analytics cache */
const ANALYTICS_KEY_PREFIX = 'gk:analytics:';

/** Verify the user is a member of the given project; throws UNAUTHORIZED if not. */
async function requireMembership(projectId: string, userId: string) {
  const [membership] = await db.select().from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  if (!membership) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not a member of this project' });
  return membership;
}

function buildFilters(input: { projectId: string, days: number, userIds?: string[], tags?: string[] }, d: Date) {
  const conditions = [
    eq(usageEvents.projectId, input.projectId),
    gte(usageEvents.timestamp, d)
  ];

  if (input.userIds && input.userIds.length > 0) {
    conditions.push(inArray(usageEvents.userId, input.userIds));
  }

  if (input.tags && input.tags.length > 0) {
    const tagSqls = input.tags.map(t => sql`${t}`);
    conditions.push(sql`${usageEvents.userTags} && array[${sql.join(tagSqls, sql`, `)}]::text[]`);
  }

  return and(...conditions);
}

/**
 * Build a deterministic cache key from the procedure name and input parameters.
 * Uses a short hash of the filter arrays to keep keys compact.
 */
function buildCacheKey(procedure: string, input: { projectId: string; days: number; userIds?: string[]; tags?: string[] }): string {
  const filterHash = crypto
    .createHash('md5')
    .update(JSON.stringify({ u: input.userIds?.sort() ?? [], t: input.tags?.sort() ?? [] }))
    .digest('hex')
    .slice(0, 8);
  return `${ANALYTICS_KEY_PREFIX}${procedure}:${input.projectId}:${input.days}:${filterHash}`;
}

/**
 * Try to read a cached result from Redis.
 * Returns null on miss or Redis failure.
 */
async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    if (raw) return JSON.parse(raw) as T;
  } catch (err) {
    console.error('[analytics] Redis cache read error:', err);
  }
  return null;
}

/**
 * Write a result to Redis cache. Failures are silently logged.
 */
async function setInCache(key: string, data: unknown): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(data), 'EX', ANALYTICS_CACHE_TTL);
  } catch (err) {
    console.error('[analytics] Redis cache write error:', err);
  }
}

const analyticsInput = z.object({
  projectId: z.string(),
  days: z.number().default(30),
  userIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * Analytics Router
 * 
 * Provides endpoints for retrieving usage and cost analytics for a project.
 * Supports aggregation over time, by user, and by model.
 * Results are cached in Redis for 30 seconds to reduce database load.
 */
export const analyticsRouter = router({
  /**
   * Get Summary Analytics
   * 
   * Retrieves high-level usage statistics (requests, tokens, cost) for the project
   * over a specified number of days (default: 30).
   */
  summary: protectedProcedure.input(analyticsInput).query(async ({ input, ctx }) => {
    await requireMembership(input.projectId, ctx.user.id);

    type SummaryResult = { totalRequests: number; totalTokens: number; totalCost: number };

    const cacheKey = buildCacheKey('summary', input);
    const cached = await getFromCache<SummaryResult>(cacheKey);
    if (cached) return cached;

    const d = new Date();
    d.setDate(d.getDate() - input.days);
    
    const [result] = await db.select({
      totalRequests: sql<number>`COUNT(*)::int`,
      totalTokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens)::int, 0)`,
      totalCost: sql<number>`COALESCE(SUM(cost_usd)::float, 0)`,
    })
    .from(usageEvents)
    .where(buildFilters(input, d));
    
    const data: SummaryResult = result || { totalRequests: 0, totalTokens: 0, totalCost: 0 };
    await setInCache(cacheKey, data);
    return data;
  }),

  /**
   * Get Analytics by User
   * 
   * Groups usage and cost metrics by individual users within the project.
   */
  byUser: protectedProcedure.input(analyticsInput).query(async ({ input, ctx }) => {
    await requireMembership(input.projectId, ctx.user.id);

    type ByUserRow = { name: string; tokens: number; cost: number };

    const cacheKey = buildCacheKey('byUser', input);
    const cached = await getFromCache<ByUserRow[]>(cacheKey);
    if (cached) return cached;

    const d = new Date();
    d.setDate(d.getDate() - input.days);

    const rows = await db.select({
      name: users.displayName,
      tokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens)::int, 0)`,
      cost: sql<number>`COALESCE(SUM(cost_usd)::float, 0)`,
    })
    .from(usageEvents)
    .leftJoin(users, eq(users.id, usageEvents.userId))
    .where(buildFilters(input, d))
    .groupBy(users.displayName);

    const data: ByUserRow[] = rows.map(r => ({ ...r, name: r.name || '(Shared Key)' }));
    await setInCache(cacheKey, data);
    return data;
  }),

  /**
   * Get Analytics by Model
   * 
   * Groups usage and cost metrics by the specific LLM model used.
   */
  byModel: protectedProcedure.input(analyticsInput).query(async ({ input, ctx }) => {
    await requireMembership(input.projectId, ctx.user.id);

    type ByModelRow = { model: string; tokens: number; cost: number };

    const cacheKey = buildCacheKey('byModel', input);
    const cached = await getFromCache<ByModelRow[]>(cacheKey);
    if (cached) return cached;

    const d = new Date();
    d.setDate(d.getDate() - input.days);

    const rows = await db.select({
      model: usageEvents.model,
      tokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens)::int, 0)`,
      cost: sql<number>`COALESCE(SUM(cost_usd)::float, 0)`,
    })
    .from(usageEvents)
    .where(buildFilters(input, d))
    .groupBy(usageEvents.model);

    await setInCache(cacheKey, rows);
    return rows;
  }),

  /**
   * Get Analytics Timeline
   * 
   * Retrieves daily aggregated usage and cost metrics for time-series charts.
   */
  timeline: protectedProcedure.input(analyticsInput).query(async ({ input, ctx }) => {
    await requireMembership(input.projectId, ctx.user.id);

    type TimelineRow = { date: string; tokens: number; cost: number };

    const cacheKey = buildCacheKey('timeline', input);
    const cached = await getFromCache<TimelineRow[]>(cacheKey);
    if (cached) return cached;

    const d = new Date();
    d.setDate(d.getDate() - input.days);

    const rows = await db.select({
      date: sql<string>`TO_CHAR(DATE_TRUNC('day', timestamp), 'YYYY-MM-DD')`,
      tokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens)::int, 0)`,
      cost: sql<number>`COALESCE(SUM(cost_usd)::float, 0)`,
    })
    .from(usageEvents)
    .where(buildFilters(input, d))
    .groupBy(sql`DATE_TRUNC('day', timestamp)`)
    .orderBy(sql`DATE_TRUNC('day', timestamp) ASC`);

    await setInCache(cacheKey, rows);
    return rows;
  }),

  /**
   * Get all unique tags used in the project
   */
  tags: protectedProcedure.input(z.object({ projectId: z.string() })).query(async ({ input, ctx }) => {
    await requireMembership(input.projectId, ctx.user.id);
    const rows = await db.select({ tags: projectMembers.tags })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, input.projectId));
    
    const uniqueTags = new Set<string>();
    for (const row of rows) {
      if (row.tags) {
        for (const tag of row.tags) {
          uniqueTags.add(tag);
        }
      }
    }
    return Array.from(uniqueTags).sort();
  }),
});

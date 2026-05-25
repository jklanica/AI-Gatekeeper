import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db, usageEvents, users, projectMembers } from '@ai-gatekeeper/db';
import { eq, and, sql, gte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

/** Verify the user is a member of the given project; throws UNAUTHORIZED if not. */
async function requireMembership(projectId: string, userId: string) {
  const [membership] = await db.select().from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  if (!membership) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not a member of this project' });
  return membership;
}

/**
 * Analytics Router
 * 
 * Provides endpoints for retrieving usage and cost analytics for a project.
 * Supports aggregation over time, by user, and by model.
 */
export const analyticsRouter = router({
  /**
   * Get Summary Analytics
   * 
   * Retrieves high-level usage statistics (requests, tokens, cost) for the project
   * over a specified number of days (default: 30).
   */
  summary: protectedProcedure.input(z.object({ projectId: z.string(), days: z.number().default(30) })).query(async ({ input, ctx }) => {
    await requireMembership(input.projectId, ctx.user.id);

    const d = new Date();
    d.setDate(d.getDate() - input.days);
    
    const [result] = await db.select({
      totalRequests: sql<number>`COUNT(*)::int`,
      totalTokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens)::int, 0)`,
      totalCost: sql<number>`COALESCE(SUM(cost_usd)::float, 0)`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.projectId, input.projectId), gte(usageEvents.timestamp, d)));
    
    return result || { totalRequests: 0, totalTokens: 0, totalCost: 0 };
  }),

  /**
   * Get Analytics by User
   * 
   * Groups usage and cost metrics by individual users within the project.
   */
  byUser: protectedProcedure.input(z.object({ projectId: z.string(), days: z.number().default(30) })).query(async ({ input, ctx }) => {
    await requireMembership(input.projectId, ctx.user.id);

    const d = new Date();
    d.setDate(d.getDate() - input.days);

    const rows = await db.select({
      name: users.displayName,
      tokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens)::int, 0)`,
      cost: sql<number>`COALESCE(SUM(cost_usd)::numeric, 0)`,
    })
    .from(usageEvents)
    .leftJoin(users, eq(users.id, usageEvents.userId))
    .where(and(eq(usageEvents.projectId, input.projectId), gte(usageEvents.timestamp, d)))
    .groupBy(users.displayName);

    return rows.map(r => ({ ...r, name: r.name || '(Shared Key)' }));
  }),

  /**
   * Get Analytics by Model
   * 
   * Groups usage and cost metrics by the specific LLM model used.
   */
  byModel: protectedProcedure.input(z.object({ projectId: z.string(), days: z.number().default(30) })).query(async ({ input, ctx }) => {
    await requireMembership(input.projectId, ctx.user.id);

    const d = new Date();
    d.setDate(d.getDate() - input.days);

    const rows = await db.select({
      model: usageEvents.model,
      tokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens)::int, 0)`,
      cost: sql<number>`COALESCE(SUM(cost_usd)::numeric, 0)`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.projectId, input.projectId), gte(usageEvents.timestamp, d)))
    .groupBy(usageEvents.model);

    return rows;
  }),

  /**
   * Get Analytics Timeline
   * 
   * Retrieves daily aggregated usage and cost metrics for time-series charts.
   */
  timeline: protectedProcedure.input(z.object({ projectId: z.string(), days: z.number().default(30) })).query(async ({ input, ctx }) => {
    await requireMembership(input.projectId, ctx.user.id);

    const d = new Date();
    d.setDate(d.getDate() - input.days);

    const rows = await db.select({
      date: sql<string>`TO_CHAR(DATE_TRUNC('day', timestamp), 'YYYY-MM-DD')`,
      tokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens)::int, 0)`,
      cost: sql<number>`COALESCE(SUM(cost_usd)::numeric, 0)`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.projectId, input.projectId), gte(usageEvents.timestamp, d)))
    .groupBy(sql`DATE_TRUNC('day', timestamp)`)
    .orderBy(sql`DATE_TRUNC('day', timestamp) ASC`);

    return rows;
  }),
});


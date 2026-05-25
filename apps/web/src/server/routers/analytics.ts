import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db, usageEvents, users } from '@ai-gatekeeper/db';
import { eq, and, sql, gte } from 'drizzle-orm';

export const analyticsRouter = router({
  summary: protectedProcedure.input(z.object({ projectId: z.string(), days: z.number().default(30) })).query(async ({ input }) => {
    const d = new Date();
    d.setDate(d.getDate() - input.days);
    
    const [result] = await db.select({
      totalRequests: sql<number>`COUNT(*)::int`,
      totalTokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens)::int, 0)`,
      totalCost: sql<number>`COALESCE(SUM(cost_usd)::numeric, 0)`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.projectId, input.projectId), gte(usageEvents.timestamp, d)));
    
    return result || { totalRequests: 0, totalTokens: 0, totalCost: 0 };
  }),
  byUser: protectedProcedure.input(z.object({ projectId: z.string() })).query(async ({ input }) => {
    const rows = await db.select({
      name: users.displayName,
      tokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens)::int, 0)`,
      cost: sql<number>`COALESCE(SUM(cost_usd)::numeric, 0)`,
    })
    .from(usageEvents)
    .innerJoin(users, eq(users.id, usageEvents.userId))
    .where(eq(usageEvents.projectId, input.projectId))
    .groupBy(users.displayName);

    return rows;
  }),
  byModel: protectedProcedure.input(z.object({ projectId: z.string() })).query(async ({ input }) => {
    const rows = await db.select({
      model: usageEvents.model,
      tokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens)::int, 0)`,
      cost: sql<number>`COALESCE(SUM(cost_usd)::numeric, 0)`,
    })
    .from(usageEvents)
    .where(eq(usageEvents.projectId, input.projectId))
    .groupBy(usageEvents.model);

    return rows;
  }),
  timeline: protectedProcedure.input(z.object({ projectId: z.string(), days: z.number().default(30) })).query(async ({ input }) => {
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

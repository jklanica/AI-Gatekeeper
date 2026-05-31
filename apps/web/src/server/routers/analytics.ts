import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db, usageEvents, users, projectMembers } from '@ai-gatekeeper/db';
import { eq, and, sql, gte, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

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

    const d = new Date();
    d.setDate(d.getDate() - input.days);
    
    const [result] = await db.select({
      totalRequests: sql<number>`COUNT(*)::int`,
      totalTokens: sql<number>`COALESCE(SUM(input_tokens + output_tokens)::int, 0)`,
      totalCost: sql<number>`COALESCE(SUM(cost_usd)::float, 0)`,
    })
    .from(usageEvents)
    .where(buildFilters(input, d));
    
    return result || { totalRequests: 0, totalTokens: 0, totalCost: 0 };
  }),

  /**
   * Get Analytics by User
   * 
   * Groups usage and cost metrics by individual users within the project.
   */
  byUser: protectedProcedure.input(analyticsInput).query(async ({ input, ctx }) => {
    await requireMembership(input.projectId, ctx.user.id);

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

    return rows.map(r => ({ ...r, name: r.name || '(Shared Key)' }));
  }),

  /**
   * Get Analytics by Model
   * 
   * Groups usage and cost metrics by the specific LLM model used.
   */
  byModel: protectedProcedure.input(analyticsInput).query(async ({ input, ctx }) => {
    await requireMembership(input.projectId, ctx.user.id);

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

    return rows;
  }),

  /**
   * Get Analytics Timeline
   * 
   * Retrieves daily aggregated usage and cost metrics for time-series charts.
   */
  timeline: protectedProcedure.input(analyticsInput).query(async ({ input, ctx }) => {
    await requireMembership(input.projectId, ctx.user.id);

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

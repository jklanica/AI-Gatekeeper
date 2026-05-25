import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db, projects, projectMembers, usageEvents } from '@ai-gatekeeper/db';
import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const projectsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      memberCount: sql<number>`(SELECT COUNT(*)::int FROM project_members WHERE project_id = ${projects.id})`,
      totalTokens: sql<number>`COALESCE((SELECT SUM(input_tokens + output_tokens)::int FROM usage_events WHERE project_id = ${projects.id}), 0)`,
      estimatedCost: sql<number>`COALESCE((SELECT SUM(cost_usd)::float FROM usage_events WHERE project_id = ${projects.id}), 0)`,
    })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, ctx.user.id));
    
    return rows;
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.id), eq(projectMembers.userId, ctx.user.id))).limit(1);
    if (!membership) throw new TRPCError({ code: 'UNAUTHORIZED' });

    const [project] = await db.select().from(projects).where(eq(projects.id, input.id)).limit(1);
    return project;
  }),
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const [newProject] = await db.insert(projects).values({
        name: input.name,
        description: input.description,
        createdBy: ctx.user.id,
      }).returning();
      
      await db.insert(projectMembers).values({
        projectId: newProject.id,
        userId: ctx.user.id,
        role: 'owner',
      });
      return newProject;
    }),
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.id), eq(projectMembers.userId, ctx.user.id))).limit(1);
    if (membership?.role !== 'owner') throw new TRPCError({ code: 'UNAUTHORIZED' });
    
    await db.delete(projects).where(eq(projects.id, input.id));
    return { success: true };
  }),
});

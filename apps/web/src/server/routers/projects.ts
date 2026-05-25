import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db, projects, projectMembers } from '@ai-gatekeeper/db';
import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

/**
 * Projects Router
 * 
 * Manages project entities including creation, retrieval, updates, and deletion.
 * Also handles computing aggregate statistics (usage and cost) for projects.
 */
export const projectsRouter = router({
  /**
   * List Projects
   * 
   * Retrieves all projects the current user is a member of.
   * Includes aggregate statistics for the current month such as total tokens and estimated cost.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const rows = await db.select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      memberCount: sql<number>`(SELECT COUNT(*)::int FROM project_members WHERE project_id = ${projects.id})`,
      totalTokens: sql<number>`COALESCE((SELECT SUM(input_tokens + output_tokens)::int FROM usage_events WHERE project_id = ${projects.id} AND timestamp >= ${startOfMonth.toISOString()}), 0)`,
      estimatedCost: sql<number>`COALESCE((SELECT SUM(cost_usd)::float FROM usage_events WHERE project_id = ${projects.id} AND timestamp >= ${startOfMonth.toISOString()}), 0)`,
    })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, ctx.user.id));
    
    return rows;
  }),
  
  /**
   * Get Project Details
   * 
   * Retrieves detailed information for a specific project.
   * Provider API keys are masked for security and only returned to owners/admins.
   */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.id), eq(projectMembers.userId, ctx.user.id))).limit(1);
    if (!membership) throw new TRPCError({ code: 'UNAUTHORIZED' });

    const [project] = await db.select().from(projects).where(eq(projects.id, input.id)).limit(1);
    
    // Mask the provider API keys for security — return a new object to avoid mutating the Drizzle result
    const maskKey = (key: string | null) => {
      if (!key) return null;
      return key.length > 8 ? `${key.substring(0, 4)}••••••••••••••${key.slice(-4)}` : '••••••••••••••';
    };

    const isPrivileged = membership.role === 'owner' || membership.role === 'admin';
    return {
      ...project,
      openaiApiKey: isPrivileged ? maskKey(project.openaiApiKey) : null,
      anthropicApiKey: isPrivileged ? maskKey(project.anthropicApiKey) : null,
      googleApiKey: isPrivileged ? maskKey(project.googleApiKey) : null,
    };
  }),

  /**
   * Create Project
   * 
   * Creates a new project and assigns the current user as its owner.
   */
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

  /**
   * Update Provider API Keys
   * 
   * Allows owners and admins to configure or clear upstream provider API keys 
   * (e.g., OpenAI, Anthropic, Google) for the project.
   */
  updateProviderApiKeys: protectedProcedure
    .input(z.object({ 
      id: z.string(), 
      openaiApiKey: z.string().optional(),
      anthropicApiKey: z.string().optional(),
      googleApiKey: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.id), eq(projectMembers.userId, ctx.user.id))).limit(1);
      if (membership?.role !== 'owner' && membership?.role !== 'admin') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Only owners and admins can update provider API keys' });
      }
      
      const updateData: Partial<{ openaiApiKey: string | null; anthropicApiKey: string | null; googleApiKey: string | null }> = {};
      // If the field is passed as empty string, we set it to null to clear it.
      // If it's undefined, it wasn't part of the update.
      if (input.openaiApiKey !== undefined) updateData.openaiApiKey = input.openaiApiKey || null;
      if (input.anthropicApiKey !== undefined) updateData.anthropicApiKey = input.anthropicApiKey || null;
      if (input.googleApiKey !== undefined) updateData.googleApiKey = input.googleApiKey || null;

      if (Object.keys(updateData).length > 0) {
        await db.update(projects).set(updateData).where(eq(projects.id, input.id));
      }
      return { success: true };
    }),

  /**
   * Delete Project
   * 
   * Permanently deletes a project. Restricted to project owners only.
   */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.id), eq(projectMembers.userId, ctx.user.id))).limit(1);
    if (membership?.role !== 'owner') throw new TRPCError({ code: 'UNAUTHORIZED' });
    
    await db.delete(projects).where(eq(projects.id, input.id));
    return { success: true };
  }),
});

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db, projectMembers, users } from '@ai-gatekeeper/db';
import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

/**
 * Members Router
 * 
 * Manages project memberships, roles, tags, and computes per-member usage.
 */
export const membersRouter = router({
  /**
   * List Project Members
   * 
   * Retrieves all members of a project along with their roles, tags, 
   * and usage statistics for the last 30 days.
   */
  list: protectedProcedure.input(z.object({ projectId: z.string() })).query(async ({ input, ctx }) => {
    const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
    if (!membership) throw new TRPCError({ code: 'UNAUTHORIZED' });

    // Get 30-day usage per member with a subquery
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const rows = await db.select({
      userId: users.id,
      name: users.displayName,
      role: projectMembers.role,
      tags: projectMembers.tags,
      usage: sql<number>`COALESCE((
        SELECT SUM(input_tokens + output_tokens)::int 
        FROM usage_events 
        WHERE usage_events.user_id = ${users.id} 
          AND usage_events.project_id = ${projectMembers.projectId}
          AND usage_events.timestamp >= ${thirtyDaysAgo.toISOString()}
      ), 0)`,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, input.projectId));
    
    return rows;
  }),

  /**
   * Add Member
   * 
   * Adds a new user to the project by email with a 'member' role and optional tags.
   */
  add: protectedProcedure
    .input(z.object({ 
      projectId: z.string(), 
      email: z.string().email({ message: 'Please provide a valid email address' }), 
      tags: z.array(z.string()).optional() 
    }))
    .mutation(async ({ input, ctx }) => {
      const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) throw new TRPCError({ code: 'UNAUTHORIZED' });

      const [userToAdd] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (!userToAdd) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const [existingMember] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, userToAdd.id))).limit(1);
      if (existingMember) throw new TRPCError({ code: 'CONFLICT', message: 'User is already a member of this project' });

      await db.insert(projectMembers).values({
        projectId: input.projectId,
        userId: userToAdd.id,
        role: 'member',
        tags: input.tags || [],
      });
      return { success: true };
    }),

  /**
   * Remove Member
   * 
   * Removes a user from the project. Validates permissions and prevents self-removal.
   */
  remove: protectedProcedure
    .input(z.object({ projectId: z.string(), userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot remove yourself' });

      const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) throw new TRPCError({ code: 'UNAUTHORIZED' });

      const [targetMembership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId))).limit(1);
      if (!targetMembership) throw new TRPCError({ code: 'NOT_FOUND', message: 'Target member not found' });
      
      if (membership.role === 'admin' && targetMembership.role !== 'member') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Admins can only remove members' });
      }

      await db.delete(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId)));
      return { success: true };
    }),

  /**
   * Update Member Tags
   * 
   * Modifies the metadata tags associated with a member's role in the project.
   */
  updateTags: protectedProcedure
    .input(z.object({ projectId: z.string(), userId: z.string(), tags: z.array(z.string()) }))
    .mutation(async ({ input, ctx }) => {
      const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) throw new TRPCError({ code: 'UNAUTHORIZED' });

      const [targetMembership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId))).limit(1);
      if (!targetMembership) throw new TRPCError({ code: 'NOT_FOUND', message: 'Target member not found' });

      if (membership.role === 'admin' && targetMembership.role !== 'member') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Admins can only update tags for members' });
      }

      await db.update(projectMembers).set({ tags: input.tags }).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId)));
      return { success: true };
    }),

  /**
   * Update Member Role
   * 
   * Changes a member's permission level. Handles owner transfers safely within a transaction.
   */
  updateRole: protectedProcedure
    .input(z.object({ projectId: z.string(), userId: z.string(), role: z.enum(['owner', 'admin', 'member']) }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot change your own role' });

      const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
      if (!membership || membership.role !== 'owner') throw new TRPCError({ code: 'UNAUTHORIZED' });

      if (input.role === 'owner') {
        // Wrap in transaction to prevent two-owner state on crash
        await db.transaction(async (tx) => {
          await tx.update(projectMembers).set({ role: 'owner' }).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId)));
          await tx.update(projectMembers).set({ role: 'admin' }).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id)));
        });
      } else {
        await db.update(projectMembers).set({ role: input.role }).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId)));
      }
      
      return { success: true };
    }),
});

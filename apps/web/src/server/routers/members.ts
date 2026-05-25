import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db, projectMembers, users } from '@ai-gatekeeper/db';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const membersRouter = router({
  list: protectedProcedure.input(z.object({ projectId: z.string() })).query(async ({ input, ctx }) => {
    const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
    if (!membership) throw new TRPCError({ code: 'UNAUTHORIZED' });

    const rows = await db.select({
      userId: users.id,
      name: users.displayName,
      role: projectMembers.role,
      tags: projectMembers.tags,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, input.projectId));
    
    return rows.map(r => ({ ...r, usage: 0 }));
  }),
  add: protectedProcedure
    .input(z.object({ projectId: z.string(), email: z.string().email(), tags: z.array(z.string()).optional() }))
    .mutation(async ({ input, ctx }) => {
      const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
      if (!membership || membership.role !== 'owner') throw new TRPCError({ code: 'UNAUTHORIZED' });

      const [userToAdd] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (!userToAdd) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      await db.insert(projectMembers).values({
        projectId: input.projectId,
        userId: userToAdd.id,
        role: 'member',
        tags: input.tags || [],
      });
      return { success: true };
    }),
  remove: protectedProcedure
    .input(z.object({ projectId: z.string(), userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
      if (!membership || membership.role !== 'owner') throw new TRPCError({ code: 'UNAUTHORIZED' });

      await db.delete(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId)));
      return { success: true };
    }),
  updateTags: protectedProcedure
    .input(z.object({ projectId: z.string(), userId: z.string(), tags: z.array(z.string()) }))
    .mutation(async ({ input, ctx }) => {
      const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
      if (!membership || membership.role !== 'owner') throw new TRPCError({ code: 'UNAUTHORIZED' });

      await db.update(projectMembers).set({ tags: input.tags }).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId)));
      return { success: true };
    }),
});

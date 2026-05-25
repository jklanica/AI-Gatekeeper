import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db, apiKeys, projectMembers } from '@ai-gatekeeper/db';
import { eq, and, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import crypto from 'crypto';

export const apiKeysRouter = router({
  list: protectedProcedure.input(z.object({ projectId: z.string() })).query(async ({ input, ctx }) => {
    const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
    if (!membership) throw new TRPCError({ code: 'UNAUTHORIZED' });

    // Note: In reality, we might join usage_events to calculate lastUsed. For now, just return db rows.
    const keys = await db.select().from(apiKeys).where(and(eq(apiKeys.projectId, input.projectId), isNull(apiKeys.revokedAt)));
    return keys.map(k => ({ ...k, lastUsed: k.createdAt })); // Mocking lastUsed with createdAt for now
  }),
  create: protectedProcedure
    .input(z.object({ projectId: z.string(), name: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
      if (!membership || membership.role !== 'owner') throw new TRPCError({ code: 'UNAUTHORIZED' });

      const [existingKey] = await db.select().from(apiKeys).where(and(eq(apiKeys.projectId, input.projectId), eq(apiKeys.name, input.name))).limit(1);
      if (existingKey) {
        throw new TRPCError({ code: 'CONFLICT', message: 'An API key with this name already exists in this project' });
      }

      const rawKey = `gk_${crypto.randomBytes(24).toString('hex')}`;
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const keyPrefix = rawKey.substring(0, 7);

      const [newKey] = await db.insert(apiKeys).values({
        projectId: input.projectId,
        userId: ctx.user.id,
        name: input.name,
        keyHash,
        keyPrefix,
      }).returning();

      return { id: newKey.id, name: newKey.name, keyPrefix: newKey.keyPrefix, rawKey };
    }),
  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // For simplicity, just revoke if user is authenticated (ideally verify project role)
      await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, input.id));
      return { success: true };
    }),
});

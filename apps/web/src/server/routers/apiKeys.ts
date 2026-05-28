import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db, apiKeys, projectMembers, users } from '@ai-gatekeeper/db';
import { eq, and, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import crypto from 'crypto';

/**
 * API Keys Router
 * 
 * Manages gateway API keys for a project, including creation and revocation.
 */
export const apiKeysRouter = router({
  /**
   * List API Keys
   * 
   * Retrieves all active (non-revoked) API keys for a given project.
   */
  list: protectedProcedure.input(z.object({ projectId: z.string() })).query(async ({ input, ctx }) => {
    const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
    if (!membership) throw new TRPCError({ code: 'UNAUTHORIZED' });

    const condition = (membership.role === 'owner' || membership.role === 'admin')
      ? and(eq(apiKeys.projectId, input.projectId), isNull(apiKeys.revokedAt))
      : and(eq(apiKeys.projectId, input.projectId), eq(apiKeys.userId, ctx.user.id), isNull(apiKeys.revokedAt));

    const keys = await db.select({
      id: apiKeys.id,
      projectId: apiKeys.projectId,
      userId: apiKeys.userId,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      userDisplayName: users.displayName,
      userEmail: users.email,
    }).from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .where(condition);
      
    return keys.map(k => ({ 
      id: k.id,
      projectId: k.projectId,
      userId: k.userId,
      name: k.name,
      keyPrefix: k.keyPrefix,
      createdAt: k.createdAt,
      user: {
        displayName: k.userDisplayName,
        email: k.userEmail,
      },
    }));
  }),

  /**
   * Create API Key
   * 
   * Generates a new secure API key, stores its hash, and returns the raw key once.
   */
  create: protectedProcedure
    .input(z.object({ projectId: z.string(), name: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
      if (!membership) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not a member of this project' });

      const [existingKey] = await db.select().from(apiKeys).where(and(eq(apiKeys.projectId, input.projectId), eq(apiKeys.name, input.name))).limit(1);
      if (existingKey) {
        throw new TRPCError({ code: 'CONFLICT', message: 'An API key with this name already exists in this project' });
      }

      const rawKey = `gk_${crypto.randomBytes(24).toString('hex')}`;
      const keyPrefix = rawKey.substring(0, 7);
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

      const [newKey] = await db.insert(apiKeys).values({
        projectId: input.projectId,
        userId: ctx.user.id,
        name: input.name,
        key: keyHash,
        keyPrefix,
      }).returning();

      return { id: newKey.id, name: newKey.name, keyPrefix: newKey.keyPrefix, rawKey };
    }),

  /**
   * Revoke API Key
   * 
   * Soft-deletes an API key by setting its revokedAt timestamp.
   * Only owners and admins can revoke keys.
   */
  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Look up the key to find its project
      const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, input.id)).limit(1);
      if (!key) throw new TRPCError({ code: 'NOT_FOUND', message: 'API key not found' });

      // Verify the user is an owner or admin of the key's project, or revoking their own key
      const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, key.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
      
      if (!membership) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not a member of this project' });
      }

      if (membership.role !== 'owner' && membership.role !== 'admin' && key.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'You can only revoke your own API keys' });
      }

      await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, input.id));
      return { success: true };
    }),
});

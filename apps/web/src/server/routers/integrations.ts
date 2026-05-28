import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db, apiKeys, projectMembers } from '@ai-gatekeeper/db';
import { eq, and, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

/**
 * Integrations Router
 * 
 * Provides integration instructions and configuration snippets for various
 * third-party tools (VSCode, Cursor, Shell, etc.) to connect to the proxy.
 */
export const integrationsRouter = router({
  /**
   * Get Integration Configuration
   * 
   * Generates a code snippet or configuration block for a specific tool.
   * Dynamically injects the user's API key and the proxy base URL.
   */
  getConfig: protectedProcedure
    .input(z.object({ 
      tool: z.enum(['continue']),
      projectId: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      // Verify membership
      const [membership] = await db.select().from(projectMembers)
        .where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id)))
        .limit(1);
      if (!membership) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not a member of this project' });

      const baseUrl = process.env.PROXY_BASE_URL || 'http://localhost:3001/v1';
      
      return { baseUrl };
    }),
});

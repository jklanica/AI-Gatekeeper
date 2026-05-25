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
      tool: z.enum(['vscode', 'cursor', 'shell', 'python', 'node']),
      projectId: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      // Verify membership
      const [membership] = await db.select().from(projectMembers)
        .where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id)))
        .limit(1);
      if (!membership) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not a member of this project' });

      // Find the user's first active key for this project, or fall back to a placeholder
      const [userKey] = await db.select({ keyPrefix: apiKeys.keyPrefix })
        .from(apiKeys)
        .where(and(
          eq(apiKeys.projectId, input.projectId), 
          eq(apiKeys.userId, ctx.user.id),
          isNull(apiKeys.revokedAt)
        ))
        .limit(1);

      const baseUrl = process.env.PROXY_BASE_URL || 'https://prism.yourcompany.com/proxy/v1';
      const keyDisplay = '<YOUR_VIRTUAL_API_KEY>';
      
      switch (input.tool) {
        case 'vscode':
          return `// .continue/config.json\n{\n  "models": [{\n    "title": "GPT-4o (AI-Gatekeeper)",\n    "provider": "openai",\n    "model": "gpt-4o",\n    "apiBase": "${baseUrl}",\n    "apiKey": "${keyDisplay}"\n  }]\n}`;
        case 'cursor':
          return `Go to Settings → Models → Override OpenAI base URL:\n- Base URL: ${baseUrl}\n- API Key: ${keyDisplay}`;
        case 'shell':
          return `export OPENAI_API_KEY="${keyDisplay}"\nexport OPENAI_BASE_URL="${baseUrl}"`;
        case 'python':
          return `import openai\nclient = openai.OpenAI(\n    api_key="${keyDisplay}",\n    base_url="${baseUrl}"\n)`;
        case 'node':
          return `import OpenAI from 'openai';\nconst openai = new OpenAI({\n  apiKey: "${keyDisplay}",\n  baseURL: "${baseUrl}"\n});`;
        default:
          return 'Unsupported tool';
      }
    }),
});

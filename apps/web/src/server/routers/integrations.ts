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

      const baseUrl = process.env.PROXY_BASE_URL || 'http://localhost:3001/v1';
      const keyDisplay = '<YOUR_VIRTUAL_API_KEY>';
      
      switch (input.tool) {
        case 'vscode':
          // Continue extension supports OpenAI-compatible providers
          // Our proxy is a standard OpenAI endpoint, so use provider: "openai"
          return `// .continue/config.json\n{\n  "models": [\n    {\n      "title": "GPT-4o (AI-Gatekeeper)",\n      "provider": "openai",\n      "model": "gpt-4o",\n      "apiBase": "${baseUrl}",\n      "apiKey": "${keyDisplay}"\n    },\n    {\n      "title": "Gemini 2.5 Flash Lite (AI-Gatekeeper)",\n      "provider": "openai",\n      "model": "gemini-2.5-flash-lite",\n      "apiBase": "${baseUrl}",\n      "apiKey": "${keyDisplay}"\n    }\n  ]\n}`;
        case 'cursor':
          return `Go to Settings → Models → Override OpenAI base URL:\n- Base URL: ${baseUrl}\n- API Key: ${keyDisplay}\n\nSupported models: gpt-4o, gpt-4o-mini, gemini-1.5-pro, gemini-2.5-flash-lite`;
        case 'shell':
          return `export OPENAI_API_KEY="${keyDisplay}"\nexport OPENAI_BASE_URL="${baseUrl}"`;
        case 'python':
          return `import openai\n\nclient = openai.OpenAI(\n    api_key="${keyDisplay}",\n    base_url="${baseUrl}"\n)\n\n# Works with any supported model\nresponse = client.chat.completions.create(\n    model="gpt-4o-mini",  # or "gemini-2.5-flash-lite"\n    messages=[{"role": "user", "content": "Hello!"}]\n)`;
        case 'node':
          return `import OpenAI from 'openai';\n\nconst client = new OpenAI({\n  apiKey: "${keyDisplay}",\n  baseURL: "${baseUrl}"\n});\n\n// Works with any supported model\nconst response = await client.chat.completions.create({\n  model: "gpt-4o-mini",  // or "gemini-2.5-flash-lite"\n  messages: [{ role: "user", content: "Hello!" }]\n});`;
        default:
          return 'Unsupported tool';
      }
    }),
});

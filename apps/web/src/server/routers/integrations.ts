import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const integrationsRouter = router({
  getConfig: publicProcedure
    .input(z.object({ tool: z.enum(['vscode', 'cursor', 'shell', 'python', 'node']) }))
    .query(async ({ input }) => {
      const baseUrl = process.env.PROXY_BASE_URL || 'https://prism.yourcompany.com/proxy/v1';
      const mockKey = 'gk_abc12345';
      
      switch (input.tool) {
        case 'vscode':
          return `// .continue/config.json\n{\n  "models": [{\n    "title": "GPT-4o (AI-Gatekeeper)",\n    "provider": "openai",\n    "model": "gpt-4o",\n    "apiBase": "${baseUrl}",\n    "apiKey": "${mockKey}"\n  }]\n}`;
        case 'cursor':
          return `Go to Settings → Models → Override OpenAI base URL:\n- Base URL: ${baseUrl}\n- API Key: ${mockKey}`;
        case 'shell':
          return `export OPENAI_API_KEY="${mockKey}"\nexport OPENAI_BASE_URL="${baseUrl}"`;
        case 'python':
          return `import openai\nclient = openai.OpenAI(\n    api_key="${mockKey}",\n    base_url="${baseUrl}"\n)`;
        case 'node':
          return `import OpenAI from 'openai';\nconst openai = new OpenAI({\n  apiKey: "${mockKey}",\n  baseURL: "${baseUrl}"\n});`;
        default:
          return 'Unsupported tool';
      }
    }),
});

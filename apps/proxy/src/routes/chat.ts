import { Router, Request, Response } from 'express';
import { db, usageEvents } from '@ai-gatekeeper/db';
import { estimateCost } from '@ai-gatekeeper/types';
import { resolveProvider } from '../providers/index';

export const chatRouter = Router();

chatRouter.post('/', async (req: Request, res: Response) => {
  const gatekeeper = req.gatekeeper;
  if (!gatekeeper) {
    return res.status(401).json({ error: { message: 'Authentication required' } });
  }

  const body = req.body;
  if (!body || !body.model) {
    return res.status(400).json({ error: { message: 'Missing required field: model' } });
  }

  const model: string = body.model;
  const isStreaming: boolean = body.stream === true;

  const provider = resolveProvider(model);
  if (!provider) {
    return res.status(400).json({
      error: {
        message: `Unsupported model: "${model}". Supported prefixes: gpt-*, o1*, o3*, o4*, chatgpt-*, claude-*, gemini-*`,
        type: 'invalid_request_error',
      },
    });
  }

  let keyField: 'openai' | 'anthropic' | 'google';
  if (provider.name === 'google') keyField = 'google';
  else if (provider.name === 'anthropic') keyField = 'anthropic';
  else keyField = 'openai';

  const upstreamKey = gatekeeper.upstreamKeys[keyField];
  if (!upstreamKey) {
    return res.status(400).json({
      error: {
        message: `No ${provider.name} API key configured for this project. Add one in Project Settings.`,
        type: 'invalid_request_error',
      },
    });
  }

  console.log(`[proxy] ${provider.name} → ${model} (stream=${isStreaming})`);

  try {
    if (!isStreaming) {
      const response = await provider.invoke(upstreamKey, body);
      res.setHeader('Content-Type', 'application/json');
      res.json(response);

      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      logUsage(gatekeeper, provider.name, model, inputTokens, outputTokens);
    } else {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      let inputTokens = 0;
      let outputTokens = 0;

      // Track client disconnect to stop writing, but let the upstream
      // stream drain naturally — the Google SDK crashes if we break
      // out of its async iterator mid-stream.
      let clientDisconnected = false;
      res.on('close', () => { clientDisconnected = true; });

      const stream = provider.stream(upstreamKey, body);
      for await (const chunk of stream) {
        if (clientDisconnected) continue;

        res.write(`data: ${JSON.stringify(chunk)}\n\n`);

        if (chunk.usage) {
          inputTokens = Math.max(inputTokens, chunk.usage.prompt_tokens || 0);
          outputTokens = Math.max(outputTokens, chunk.usage.completion_tokens || 0);
        }
      }

      if (!clientDisconnected) {
        res.write(`data: [DONE]\n\n`);
        res.end();
      }

      logUsage(gatekeeper, provider.name, model, inputTokens, outputTokens);
    }
  } catch (err: any) {
    console.error(`[proxy] Error calling provider ${provider.name}:`, err);
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        error: { message: err.message || `Failed to connect to ${provider.name} upstream`, type: 'upstream_error' },
      });
    } else {
      res.end();
    }
  }
});

function logUsage(
  gatekeeper: NonNullable<Request['gatekeeper']>,
  providerName: string,
  model: string,
  inputTokens: number,
  outputTokens: number
) {
  if (inputTokens + outputTokens === 0) return;
  
  (async () => {
    try {
      const costUsd = estimateCost(model, inputTokens, outputTokens);
      await db.insert(usageEvents).values({
        projectId: gatekeeper.projectId,
        userId: gatekeeper.userId,
        apiKeyId: gatekeeper.apiKeyId,
        model,
        provider: providerName,
        inputTokens,
        outputTokens,
        costUsd: costUsd.toString(),
        httpStatus: 200,
        userTags: [],
      });
    } catch (err) {
      console.error(`[proxy] Failed to log usage event for ${providerName}:`, err);
    }
  })();
}

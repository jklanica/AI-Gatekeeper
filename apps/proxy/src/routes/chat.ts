import { Router, Request, Response } from 'express';
import { db, usageEvents } from '@ai-gatekeeper/db';
import { estimateCost } from '@ai-gatekeeper/types';

export const chatRouter = Router();

/**
 * Provider Configuration
 *
 * Maps model name prefixes to their upstream endpoint
 * and the corresponding key field from `req.gatekeeper.upstreamKeys`.
 */
interface ProviderConfig {
  name: string;
  url: string;
  keyField: 'openai' | 'anthropic' | 'google';
}

function resolveProvider(model: string): ProviderConfig | null {
  if (model.startsWith('gemini-')) {
    return {
      name: 'google',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      keyField: 'google',
    };
  }
  if (model.startsWith('claude-')) {
    return {
      name: 'anthropic',
      url: 'https://api.anthropic.com/v1/messages',
      keyField: 'anthropic',
    };
  }
  if (
    model.startsWith('gpt-') ||
    model.startsWith('o1') ||
    model.startsWith('o3') ||
    model.startsWith('o4') ||
    model.startsWith('chatgpt-')
  ) {
    return {
      name: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
      keyField: 'openai',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Anthropic format translation helpers
// ---------------------------------------------------------------------------

/**
 * Build the correct headers for each upstream provider.
 * Anthropic uses `x-api-key` + `anthropic-version`, others use `Authorization: Bearer`.
 */
function buildUpstreamHeaders(provider: ProviderConfig, upstreamKey: string): Record<string, string> {
  if (provider.name === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': upstreamKey,
      'anthropic-version': '2023-06-01',
    };
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${upstreamKey}`,
  };
}

/**
 * Translate an OpenAI-format request body into an Anthropic Messages API body.
 *
 * Key differences:
 *  - Anthropic puts the system prompt in a top-level `system` field, not as a message.
 *  - Anthropic requires `max_tokens` (defaults to 4096 if not provided).
 *  - Anthropic uses `messages` with roles `user` and `assistant` only.
 */
function translateToAnthropicRequest(openaiBody: Record<string, unknown>): Record<string, unknown> {
  const messages = (openaiBody.messages as Array<{ role: string; content: string }>) || [];

  // Extract system messages
  const systemMessages = messages.filter(m => m.role === 'system');
  const nonSystemMessages = messages.filter(m => m.role !== 'system');

  const anthropicBody: Record<string, unknown> = {
    model: openaiBody.model,
    messages: nonSystemMessages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    max_tokens: (openaiBody.max_tokens as number) || (openaiBody.max_completion_tokens as number) || 4096,
  };

  if (systemMessages.length > 0) {
    anthropicBody.system = systemMessages.map(m => m.content).join('\n\n');
  }

  if (openaiBody.temperature !== undefined) anthropicBody.temperature = openaiBody.temperature;
  if (openaiBody.top_p !== undefined) anthropicBody.top_p = openaiBody.top_p;
  if (openaiBody.stream === true) anthropicBody.stream = true;
  if (openaiBody.stop) anthropicBody.stop_sequences = Array.isArray(openaiBody.stop) ? openaiBody.stop : [openaiBody.stop];

  return anthropicBody;
}

/**
 * Translate an Anthropic Messages API response into an OpenAI-compatible response.
 * Only used for non-streaming responses; streaming is forwarded as-is.
 */
function translateAnthropicResponseToOpenAI(anthropicJson: Record<string, unknown>): Record<string, unknown> {
  const content = (anthropicJson.content as Array<{ type: string; text?: string }>) || [];
  const textContent = content
    .filter(c => c.type === 'text')
    .map(c => c.text || '')
    .join('');

  const usage = anthropicJson.usage as { input_tokens?: number; output_tokens?: number } | undefined;

  return {
    id: anthropicJson.id || `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: anthropicJson.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: textContent,
        },
        finish_reason: mapAnthropicStopReason(anthropicJson.stop_reason as string),
      },
    ],
    usage: {
      prompt_tokens: usage?.input_tokens || 0,
      completion_tokens: usage?.output_tokens || 0,
      total_tokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
    },
  };
}

/** Map Anthropic stop_reason to OpenAI finish_reason. */
function mapAnthropicStopReason(reason: string | undefined): string {
  switch (reason) {
    case 'end_turn': return 'stop';
    case 'max_tokens': return 'length';
    case 'stop_sequence': return 'stop';
    default: return 'stop';
  }
}

// ---------------------------------------------------------------------------
// Usage parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse usage from a complete (non-streaming) JSON response.
 * Handles OpenAI, Gemini, and Anthropic response formats.
 */
function parseUsageFromJson(body: string): { model: string; inputTokens: number; outputTokens: number } {
  let model = 'unknown';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const json = JSON.parse(body);
    if (json.model) model = json.model;

    // OpenAI standard format
    if (json.usage) {
      inputTokens = json.usage.prompt_tokens || json.usage.input_tokens || 0;
      outputTokens = json.usage.completion_tokens || json.usage.output_tokens || 0;
    }
    // Gemini native format fallback
    if (json.usageMetadata) {
      inputTokens = inputTokens || json.usageMetadata.promptTokenCount || 0;
      outputTokens = outputTokens || json.usageMetadata.candidatesTokenCount || 0;
    }
  } catch {}

  return { model, inputTokens, outputTokens };
}

/**
 * Parse usage from SSE streaming chunks.
 * Accumulates the maximum token counts seen across all chunks.
 * Handles OpenAI, Gemini, and Anthropic streaming event formats.
 */
function parseUsageFromStream(body: string): { model: string; inputTokens: number; outputTokens: number } {
  let model = 'unknown';
  let inputTokens = 0;
  let outputTokens = 0;

  const matches = body.matchAll(/data:\s*({.*})\s*\n/g);
  for (const match of matches) {
    try {
      const data = JSON.parse(match[1]);
      if (data.model && model === 'unknown') model = data.model;

      // OpenAI format usage (typically in the last chunk)
      if (data.usage) {
        if (data.usage.prompt_tokens !== undefined) inputTokens = Math.max(inputTokens, data.usage.prompt_tokens);
        if (data.usage.completion_tokens !== undefined) outputTokens = Math.max(outputTokens, data.usage.completion_tokens);
        // Anthropic format (input_tokens / output_tokens)
        if (data.usage.input_tokens !== undefined) inputTokens = Math.max(inputTokens, data.usage.input_tokens);
        if (data.usage.output_tokens !== undefined) outputTokens = Math.max(outputTokens, data.usage.output_tokens);
      }
      // Gemini native format fallback
      if (data.usageMetadata) {
        if (data.usageMetadata.promptTokenCount !== undefined) inputTokens = Math.max(inputTokens, data.usageMetadata.promptTokenCount);
        if (data.usageMetadata.candidatesTokenCount !== undefined) outputTokens = Math.max(outputTokens, data.usageMetadata.candidatesTokenCount);
      }
    } catch {}
  }

  return { model, inputTokens, outputTokens };
}

// ---------------------------------------------------------------------------
// Main route handler
// ---------------------------------------------------------------------------

/**
 * POST /v1/chat/completions
 *
 * Universal OpenAI-compatible proxy handler.
 * Reads the request body, resolves the provider from the model name,
 * translates the request format if needed (e.g. for Anthropic),
 * forwards to the upstream, streams the response back, and logs usage.
 */
chatRouter.post('/', async (req: Request, res: Response) => {
  const gatekeeper = req.gatekeeper;
  if (!gatekeeper) {
    return res.status(401).json({ error: { message: 'Authentication required' } });
  }

  // 1. Parse the request body
  const body = req.body;
  if (!body || !body.model) {
    return res.status(400).json({ error: { message: 'Missing required field: model' } });
  }

  const model: string = body.model;
  const isStreaming: boolean = body.stream === true;

  // 2. Resolve the upstream provider
  const provider = resolveProvider(model);
  if (!provider) {
    return res.status(400).json({
      error: {
        message: `Unsupported model: "${model}". Supported prefixes: gpt-*, o1*, o3*, o4*, chatgpt-*, claude-*, gemini-*`,
        type: 'invalid_request_error',
      },
    });
  }

  // 3. Get the upstream API key
  const upstreamKey = gatekeeper.upstreamKeys[provider.keyField];
  if (!upstreamKey) {
    return res.status(400).json({
      error: {
        message: `No ${provider.name} API key configured for this project. Add one in Project Settings.`,
        type: 'invalid_request_error',
      },
    });
  }

  // 4. Build the upstream request (translate if Anthropic)
  const upstreamBody = provider.name === 'anthropic'
    ? translateToAnthropicRequest(body)
    : body;

  const upstreamHeaders = buildUpstreamHeaders(provider, upstreamKey);

  console.log(`[proxy] ${provider.name} → ${model} (stream=${isStreaming})`);

  let upstreamResponse: globalThis.Response;
  try {
    upstreamResponse = await fetch(provider.url, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(upstreamBody),
    });
  } catch (err) {
    console.error(`[proxy] Upstream fetch failed for ${provider.name}:`, err);
    return res.status(502).json({
      error: { message: `Failed to connect to ${provider.name} upstream`, type: 'upstream_error' },
    });
  }

  // 5. Set response headers from upstream
  res.status(upstreamResponse.status);

  const contentType = upstreamResponse.headers.get('content-type');

  // Forward rate-limit headers if present
  for (const header of ['x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-tokens']) {
    const val = upstreamResponse.headers.get(header);
    if (val) res.setHeader(header, val);
  }

  // 6. Handle response — translate Anthropic non-streaming responses to OpenAI format
  const isEventStream = contentType?.includes('text/event-stream');

  if (!upstreamResponse.body) {
    const text = await upstreamResponse.text();

    // Translate non-streaming Anthropic responses to OpenAI format
    if (provider.name === 'anthropic' && !isEventStream && upstreamResponse.ok) {
      try {
        const anthropicJson = JSON.parse(text);
        const openaiResponse = translateAnthropicResponseToOpenAI(anthropicJson);
        const translatedText = JSON.stringify(openaiResponse);
        res.setHeader('Content-Type', 'application/json');
        res.send(translatedText);
        logUsage(gatekeeper, provider.name, model, translatedText, false, upstreamResponse.status);
        return;
      } catch {
        // If translation fails, forward raw response
      }
    }

    if (contentType) res.setHeader('Content-Type', contentType);
    res.send(text);
    logUsage(gatekeeper, provider.name, model, text, false, upstreamResponse.status);
    return;
  }

  // Stream the response using Node.js readable stream
  let accumulated = '';
  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();

  // For non-streaming Anthropic responses that have a body, accumulate and translate
  if (provider.name === 'anthropic' && !isStreaming && !isEventStream) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
      }
    } catch (err) {
      console.error(`[proxy] Error reading response from ${provider.name}:`, err);
    }

    if (upstreamResponse.ok) {
      try {
        const anthropicJson = JSON.parse(accumulated);
        const openaiResponse = translateAnthropicResponseToOpenAI(anthropicJson);
        const translatedText = JSON.stringify(openaiResponse);
        res.setHeader('Content-Type', 'application/json');
        res.send(translatedText);
        logUsage(gatekeeper, provider.name, model, translatedText, false, upstreamResponse.status);
        return;
      } catch {
        // If translation fails, forward raw response
      }
    }

    if (contentType) res.setHeader('Content-Type', contentType);
    res.send(accumulated);
    logUsage(gatekeeper, provider.name, model, accumulated, false, upstreamResponse.status);
    return;
  }

  // Standard streaming path (OpenAI, Google, and Anthropic streaming)
  if (contentType) res.setHeader('Content-Type', contentType);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      accumulated += chunk;

      // Write each chunk to the client immediately for streaming
      res.write(chunk);
    }
  } catch (err) {
    console.error(`[proxy] Error streaming response from ${provider.name}:`, err);
  } finally {
    res.end();
  }

  // 7. Log usage asynchronously (fire-and-forget with error handling)
  logUsage(gatekeeper, provider.name, model, accumulated, !!isEventStream, upstreamResponse.status);
});

/**
 * Asynchronously parse usage from the accumulated response and insert into the DB.
 * Errors are caught and logged without affecting the client response.
 */
function logUsage(
  gatekeeper: NonNullable<Request['gatekeeper']>,
  providerName: string,
  requestModel: string,
  responseBody: string,
  isEventStream: boolean,
  httpStatus: number | undefined,
) {
  (async () => {
    const { model, inputTokens, outputTokens } = isEventStream
      ? parseUsageFromStream(responseBody)
      : parseUsageFromJson(responseBody);

    // Prefer model from response, fall back to request model
    const resolvedModel = model !== 'unknown' ? model : requestModel;

    if (inputTokens + outputTokens > 0) {
      const costUsd = estimateCost(resolvedModel, inputTokens, outputTokens);
      await db.insert(usageEvents).values({
        projectId: gatekeeper.projectId,
        userId: gatekeeper.userId,
        apiKeyId: gatekeeper.apiKeyId,
        model: resolvedModel,
        provider: providerName,
        inputTokens,
        outputTokens,
        costUsd: costUsd.toString(),
        httpStatus: httpStatus,
        userTags: [],
      });
    }
  })().catch(err => {
    console.error(`[proxy] Failed to log usage event for ${providerName}:`, err);
  });
}

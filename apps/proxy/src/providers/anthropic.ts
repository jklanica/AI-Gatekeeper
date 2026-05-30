import Anthropic from '@anthropic-ai/sdk';
import { ChatProvider, ChatCompletionChunk } from './base';
import { PROVIDER_MODELS } from '@ai-gatekeeper/types';

export function createAnthropicProvider(): ChatProvider {
  function pre(req: any) {
    const messages = req.messages || [];
    const systemMessages = messages.filter((m: any) => m.role === 'system');
    const nonSystemMessages = messages.filter((m: any) => m.role !== 'system');

    const params: Anthropic.MessageCreateParams = {
      model: req.model,
      messages: nonSystemMessages.map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      max_tokens: req.max_completion_tokens || req.max_tokens || 4096,
    };

    if (systemMessages.length > 0) {
      params.system = systemMessages.map((m: any) => m.content).join('\n\n');
    }

    if (req.temperature !== undefined) params.temperature = req.temperature;
    if (req.top_p !== undefined) params.top_p = req.top_p;
    if (req.stop) params.stop_sequences = Array.isArray(req.stop) ? req.stop : [req.stop];

    return params;
  }

  function mapStopReason(reason: string | null | undefined): string {
    switch (reason) {
      case 'end_turn': return 'stop';
      case 'max_tokens': return 'length';
      case 'stop_sequence': return 'stop';
      default: return 'stop';
    }
  }

  return {
    name: 'anthropic',
    supportModels: PROVIDER_MODELS.anthropic,
    async invoke(apiKey, req) {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        ...pre(req),
        stream: false,
      });

      const textContent = response.content
        .filter((c) => c.type === 'text')
        .map((c: any) => c.text)
        .join('');

      return {
        id: response.id,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: response.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: textContent,
            },
            finish_reason: mapStopReason(response.stop_reason),
          },
        ],
        usage: {
          prompt_tokens: response.usage.input_tokens || 0,
          completion_tokens: response.usage.output_tokens || 0,
          total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        },
      };
    },
    async *stream(apiKey, req, signal) {
      const client = new Anthropic({ apiKey });
      const stream = await client.messages.create({
        ...pre(req),
        stream: true,
      });

      const id = 'chatcmpl-' + crypto.randomUUID();
      const created = Math.floor(Date.now() / 1000);
      let inputTokens = 0;

      for await (const it of stream) {
        if (signal?.aborted) {
          throw new Error('Aborted');
        }

        if (it.type === 'message_start') {
          inputTokens = it.message.usage.input_tokens;
          // Return empty initial chunk to mimic OpenAI
          yield {
            id,
            object: 'chat.completion.chunk',
            created,
            model: req.model,
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', content: '' },
                finish_reason: null,
              },
            ],
          } as ChatCompletionChunk;
        } else if (it.type === 'content_block_delta' && it.delta.type === 'text_delta') {
          yield {
            id,
            object: 'chat.completion.chunk',
            created,
            model: req.model,
            choices: [
              {
                index: 0,
                delta: { content: it.delta.text },
                finish_reason: null,
              },
            ],
          } as ChatCompletionChunk;
        } else if (it.type === 'message_delta') {
          yield {
            id,
            object: 'chat.completion.chunk',
            created,
            model: req.model,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: mapStopReason(it.delta.stop_reason),
              },
            ],
            usage: {
              prompt_tokens: inputTokens,
              completion_tokens: it.usage.output_tokens,
              total_tokens: inputTokens + it.usage.output_tokens,
            },
          } as ChatCompletionChunk;
        }
      }
    },
  };
}

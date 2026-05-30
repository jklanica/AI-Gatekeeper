import OpenAI from 'openai';
import { ChatProvider, ChatCompletionChunk } from './base';
import { PROVIDER_MODELS } from '@ai-gatekeeper/types';

export function createOpenAIProvider(): ChatProvider {
  return {
    name: 'openai',
    supportModels: PROVIDER_MODELS.openai,
    async invoke(apiKey, req) {
      const client = new OpenAI({ apiKey });
      return client.chat.completions.create({
        ...req,
        stream: false,
      });
    },
    async *stream(apiKey, req, signal) {
      const client = new OpenAI({ apiKey });
      const stream = await client.chat.completions.create({
        ...req,
        stream: true,
      }) as unknown as AsyncIterable<any>;
      
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new Error('Aborted');
        }
        yield chunk as unknown as ChatCompletionChunk;
      }
    },
  };
}

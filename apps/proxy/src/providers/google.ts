import { ChatProvider, ChatCompletionChunk } from './base';
import { GoogleGenerativeAI, Tool, FunctionDeclarationsTool, Content, TextPart, FileDataPart, EnhancedGenerateContentResponse } from '@google/generative-ai';
import { PROVIDER_MODELS } from '@ai-gatekeeper/types';

export function createGoogleProvider(): ChatProvider {
  function createClient(apiKey: string, req: any) {
    const genAI = new GoogleGenerativeAI(apiKey);
    if (req.response_format && req.response_format.type !== 'json_schema') {
      throw new Error('Unsupported response format, only json_schema is supported');
    }
    const model = genAI.getGenerativeModel({
      model: req.model,
      generationConfig: {
        temperature: req.temperature,
        maxOutputTokens: req.max_completion_tokens || req.max_tokens,
        responseSchema: req.response_format?.type === 'json_schema' ? req.response_format.json_schema : undefined,
        topP: req.top_p,
      },
    });
    return model;
  }

  function parseRequest(req: any) {
    const systemInstruction = () => {
      const system = req.messages.find((m: any) => m.role === 'system')?.content;
      if (!system) return undefined;
      return typeof system === 'string' ? system : system.map((s: any) => s.text).join('');
    };

    const tools = () => {
      if (!req.tools) return undefined;
      return [
        {
          functionDeclarations: req.tools.map((tool: any) => ({
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
          })) as Tool[],
        } as FunctionDeclarationsTool,
      ];
    };

    return {
      systemInstruction: systemInstruction(),
      contents: req.messages
        .filter((m: any) => m.role !== 'system')
        .map((m: any) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: typeof m.content === 'string'
            ? [{ text: m.content }]
            : m.content.map((c: any) => {
                if (c.type === 'text') return { text: c.text } satisfies TextPart;
                if (c.type === 'image_url') {
                  return {
                    fileData: {
                      fileUri: c.image_url.url,
                      mimeType: 'image/png',
                    },
                  } satisfies FileDataPart;
                }
                throw new Error('Unsupported content type: ' + c.type);
              }),
        })) as Content[],
      tools: tools(),
    };
  }

  function parseResponse(response: EnhancedGenerateContentResponse, req: any) {
    let index = 0;
    return {
      id: 'chatcmpl-' + crypto.randomUUID(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: req.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.text(),
            refusal: null,
            tool_calls: response.functionCalls()?.map((it) => ({
              id: String(index++),
              function: {
                arguments: JSON.stringify(it.args),
                name: it.name,
              },
              type: 'function',
            })),
          },
          logprobs: null,
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata?.totalTokenCount || 0,
      },
    };
  }

  return {
    name: 'google',
    supportModels: PROVIDER_MODELS.google,
    async invoke(apiKey, req) {
      const client = createClient(apiKey, req);
      const { response } = await client.generateContent(parseRequest(req));
      return parseResponse(response, req);
    },
    async *stream(apiKey, req, signal) {
      try {
        const client = createClient(apiKey, req);
        const stream = await client.generateContentStream(parseRequest(req));
        const id = 'chatcmpl-' + crypto.randomUUID();
        let last: EnhancedGenerateContentResponse | undefined;
      
      const fields = () => ({
        id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: req.model,
      });

      for await (const chunk of stream.stream) {
        if (signal?.aborted) throw new Error('Aborted');
        last = chunk;
        
        yield {
          ...fields(),
          choices: [
            {
              index: 0,
              delta: {
                content: chunk.text(),
                tool_calls: chunk.functionCalls()?.map((it, idx) => ({
                  id: String(idx),
                  function: {
                    arguments: JSON.stringify(it.args),
                    name: it.name,
                  },
                  type: 'function',
                })),
              },
              finish_reason: null,
            },
          ],
        } as ChatCompletionChunk;
      }

      if (!last) {
        yield {
          ...fields(),
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        } as ChatCompletionChunk;
        return;
      }

      if (req.stream_options?.include_usage) {
        yield {
          ...fields(),
          choices: [],
          usage: {
            prompt_tokens: last.usageMetadata?.promptTokenCount || 0,
            completion_tokens: last.usageMetadata?.candidatesTokenCount || 0,
            total_tokens: last.usageMetadata?.totalTokenCount || 0,
          },
        } as ChatCompletionChunk;
      } else {
        yield {
          ...fields(),
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        } as ChatCompletionChunk;
      }
      } catch (e) {
        console.error('GOOGLE STREAM ERROR', e);
        throw e;
      }
    },
  };
}

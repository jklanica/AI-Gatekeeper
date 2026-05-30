export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: any[];
    };
    finish_reason: string | null;
    logprobs?: any;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatProvider {
  name: string;
  supportModels: string[];
  invoke(apiKey: string, req: any): Promise<any>;
  stream(apiKey: string, req: any, signal?: AbortSignal): AsyncGenerator<ChatCompletionChunk, void, unknown>;
}

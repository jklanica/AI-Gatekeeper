import { ChatProvider } from './base';
import { createOpenAIProvider } from './openai';
import { createAnthropicProvider } from './anthropic';
import { createGoogleProvider } from './google';

// Create provider instances once at module level
const providers: ChatProvider[] = [
  createOpenAIProvider(),
  createAnthropicProvider(),
  createGoogleProvider(),
];

export const getProviders = (): ChatProvider[] => providers;

export function resolveProvider(model: string): ChatProvider | null {
  // Exact match first
  let provider = providers.find((p) => p.supportModels.includes(model));
  if (provider) return provider;

  // Prefix match fallback
  const google = providers.find((p) => p.name === 'google')!;
  const anthropic = providers.find((p) => p.name === 'anthropic')!;
  const openai = providers.find((p) => p.name === 'openai')!;

  if (model.startsWith('gemini-')) return google;
  if (model.startsWith('claude-')) return anthropic;
  if (
    model.startsWith('gpt-') ||
    model.startsWith('o1') ||
    model.startsWith('o3') ||
    model.startsWith('o4') ||
    model.startsWith('chatgpt-')
  ) {
    return openai;
  }

  return null;
}

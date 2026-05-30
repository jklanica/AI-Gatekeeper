import { MODEL_PRICING } from './pricing';

export const ALL_SUPPORTED_MODELS = Object.keys(MODEL_PRICING);

export const PROVIDER_MODELS: Record<'openai' | 'anthropic' | 'google', string[]> = {
  openai: ALL_SUPPORTED_MODELS.filter(m => m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4') || m.startsWith('chatgpt-')),
  anthropic: ALL_SUPPORTED_MODELS.filter(m => m.startsWith('claude-')),
  google: ALL_SUPPORTED_MODELS.filter(m => m.startsWith('gemini-')),
};

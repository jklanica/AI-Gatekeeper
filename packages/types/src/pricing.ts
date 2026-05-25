export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o':            { input: 2.50,  output: 10.00 }, // per million tokens
  'gpt-4o-mini':       { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':       { input: 10.00, output: 30.00 },
  'o1':                { input: 15.00, output: 60.00 },
  'o1-mini':           { input: 3.00,  output: 12.00 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.input
       + (outputTokens / 1_000_000) * pricing.output;
}

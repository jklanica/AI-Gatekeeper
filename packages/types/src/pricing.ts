/**
 * LLM Model Pricing Data
 * 
 * Defines cost per 1 million tokens (input/output) for supported models.
 * Used to calculate the estimated cost of usage events.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o':            { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':       { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':       { input: 10.00, output: 30.00 },
  'o1':                { input: 15.00, output: 60.00 },
  'o1-mini':           { input: 3.00,  output: 12.00 },
  
  // Anthropic
  'claude-3-5-sonnet-20240620': { input: 3.00,  output: 15.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00,  output: 15.00 },
  'claude-3-opus-20240229':     { input: 15.00, output: 75.00 },
  'claude-3-haiku-20240307':    { input: 0.25,  output: 1.25  },
  
  // Google Gemini
  'gemini-1.5-pro':             { input: 3.50,  output: 10.50 },
  'gemini-1.5-flash':           { input: 0.075, output: 0.30  },
  'gemini-1.5-flash-8b':        { input: 0.0375, output: 0.15  },
  'gemini-2.0-flash-lite':      { input: 0.075, output: 0.30  }, // Example pricing
  'gemini-2.5-flash-lite':      { input: 0.075, output: 0.30  }, // Example pricing
};

/**
 * Estimate Request Cost
 * 
 * Calculates the total cost in USD for a given request based on token counts.
 * 
 * @param {string} model - The identifier of the LLM model.
 * @param {number} inputTokens - Number of tokens in the prompt.
 * @param {number} outputTokens - Number of tokens in the response.
 * @returns {number} The estimated cost in USD. Returns 0 if the model is unknown.
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.input
       + (outputTokens / 1_000_000) * pricing.output;
}

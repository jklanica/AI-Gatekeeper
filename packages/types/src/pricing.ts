/**
 * LLM Model Pricing Data
 * 
 * Defines cost per 1 million tokens (input/output) for supported models.
 * Used to calculate the estimated cost of usage events.
 * 
 * Last updated: 2026-05-28
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {

  // ── OpenAI ──────────────────────────────────────────────────────────────────

  // GPT-4.1 family (recommended production tier, 1M context window)
  'gpt-4.1':            { input: 2.00,  output: 8.00  },
  'gpt-4.1-mini':       { input: 0.40,  output: 1.60  },
  'gpt-4.1-nano':       { input: 0.10,  output: 0.40  },

  // GPT-4o family (legacy multimodal; still available)
  'gpt-4o':             { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':        { input: 0.15,  output: 0.60  },

  // o-series reasoning models
  'o3':                 { input: 2.00,  output: 8.00  },
  'o4-mini':            { input: 1.10,  output: 4.40  },
  'o1':                 { input: 15.00, output: 60.00 },

  // ── Anthropic ───────────────────────────────────────────────────────────────

  // Current generation (Claude 4.x)
  'claude-opus-4-8':              { input: 5.00,  output: 25.00 },
  'claude-sonnet-4-6':            { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5-20251001':    { input: 1.00,  output: 5.00  },

  // Previous generation (Claude 4.6 — still usable, superseded by 4.8)
  'claude-opus-4-6':              { input: 5.00,  output: 25.00 },

  // Legacy Claude 3.x — still callable but not recommended for new projects
  'claude-3-5-sonnet-20241022':   { input: 3.00,  output: 15.00 },
  'claude-3-5-sonnet-20240620':   { input: 3.00,  output: 15.00 },
  'claude-3-haiku-20240307':      { input: 0.25,  output: 1.25  },

  // ── Google Gemini ───────────────────────────────────────────────────────────

  // Gemini 3.x (current generation)
  'gemini-3.5-flash':       { input: 1.50,  output: 9.00  },
  'gemini-3.1-flash-lite':  { input: 0.25,  output: 1.50  },

  // Gemini 2.5 (prior generation — still active, moving to legacy)
  'gemini-2.5-pro':         { input: 1.25,  output: 10.00 },
  'gemini-2.5-flash':       { input: 0.30,  output: 2.50  },
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

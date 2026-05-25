import { Router } from 'express';
import { MODEL_PRICING } from '@ai-gatekeeper/types';

export const modelsRouter = Router();

modelsRouter.get('/', (req, res) => {
  const fixedDate = Math.floor(Date.now() / 1000);
  
  res.json({
    object: 'list',
    data: Object.keys(MODEL_PRICING).map(id => {
      let owner = 'openai';
      if (id.startsWith('claude-')) owner = 'anthropic';
      if (id.startsWith('gemini-')) owner = 'google';

      return {
        id,
        object: 'model',
        created: fixedDate,
        owned_by: owner,
      };
    }),
  });
});

import { Router } from 'express';
import { ALL_SUPPORTED_MODELS, PROVIDER_MODELS } from '@ai-gatekeeper/types';

export const modelsRouter = Router();

modelsRouter.get('/', (req, res) => {
  const fixedDate = Math.floor(Date.now() / 1000);
  
  res.json({
    object: 'list',
    data: ALL_SUPPORTED_MODELS.map(id => {
      let owner = 'openai';
      if (PROVIDER_MODELS.anthropic.includes(id)) owner = 'anthropic';
      else if (PROVIDER_MODELS.google.includes(id)) owner = 'google';

      return {
        id,
        object: 'model',
        created: fixedDate,
        owned_by: owner,
      };
    }),
  });
});

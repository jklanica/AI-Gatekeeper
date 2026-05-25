import { router, publicProcedure } from '../trpc';
import { authRouter } from './auth';
import { projectsRouter } from './projects';
import { membersRouter } from './members';
import { apiKeysRouter } from './apiKeys';
import { analyticsRouter } from './analytics';
import { integrationsRouter } from './integrations';

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: 'ok' };
  }),
  auth: authRouter,
  projects: projectsRouter,
  members: membersRouter,
  apiKeys: apiKeysRouter,
  analytics: analyticsRouter,
  integrations: integrationsRouter,
});

export type AppRouter = typeof appRouter;

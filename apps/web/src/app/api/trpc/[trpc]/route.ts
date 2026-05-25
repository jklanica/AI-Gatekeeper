import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '../../../../server/routers/_app';

/**
 * Next.js Route Handler for tRPC
 * 
 * Adapts incoming Next.js fetch requests to the tRPC app router.
 * Handles all API calls made via the trpc client.
 */
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({}),
  });

export { handler as GET, handler as POST };

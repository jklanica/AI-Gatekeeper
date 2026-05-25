import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server/routers/_app';

/**
 * tRPC React Query Client
 * 
 * Provides strongly-typed React hooks (useQuery, useMutation) 
 * inferred from the backend AppRouter.
 */
export const trpc = createTRPCReact<AppRouter>();

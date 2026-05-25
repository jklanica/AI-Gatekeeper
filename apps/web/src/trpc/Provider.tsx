'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import React, { useState } from 'react';
import superjson from 'superjson';
import { trpc } from './client';

/**
 * TRPCProvider Component
 * 
 * Wraps the application to provide the tRPC and React Query contexts.
 * Initializes the HTTP batch link to communicate with the /api/trpc endpoint.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render inside the provider.
 * @returns {JSX.Element} The provider boundary.
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 1000 } }
  }));
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

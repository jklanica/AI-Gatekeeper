import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db, users } from '@ai-gatekeeper/db';
import { eq } from 'drizzle-orm';

const jwtSecretRaw = process.env.JWT_SECRET;
if (!jwtSecretRaw) {
  throw new Error('JWT_SECRET environment variable is required. Set it to a random 32+ character string.');
}
export const JWT_SECRET = new TextEncoder().encode(jwtSecretRaw);

/**
 * tRPC Server Initialization
 * 
 * Configures the tRPC instance with superjson for Date/Map/Set serialization
 * and formats Zod validation errors to be easily consumable by the frontend.
 */
export const t = initTRPC.create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/** Base router for building procedures */
export const router = t.router;

/** Public, unauthenticated procedure */
export const publicProcedure = t.procedure;

/**
 * Protected Procedure Middleware
 * 
 * Enforces authentication by verifying the JWT from the `auth_token` cookie.
 * Injects the authenticated user object into the procedure context.
 * Throws UNAUTHORIZED if the token is missing, invalid, or the user doesn't exist.
 */
export const protectedProcedure = t.procedure.use(async ({ next }) => {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No authentication token found' });
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.sub as string;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not found' });
    }

    return next({
      ctx: {
        user,
      },
    });
  } catch {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid authentication token' });
  }
});

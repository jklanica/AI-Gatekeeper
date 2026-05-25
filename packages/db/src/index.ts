import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgres://prism:prism@127.0.0.1:5433/prism';

const globalForDb = globalThis as unknown as { dbClient: ReturnType<typeof postgres> | undefined };

const client = globalForDb.dbClient ?? postgres(connectionString);
if (process.env.NODE_ENV !== 'production') {
  globalForDb.dbClient = client;
}

export const db = drizzle(client, { schema });

export * from './schema';

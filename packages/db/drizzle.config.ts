import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || 'postgres://ai-gatekeeper:ai-gatekeeper@127.0.0.1:5433/ai-gatekeeper',
  },
});

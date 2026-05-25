import { pgTable, uuid, text, timestamp, integer, numeric, smallint, primaryKey, index } from 'drizzle-orm/pg-core';
import { sql, desc } from 'drizzle-orm';

/**
 * Users Table
 * 
 * Stores all user accounts in the system.
 */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Projects Table
 * 
 * Represents an organization or workspace that can generate API keys.
 * Holds optional upstream provider credentials.
 */
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  openaiApiKey: text('openai_api_key'),
  anthropicApiKey: text('anthropic_api_key'),
  googleApiKey: text('google_api_key'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Project Members Table
 * 
 * Join table mapping users to projects with specific roles (owner, admin, member)
 * and optional tracking tags.
 */
export const projectMembers = pgTable('project_members', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // Valid values: 'owner' | 'admin' | 'member'
  tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.projectId, t.userId] }),
}));

/**
 * API Keys Table
 * 
 * Stores hashed representations of proxy access keys.
 * Includes a readable prefix for identification in the UI.
 */
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Usage Events Table
 * 
 * Immutable log of all LLM requests routed through the proxy.
 * Tracks token usage, latency, and estimated cost for analytics.
 */
export const usageEvents = pgTable('usage_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  apiKeyId: uuid('api_key_id').notNull().references(() => apiKeys.id),
  model: text('model').notNull(),
  provider: text('provider').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
  latencyMs: integer('latency_ms'),
  httpStatus: smallint('http_status'),
  userTags: text('user_tags').array().notNull().default(sql`ARRAY[]::text[]`),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  projectTimestampIdx: index('usage_events_project_timestamp_idx').on(t.projectId, t.timestamp),
  userTimestampIdx: index('usage_events_user_timestamp_idx').on(t.userId, t.timestamp),
}));

/**
 * Password Reset Tokens Table
 * 
 * Short-lived tokens for authenticating user password reset requests.
 */
export const passwordResetTokens = pgTable('password_reset_tokens', {
  token: uuid('token').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

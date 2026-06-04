import { Request, Response, NextFunction } from 'express';
import { db, apiKeys, projects, projectMembers } from '@ai-gatekeeper/db';
import { eq, and } from 'drizzle-orm';
import { redis } from '@ai-gatekeeper/redis';
import crypto from 'crypto';

/** Prefix for auth cache keys in Redis */
const AUTH_KEY_PREFIX = 'gk:auth:';

/** TTL for cached auth lookups (seconds) */
const AUTH_CACHE_TTL = 60;

interface CachedAuth {
  valid: boolean;
  projectId?: string;
  userId?: string;
  apiKeyId?: string;
  tags?: string[];
  upstreamKeys?: {
    openai: string | null;
    anthropic: string | null;
    google: string | null;
  };
}

// Extend Express Request to include gatekeeper info
declare global {
  namespace Express {
    interface Request {
      gatekeeper?: {
        projectId: string;
        userId: string;
        apiKeyId: string;
        tags: string[];
        upstreamKeys: {
          openai: string | null;
          anthropic: string | null;
          google: string | null;
        };
      };
    }
  }
}

export const requireVirtualKey = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const xApiKey = req.headers['x-api-key'] as string;
  const xGoogApiKey = req.headers['x-goog-api-key'] as string;
  const queryKey = req.query.key as string;
  
  let rawKey = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawKey = authHeader.split(' ')[1];
  } else if (authHeader && authHeader.startsWith('token ')) {
    rawKey = authHeader.split(' ')[1];
  } else if (xApiKey) {
    rawKey = xApiKey;
  } else if (xGoogApiKey) {
    rawKey = xGoogApiKey;
  } else if (queryKey) {
    rawKey = queryKey;
  } else {
    console.error('Missing auth header. Headers received:', req.headers);
    return res.status(401).json({ error: { message: 'Missing or invalid authentication header' } });
  }
  
  // Hash the raw key to match the stored SHA-256 hash in the DB
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  let cached: CachedAuth | null = null;

  try {
    const raw = await redis.get(AUTH_KEY_PREFIX + keyHash);
    if (raw) {
      cached = JSON.parse(raw);
    }
  } catch (err) {
    // Redis failure shouldn't block auth — fall through to DB lookup
    console.error('[auth] Redis read error, falling through to DB:', err);
  }

  if (!cached) {
    // Not in cache, look up in DB by hash
    const keyRecord = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.key, keyHash),
    });

    if (!keyRecord || keyRecord.revokedAt) {
      // Cache the failure so we don't spam the DB with invalid keys
      const fail: CachedAuth = { valid: false };
      try { await redis.set(AUTH_KEY_PREFIX + keyHash, JSON.stringify(fail), 'EX', AUTH_CACHE_TTL); } catch {}
      return res.status(401).json({ error: { message: 'Invalid or revoked API key' } });
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, keyRecord.projectId),
    });

    const membership = await db.query.projectMembers.findFirst({
      where: and(eq(projectMembers.projectId, keyRecord.projectId), eq(projectMembers.userId, keyRecord.userId)),
    });

    cached = { 
      valid: true, 
      projectId: keyRecord.projectId, 
      userId: keyRecord.userId, 
      apiKeyId: keyRecord.id,
      tags: membership?.tags || [],
      upstreamKeys: {
        openai: project?.openaiApiKey || process.env.OPENAI_API_KEY || null,
        anthropic: project?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || null,
        google: project?.googleApiKey || process.env.GOOGLE_API_KEY || null,
      }
    };

    try { await redis.set(AUTH_KEY_PREFIX + keyHash, JSON.stringify(cached), 'EX', AUTH_CACHE_TTL); } catch {}
  }

  if (!cached.valid || !cached.projectId || !cached.apiKeyId || !cached.userId || !cached.tags || !cached.upstreamKeys) {
    return res.status(401).json({ error: { message: 'Invalid or revoked API key' } });
  }

  req.gatekeeper = {
    projectId: cached.projectId,
    userId: cached.userId,
    apiKeyId: cached.apiKeyId,
    tags: cached.tags,
    upstreamKeys: cached.upstreamKeys,
  };
  next();
};

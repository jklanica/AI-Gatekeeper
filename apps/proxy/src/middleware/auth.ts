import { Request, Response, NextFunction } from 'express';
import { db, apiKeys, projects } from '@ai-gatekeeper/db';
import { eq } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';
import crypto from 'crypto';

// In-memory LRU cache to avoid a DB hit on every request
const keyCache = new LRUCache<string, { 
  valid: boolean; 
  projectId?: string; 
  userId?: string; 
  apiKeyId?: string;
  upstreamKeys?: {
    openai: string | null;
    anthropic: string | null;
    google: string | null;
  }
}>({
  max: 500,
  ttl: 1000 * 60, // 60 seconds
});

// Extend Express Request to include gatekeeper info
declare global {
  namespace Express {
    interface Request {
      gatekeeper?: {
        projectId: string;
        userId: string;
        apiKeyId: string;
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

  let cached = keyCache.get(keyHash);

  if (cached === undefined) {
    // Not in cache, look up in DB by hash
    const keyRecord = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.key, keyHash),
    });

    if (!keyRecord || keyRecord.revokedAt) {
      // Cache the failure so we don't spam the DB with invalid keys
      keyCache.set(keyHash, { valid: false });
      return res.status(401).json({ error: { message: 'Invalid or revoked API key' } });
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, keyRecord.projectId),
    });

    cached = { 
      valid: true, 
      projectId: keyRecord.projectId, 
      userId: keyRecord.userId, 
      apiKeyId: keyRecord.id,
      upstreamKeys: {
        openai: project?.openaiApiKey || process.env.OPENAI_API_KEY || null,
        anthropic: project?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || null,
        google: project?.googleApiKey || process.env.GOOGLE_API_KEY || null,
      }
    };
    keyCache.set(keyHash, cached);
  }

  if (!cached.valid || !cached.projectId || !cached.apiKeyId || !cached.userId || !cached.upstreamKeys) {
    return res.status(401).json({ error: { message: 'Invalid or revoked API key' } });
  }

  req.gatekeeper = {
    projectId: cached.projectId,
    userId: cached.userId,
    apiKeyId: cached.apiKeyId,
    upstreamKeys: cached.upstreamKeys,
  };
  next();
};

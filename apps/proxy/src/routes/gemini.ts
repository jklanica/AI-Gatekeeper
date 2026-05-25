import { Router, Request } from 'express';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { db, usageEvents } from '@ai-gatekeeper/db';
import { estimateCost } from '@ai-gatekeeper/types';

export const geminiRouter = Router();


const geminiProxy = createProxyMiddleware({
  target: 'https://generativelanguage.googleapis.com',
  changeOrigin: true,
  pathRewrite: (path, req) => req.originalUrl,
  selfHandleResponse: true,
  on: {
    proxyReq: (proxyReq, req, res) => {
      console.log('Proxying to Gemini path:', proxyReq.path);
      const expressReq = req as Request;
      if (expressReq.gatekeeper && expressReq.gatekeeper.upstreamKeys.google) {
        proxyReq.setHeader('x-goog-api-key', expressReq.gatekeeper.upstreamKeys.google);
      }
    },
    proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
      const expressReq = req as Request;
      const isEventStream = proxyRes.headers['content-type']?.includes('text/event-stream'); 
      const responseBody = responseBuffer.toString('utf8');
      
      let inputTokens = 0;
      let outputTokens = 0;
      let model = 'unknown';

      // Attempt to parse model from URL path (e.g. /v1beta/models/gemini-1.5-pro:generateContent)
      const pathModelMatch = req.url?.match(/models\/([^:]+):/);
      if (pathModelMatch) {
        model = pathModelMatch[1];
      }

      try {
        if (isEventStream) {
          // In SSE, chunks might contain usageMetadata. We can search for the "usageMetadata" key
          // but since it's hard to regex nested JSON, we'll try to find chunks that look like valid JSON arrays
          // and parse them to find the usage data.
          const matches = responseBody.matchAll(/data:\s*({.*})\s*\n/g);
          for (const match of matches) {
            try {
              const data = JSON.parse(match[1]);
              if (data.usageMetadata) {
                if (data.usageMetadata.promptTokenCount !== undefined) inputTokens = Math.max(inputTokens, data.usageMetadata.promptTokenCount);
                if (data.usageMetadata.candidatesTokenCount !== undefined) outputTokens = Math.max(outputTokens, data.usageMetadata.candidatesTokenCount);
              }
            } catch (e) {}
          }
        } else {
          // Normal JSON response
          try {
            const json = JSON.parse(responseBody);
            // Handle both standard objects and Gemini array responses
            const usageObj = Array.isArray(json) ? json[json.length - 1]?.usageMetadata : json.usageMetadata;
            if (usageObj) {
              inputTokens = usageObj.promptTokenCount || 0;
              outputTokens = usageObj.candidatesTokenCount || 0;
            }
          } catch (e) {}
        }
        if (expressReq.gatekeeper && (inputTokens + outputTokens > 0)) {
          const costUsd = estimateCost(model, inputTokens, outputTokens);
          db.insert(usageEvents).values({
            projectId: expressReq.gatekeeper.projectId,
            userId: expressReq.gatekeeper.userId,
            apiKeyId: expressReq.gatekeeper.apiKeyId,
            model,
            provider: 'google',
            inputTokens,
            outputTokens,
            costUsd: costUsd.toString(),
            httpStatus: proxyRes.statusCode,
            userTags: [],
          }).catch(err => {
            console.error('Failed to log gemini usage event:', err);
          });
        }
      } catch (e) {
        console.error('Failed to parse gemini proxy response:', e);
      }

      return responseBuffer;
    }),
  }
});

// Gemini routes typically start with /v1beta or /v1
geminiRouter.use('/', geminiProxy);

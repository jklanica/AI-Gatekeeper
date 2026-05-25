import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { requireVirtualKey } from './middleware/auth';
import { modelsRouter } from './routes/models';
import { chatRouter } from './routes/chat';
import { anthropicRouter } from './routes/anthropic';
import { geminiRouter } from './routes/gemini';

// Load environment variables in development
dotenv.config();

const app = express();
const PORT = process.env.PROXY_PORT || 3001;

// Global middleware
app.use(cors());

// We do NOT use global JSON body parsing because http-proxy-middleware
// needs the raw body to stream to the upstream server. If we parse it here,
// the proxy middleware will hang unless we manually re-stream it.

// Root health check
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// Proxy routes (require virtual key)
app.use('/v1/models', requireVirtualKey, modelsRouter);
app.use('/v1/chat', requireVirtualKey, chatRouter);
app.use('/v1/messages', requireVirtualKey, anthropicRouter);
app.use('/v1beta', requireVirtualKey, geminiRouter);

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Proxy service running on http://localhost:${PORT}`);
});

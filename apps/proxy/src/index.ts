import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { requireVirtualKey } from './middleware/auth';
import { rateLimit } from './middleware/rateLimit';
import { modelsRouter } from './routes/models';
import { chatRouter } from './routes/chat';
import { startUsageFlusher } from './services/usageBuffer';

// Load environment variables in development
dotenv.config();

const app = express();
const PORT = process.env.PROXY_PORT || 3001;

// Global middleware
app.use(cors());

// Root health check
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/v1/models', requireVirtualKey, modelsRouter);
app.use('/v1/chat/completions', requireVirtualKey, rateLimit, express.json(), chatRouter);

// Start the usage event flusher (Redis → Postgres batching)
startUsageFlusher();

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Proxy service running on http://localhost:${PORT}`);
});

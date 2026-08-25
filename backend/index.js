import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });
console.log(`[Config] Active LLM Provider: Azure OpenAI (gpt-4o-mini)`);
console.log(`[Config] Active Azure Key: ...${(process.env.AZURE_OPENAI_KEY || '').slice(-6)}`);
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config/env.js';
import interviewRouter from './routes/interview.js';

const app = express();
const server = createServer(app);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors({ origin: '*' }));
app.use(express.json());

// ---------------------------------------------------------------------------
// REST routes
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/interview', interviewRouter);

import { handleConnection } from './pipeline/orchestrator.js';

// ---------------------------------------------------------------------------
// WebSocket server (mounted on /ws, handles audio streaming)
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', handleConnection);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(config.port, '0.0.0.0', () => {
  console.log(`\n🎙️  AI Interview Agent — server listening on http://localhost:${config.port}`);
  console.log(`   Health check: http://localhost:${config.port}/api/health`);
  console.log(`   Default language: ${config.defaultLanguage}\n`);
});

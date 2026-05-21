import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { GraphStore } from '../core/graph/store.js';
import { indexDir } from '../core/paths.js';
import { justifyAnswer } from '../core/search/justify.js';
import { createTedMcpServer } from '../mcp/server.js';

const DEFAULT_PORT = 3847;

export async function startServe(port = DEFAULT_PORT): Promise<void> {
  const store = new GraphStore(indexDir());
  await store.open();

  const app = express();
  app.use(express.json());

  const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../web');
  app.use(express.static(webDir));

  app.get('/api/status', (_req, res) => {
    res.json(store.loadMeta() ?? { indexed: false });
  });

  app.get('/api/graph', (_req, res) => {
    res.json(store.loadGraphJson());
  });

  app.get('/api/query', async (req, res) => {
    const q = String(req.query.q ?? '');
    const limit = Number(req.query.limit ?? 20);
    res.json(await store.query(q, limit));
  });

  app.get('/api/context/:nodeId', (req, res) => {
    const depth = Number(req.query.depth ?? 1);
    res.json(store.context(req.params.nodeId, depth));
  });

  app.post('/api/justify', async (req, res) => {
    const { question, draft } = req.body as { question?: string; draft?: string };
    if (!question) return res.status(400).json({ error: 'question requise' });
    res.json(await justifyAnswer(store, question, draft));
  });

  app.post('/mcp', async (req, res) => {
    const server = createTedMcpServer(store);
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
    } catch (err) {
      console.error('[ted] Erreur MCP HTTP:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Utilisez POST pour le transport MCP streamable HTTP.' },
      id: null,
    });
  });

  app.listen(port, '127.0.0.1', () => {
    console.log(`[ted] UI graphe     http://127.0.0.1:${port}`);
    console.log(`[ted] API REST      http://127.0.0.1:${port}/api/status`);
    console.log(`[ted] MCP (HTTP)    http://127.0.0.1:${port}/mcp`);
    console.log(`[ted] Index         ${indexDir()}`);
  });
}

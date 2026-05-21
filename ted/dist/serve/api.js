import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { GraphStore, defaultIndexDir } from '../core/graph/store.js';
import { justifyAnswer } from '../core/search/justify.js';
export async function startServe(repoRoot, port) {
    const store = new GraphStore(defaultIndexDir(repoRoot));
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
        const { question, draft } = req.body;
        if (!question)
            return res.status(400).json({ error: 'question requise' });
        res.json(await justifyAnswer(store, question, draft));
    });
    app.listen(port, () => {
        console.log(`[ted] UI http://localhost:${port}`);
        console.log(`[ted] API http://localhost:${port}/api/status`);
    });
}

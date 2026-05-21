import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { GraphStore, defaultIndexDir } from '../core/graph/store.js';
import { justifyAnswer } from '../core/search/justify.js';
import { runAnalyze } from '../cli/analyze.js';
export async function startMcpServer(repoRoot) {
    const store = new GraphStore(defaultIndexDir(repoRoot));
    await store.open();
    const server = new Server({ name: 'ted', version: '0.1.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: 'ted_status',
                description: 'État de l\'index ontologie (skills + data.gouv.fr)',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'ted_analyze',
                description: 'Réindexer les skills Markdown et data.gouv.fr',
                inputSchema: {
                    type: 'object',
                    properties: {
                        datagouvQuery: { type: 'string' },
                    },
                },
            },
            {
                name: 'ted_query',
                description: 'Recherche sémantique légère dans le graphe',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string' },
                        limit: { type: 'number' },
                    },
                    required: ['query'],
                },
            },
            {
                name: 'ted_cypher',
                description: 'Requête Cypher sur LadybugDB (si disponible)',
                inputSchema: {
                    type: 'object',
                    properties: { query: { type: 'string' } },
                    required: ['query'],
                },
            },
            {
                name: 'ted_context',
                description: 'Sous-graphe autour d\'un nœud (justification locale)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        nodeId: { type: 'string' },
                        depth: { type: 'number' },
                    },
                    required: ['nodeId'],
                },
            },
            {
                name: 'ted_justify',
                description: 'Justifier une réponse agent avec citations depuis l\'ontologie skills',
                inputSchema: {
                    type: 'object',
                    properties: {
                        question: { type: 'string' },
                        draft: { type: 'string' },
                    },
                    required: ['question'],
                },
            },
        ],
    }));
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const { name, arguments: args } = req.params;
        const a = (args ?? {});
        try {
            switch (name) {
                case 'ted_status': {
                    const meta = store.loadMeta();
                    return {
                        content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }],
                    };
                }
                case 'ted_analyze': {
                    const meta = await runAnalyze({
                        repo: repoRoot,
                        datagouvQuery: a.datagouvQuery,
                    });
                    return {
                        content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }],
                    };
                }
                case 'ted_query': {
                    const hits = await store.query(String(a.query), Number(a.limit ?? 12));
                    return {
                        content: [{ type: 'text', text: JSON.stringify(hits, null, 2) }],
                    };
                }
                case 'ted_cypher': {
                    const result = await store.cypher(String(a.query));
                    return {
                        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                    };
                }
                case 'ted_context': {
                    const sub = store.context(String(a.nodeId), Number(a.depth ?? 1));
                    return {
                        content: [{ type: 'text', text: JSON.stringify(sub, null, 2) }],
                    };
                }
                case 'ted_justify': {
                    const j = await justifyAnswer(store, String(a.question), a.draft);
                    return {
                        content: [{ type: 'text', text: JSON.stringify(j, null, 2) }],
                    };
                }
                default:
                    throw new Error(`Outil inconnu: ${name}`);
            }
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Erreur: ${err.message}` }],
                isError: true,
            };
        }
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[ted-mcp] repo=${path.resolve(repoRoot)}`);
}

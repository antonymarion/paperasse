import { Command } from 'commander';
import { runAnalyze, runStatus, resolveRepo } from './analyze.js';
import { startMcpServer } from '../mcp/server.js';
import { startServe } from '../serve/api.js';
export function buildCli() {
    const program = new Command();
    program
        .name('ted')
        .description('TED — graphe de connaissances fiscal/comptable (skills Markdown, data.gouv.fr, Ladybug, MCP)')
        .version('0.1.0');
    program
        .command('analyze')
        .description('Indexer les skills Markdown et optionnellement data.gouv.fr')
        .option('-r, --repo <path>', 'Racine du dépôt (skills / projet)')
        .option('--no-datagouv', 'Ne pas enrichir avec data.gouv.fr')
        .option('--datagouv-query <q>', 'Requête API data.gouv.fr')
        .action(async (opts) => {
        await runAnalyze({
            repo: opts.repo ?? resolveRepo(),
            datagouv: opts.datagouv,
            datagouvQuery: opts.datagouvQuery,
        });
    });
    program
        .command('status')
        .description('Afficher l\'état de l\'index local')
        .option('-r, --repo <path>', 'Racine du dépôt')
        .action(async (opts) => {
        await runStatus(opts.repo ?? resolveRepo());
    });
    program
        .command('mcp')
        .description('Démarrer le serveur MCP (stdio) pour agents Cursor/Claude')
        .option('-r, --repo <path>', 'Racine du dépôt')
        .action(async (opts) => {
        await startMcpServer(opts.repo ?? resolveRepo());
    });
    program
        .command('serve')
        .description('UI web + API REST (style GitNexus)')
        .option('-r, --repo <path>', 'Racine du dépôt')
        .option('-p, --port <n>', 'Port HTTP', '3847')
        .action(async (opts) => {
        await startServe(opts.repo ?? resolveRepo(), Number(opts.port));
    });
    return program;
}
const program = buildCli();
program.parse();

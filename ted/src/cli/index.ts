import { Command } from 'commander';
import { runAnalyze, runStatus } from './analyze.js';
import { GraphStore } from '../core/graph/store.js';
import { indexDir } from '../core/paths.js';
import { startMcpStdio } from '../mcp/server.js';
import { startServe } from '../serve/api.js';

export function buildCli(): Command {
  const program = new Command();

  program
    .name('ted')
    .description(
      'TED — graphe de connaissances fiscal/comptable (skills Markdown, data.gouv.fr, Ladybug, MCP)',
    )
    .version('0.1.0');

  program
    .command('analyze')
    .description('Mettre à jour data.gouv.fr et reconstruire le graphe (~/.ted/index)')
    .option('--no-datagouv', 'Ne pas enrichir avec data.gouv.fr')
    .option('--datagouv-query <q>', 'Requête API data.gouv.fr')
    .action(async (opts) => {
      await runAnalyze({
        datagouv: opts.datagouv,
        datagouvQuery: opts.datagouvQuery,
      });
    });

  program
    .command('status')
    .description('Afficher l\'état de l\'index local (~/.ted/index)')
    .action(async () => {
      await runStatus();
    });

  program
    .command('mcp')
    .description('Serveur MCP stdio (Cursor/Claude) — préférez ted serve pour HTTP + UI')
    .action(async () => {
      const store = new GraphStore(indexDir());
      await store.open();
      await startMcpStdio(store);
    });

  program
    .command('serve')
    .description('UI graphe + API REST + MCP HTTP (port 3847)')
    .option('-p, --port <n>', 'Port HTTP', '3847')
    .action(async (opts) => {
      await startServe(Number(opts.port));
    });

  return program;
}

const program = buildCli();
program.parse();

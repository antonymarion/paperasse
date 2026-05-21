import { GraphStore } from '../core/graph/store.js';
import { loadEnv } from '../core/load-env.js';
import { indexDir, resolveSkillsRoot } from '../core/paths.js';
import { buildGraphFromRepo, mergeGraphs } from '../core/markdown/ingest.js';
import { graphStats } from '../core/search/justify.js';
import {
  datasetsToGraph,
  fetchDatagouvDatasets,
} from '../connectors/datagouv.js';
import {
  loadJournalConcepts,
  syncAccountData,
  transactionsToGraph,
} from '../connectors/accounts.js';
import { loadCachedTransactions } from '../connectors/qonto.js';
import { loadCompanyConfig } from '../connectors/company.js';
import type { IndexMeta } from '../core/types.js';
import { tagGraphLayers } from '../core/graph/layer.js';

export interface AnalyzeOptions {
  datagouv?: boolean;
  accounts?: boolean;
  /** Ingère ~/.ted/data/transactions sans re-synchroniser les connecteurs. */
  ingestTransactions?: boolean;
  datagouvQuery?: string;
}

export async function runAnalyze(opts: AnalyzeOptions = {}): Promise<IndexMeta> {
  loadEnv();

  const skillsRoot = resolveSkillsRoot();
  const store = new GraphStore(indexDir());
  await store.open();

  let graph = await buildGraphFromRepo(skillsRoot);
  let datagouvCount = 0;
  let accountCount = 0;
  let transactionCount = 0;
  let providersSynced: string[] = [];
  let providersCached: string[] = [];

  if (opts.datagouv !== false) {
    try {
      const datasets = await fetchDatagouvDatasets(opts.datagouvQuery);
      datagouvCount = datasets.length;
      graph = mergeGraphs(graph, datasetsToGraph(datasets));
    } catch (err) {
      console.warn('[ted] data.gouv.fr ignoré:', (err as Error).message);
    }
  }

  const ingestAccounts = opts.accounts !== false || opts.ingestTransactions === true;
  if (ingestAccounts) {
    try {
      if (opts.accounts !== false) {
        const sync = await syncAccountData();
        providersSynced = sync.providersSynced;
        providersCached = sync.providersCached;
        accountCount = sync.accountCount;
        transactionCount = sync.transactionCount;
        for (const w of sync.warnings) console.warn(`[ted] ${w}`);
      } else {
        const txs = loadCachedTransactions();
        providersCached = [...new Set(txs.map((t) => t.source))];
        accountCount = new Set(txs.map((t) => `${t.source}:${t.accountId}`)).size;
        transactionCount = txs.length;
      }

      const company = loadCompanyConfig();
      const txs = loadCachedTransactions();
      if (txs.length > 0) {
        graph = mergeGraphs(
          graph,
          transactionsToGraph(txs, company?.name),
        );
      }
      graph = mergeGraphs(graph, loadJournalConcepts());
    } catch (err) {
      console.warn('[ted] Comptes ignorés:', (err as Error).message);
    }
  }

  const skillCount = graph.nodes.filter((n) => n.label === 'Skill').length;
  const documentCount = graph.nodes.filter((n) => n.label === 'Document').length;
  accountCount =
    accountCount || graph.nodes.filter((n) => n.label === 'Account').length;
  transactionCount =
    transactionCount || graph.nodes.filter((n) => n.label === 'Transaction').length;

  tagGraphLayers(graph);

  const meta: IndexMeta = {
    indexPath: indexDir(),
    skillsRoot,
    indexedAt: new Date().toISOString(),
    skillCount,
    documentCount,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    datagouvDatasets: datagouvCount,
    accountCount,
    transactionCount,
    providersSynced,
    providersCached,
    engine: store.engine,
  };

  await store.saveGraph(graph, meta);

  console.log(`[ted] Index écrit dans ${indexDir()}`);
  console.log(`  Skills source: ${skillsRoot}`);
  console.log(`  Skills: ${skillCount}, Documents: ${documentCount}`);
  console.log(`  Comptes: ${accountCount}, Transactions: ${transactionCount}`);
  console.log(`  Sync API: ${providersSynced.join(', ') || '—'}`);
  console.log(`  Cache local: ${providersCached.join(', ') || '—'}`);
  console.log(`  Nœuds: ${meta.nodeCount}, Arêtes: ${meta.edgeCount}`);
  console.log(`  data.gouv.fr: ${datagouvCount} jeux de données`);
  console.log(`  Moteur: ${meta.engine}`);
  console.log('  Stats:', graphStats(graph.nodes));

  return meta;
}

export async function runStatus(): Promise<void> {
  const store = new GraphStore(indexDir());
  await store.open();
  const meta = store.loadMeta();
  if (!meta) {
    console.log('[ted] Aucun index. Lancez: ted analyze');
    return;
  }
  console.log(JSON.stringify(meta, null, 2));
}

import path from 'node:path';
import fs from 'node:fs';
import { buildGraphFromRepo, mergeGraphs } from '../core/markdown/ingest.js';
import { GraphStore, defaultIndexDir } from '../core/graph/store.js';
import { graphStats } from '../core/search/justify.js';
import {
  datasetsToGraph,
  fetchDatagouvDatasets,
} from '../connectors/datagouv.js';
import type { IndexMeta } from '../core/types.js';

export interface AnalyzeOptions {
  repo?: string;
  datagouv?: boolean;
  datagouvQuery?: string;
}

export async function runAnalyze(opts: AnalyzeOptions = {}): Promise<IndexMeta> {
  const repoRoot = path.resolve(opts.repo ?? process.cwd());
  const indexDir = defaultIndexDir(repoRoot);
  const store = new GraphStore(indexDir);
  await store.open();

  let graph = await buildGraphFromRepo(repoRoot);
  let datagouvCount = 0;

  if (opts.datagouv !== false) {
    try {
      const datasets = await fetchDatagouvDatasets(
        opts.datagouvQuery ?? 'fiscalité impôt comptabilité',
      );
      datagouvCount = datasets.length;
      graph = mergeGraphs(graph, datasetsToGraph(datasets));
    } catch (err) {
      console.warn('[ted] data.gouv.fr ignoré:', (err as Error).message);
    }
  }

  const skillCount = graph.nodes.filter((n) => n.label === 'Skill').length;
  const documentCount = graph.nodes.filter((n) => n.label === 'Document').length;

  const meta: IndexMeta = {
    repoPath: repoRoot,
    indexedAt: new Date().toISOString(),
    skillCount,
    documentCount,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    datagouvDatasets: datagouvCount,
    engine: store.engine,
  };

  await store.saveGraph(graph, meta);

  console.log(`[ted] Index écrit dans ${indexDir}`);
  console.log(`  Skills: ${skillCount}, Documents: ${documentCount}`);
  console.log(`  Nœuds: ${meta.nodeCount}, Arêtes: ${meta.edgeCount}`);
  console.log(`  data.gouv.fr: ${datagouvCount} jeux de données`);
  console.log(`  Moteur: ${meta.engine}`);
  console.log('  Stats:', graphStats(graph.nodes));

  return meta;
}

export async function runStatus(repo?: string): Promise<void> {
  const repoRoot = path.resolve(repo ?? process.cwd());
  const store = new GraphStore(defaultIndexDir(repoRoot));
  await store.open();
  const meta = store.loadMeta();
  if (!meta) {
    console.log('[ted] Aucun index. Lancez: ted analyze');
    return;
  }
  console.log(JSON.stringify(meta, null, 2));
}

export function resolveRepo(cwd = process.cwd()): string {
  let dir = cwd;
  while (dir !== path.dirname(dir)) {
    if (
      fs.existsSync(path.join(dir, 'comptable', 'SKILL.md')) ||
      fs.existsSync(path.join(dir, '.ted'))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return cwd;
}

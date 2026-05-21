import type { KnowledgeGraph } from '../core/types.js';
import type { GraphNode } from '../core/types.js';

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function nodeId(label: string, ...parts: string[]): string {
  return `${label}:${parts.map(slug).join(':')}`;
}

/** Retire les accents — l’API data.gouv renvoie souvent 0 résultat avec des caractères accentués. */
export function normalizeDatagouvQuery(query: string): string {
  return query
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Requêtes par défaut (sans accents) couvrant fiscalité / comptabilité. */
export const DEFAULT_DATAGOUV_QUERIES = [
  'impots',
  'dgfip',
  'fiscalite',
  'revenu impots',
  'tva',
  'comptabilite',
  'declarations fiscales',
];

export interface DatagouvDataset {
  id: string;
  title: string;
  url: string;
  organization?: string;
  tags: string[];
}

async function fetchDatagouvPage(
  query: string,
  pageSize: number,
): Promise<DatagouvDataset[]> {
  const url = new URL('https://www.data.gouv.fr/api/1/datasets/');
  url.searchParams.set('q', query);
  url.searchParams.set('page_size', String(pageSize));

  const res = await fetch(url);
  if (!res.ok) throw new Error(`data.gouv.fr API ${res.status}`);
  const body = (await res.json()) as {
    data: {
      id: string;
      title: string;
      page: string;
      organization?: { name?: string };
      tags?: string[];
    }[];
  };

  return (body.data ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    url: d.page,
    organization: d.organization?.name,
    tags: d.tags ?? [],
  }));
}

export async function fetchDatagouvDatasets(
  query?: string,
  pageSize = 15,
): Promise<DatagouvDataset[]> {
  const queries = query
    ? [normalizeDatagouvQuery(query)]
    : DEFAULT_DATAGOUV_QUERIES;

  const byId = new Map<string, DatagouvDataset>();

  for (const q of queries) {
    if (byId.size >= pageSize) break;
    if (!q) continue;
    const remaining = pageSize - byId.size;
    const perQuery = query ? pageSize : Math.min(5, remaining);
    try {
      const batch = await fetchDatagouvPage(q, perQuery);
      for (const d of batch) byId.set(d.id, d);
    } catch {
      // requête suivante
    }
  }

  if (byId.size === 0 && query) {
    const fallback = await fetchDatagouvPage('impots', pageSize);
    for (const d of fallback) byId.set(d.id, d);
  }

  return [...byId.values()].slice(0, pageSize);
}

export function datasetsToGraph(datasets: DatagouvDataset[]): KnowledgeGraph {
  const graph: KnowledgeGraph = { nodes: [], edges: [] };
  const rootId = nodeId('Dataset', 'data-gouv-fr');
  graph.nodes.push({
    id: rootId,
    label: 'Dataset',
    name: 'data.gouv.fr — open data fiscal',
    properties: { source: 'https://www.data.gouv.fr/' },
  });

  for (const d of datasets) {
    const id = nodeId('Dataset', d.id);
    graph.nodes.push({
      id,
      label: 'Dataset',
      name: d.title,
      properties: {
        url: d.url,
        organization: d.organization ?? '',
        tags: d.tags.join(', '),
      },
    });
    graph.edges.push({
      id: `e:${rootId}->${id}`,
      from: rootId,
      to: id,
      label: 'SOURCED_FROM',
    });
  }
  return graph;
}

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

export interface DatagouvDataset {
  id: string;
  title: string;
  url: string;
  organization?: string;
  tags: string[];
}

export async function fetchDatagouvDatasets(
  query = 'fiscalité impôt',
  pageSize = 15,
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

  return body.data.map((d) => ({
    id: d.id,
    title: d.title,
    url: d.page,
    organization: d.organization?.name,
    tags: d.tags ?? [],
  }));
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

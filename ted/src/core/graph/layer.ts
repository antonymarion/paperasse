import type { GraphNode, KnowledgeGraph, NodeLabel } from '../types.js';

export type GraphLayer = 'knowledge' | 'accounts' | 'all';

const ACCOUNTS_LABELS = new Set<NodeLabel>([
  'Company',
  'Provider',
  'Account',
  'Transaction',
]);

export function layerForLabel(label: NodeLabel): 'knowledge' | 'accounts' {
  return ACCOUNTS_LABELS.has(label) ? 'accounts' : 'knowledge';
}

export function inferNodeLayer(node: GraphNode): 'knowledge' | 'accounts' {
  const explicit = node.properties.layer;
  if (explicit === 'knowledge' || explicit === 'accounts') return explicit;
  const kind = node.properties.kind;
  if (kind === 'bank_category' || kind === 'pcg_account') return 'accounts';
  return layerForLabel(node.label);
}

/** Assure la propriété `layer` sur chaque nœud avant persistance. */
export function tagGraphLayers(graph: KnowledgeGraph): KnowledgeGraph {
  for (const n of graph.nodes) {
    n.properties.layer = inferNodeLayer(n);
  }
  return graph;
}

export function filterGraphByLayer(
  graph: KnowledgeGraph,
  layer: GraphLayer,
): KnowledgeGraph {
  if (layer === 'all') return graph;
  const ids = new Set(
    graph.nodes.filter((n) => inferNodeLayer(n) === layer).map((n) => n.id),
  );
  return {
    nodes: graph.nodes.filter((n) => ids.has(n.id)),
    edges: graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  };
}

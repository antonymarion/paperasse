export type NodeLabel =
  | 'Skill'
  | 'Document'
  | 'Section'
  | 'Concept'
  | 'Term'
  | 'Rule'
  | 'Reference'
  | 'Dataset'
  | 'Company'
  | 'Provider'
  | 'Account'
  | 'Transaction';

export type EdgeLabel =
  | 'CONTAINS'
  | 'MENTIONS'
  | 'REFERENCES'
  | 'DEFINED_IN'
  | 'RELATED_TO'
  | 'SOURCED_FROM'
  | 'HAS_ACCOUNT'
  | 'RECORDED'
  | 'CATEGORIZED_AS';

export interface GraphNode {
  id: string;
  label: NodeLabel;
  name: string;
  properties: Record<string, string | number | boolean | null>;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: EdgeLabel;
  properties?: Record<string, string | number | boolean | null>;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface IndexMeta {
  indexPath: string;
  skillsRoot: string;
  /** @deprecated ancien champ — conservé pour compatibilité meta.json */
  repoPath?: string;
  indexedAt: string;
  skillCount: number;
  documentCount: number;
  nodeCount: number;
  edgeCount: number;
  datagouvDatasets: number;
  accountCount: number;
  transactionCount: number;
  /** Sync API réussie lors du dernier `ted analyze`. */
  providersSynced: string[];
  /** Données lues depuis ~/.ted/data/transactions/*.json (pas forcément fraîches). */
  providersCached: string[];
  engine: 'ladybug' | 'json-fallback';
}

export interface QueryHit {
  id: string;
  label: NodeLabel;
  name: string;
  score: number;
  excerpt?: string;
  skill?: string;
  path?: string;
}

export interface JustifyResult {
  question: string;
  summary: string;
  /** Synthèse en prose du raisonnement. */
  explanation: string;
  /** Étapes du raisonnement (chemins dans le graphe skills / open data). */
  reasoning: string[];
  citations: {
    nodeId: string;
    label: NodeLabel;
    name: string;
    excerpt: string;
    skill?: string;
    document?: string;
    snippet?: string;
  }[];
}

import fs from 'node:fs';
import path from 'node:path';
import type { GraphEdge, GraphNode, IndexMeta, KnowledgeGraph, QueryHit } from '../types.js';

interface LadybugPrepared {}
interface LadybugConnection {
  query: (statement: string) => Promise<unknown>;
  prepare: (statement: string) => Promise<LadybugPrepared>;
  execute: (
    preparedStatement: LadybugPrepared,
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
}

const SCHEMA_CYPHER = `
CREATE NODE TABLE IF NOT EXISTS GraphNode(
  id STRING,
  label STRING,
  name STRING,
  properties STRING,
  PRIMARY KEY(id)
);
CREATE REL TABLE IF NOT EXISTS GraphRel(
  FROM GraphNode TO GraphNode,
  label STRING,
  properties STRING
);
`;

const LADYBUG_BATCH = 250;
const LADYBUG_DB_FILE = 'ontology.lbug';
const LEGACY_KUZU_DB_FILE = 'ontology.kuzu';

function ladybugDbPath(indexDir: string): string {
  const dbPath = path.join(indexDir, LADYBUG_DB_FILE);
  const legacyPath = path.join(indexDir, LEGACY_KUZU_DB_FILE);
  if (!fs.existsSync(dbPath) && fs.existsSync(legacyPath)) {
    fs.renameSync(legacyPath, dbPath);
    for (const ext of ['.wal', '.shadow', '.tmp']) {
      const legacySide = legacyPath + ext;
      const newSide = dbPath + ext;
      if (fs.existsSync(legacySide)) fs.renameSync(legacySide, newSide);
    }
  }
  return dbPath;
}

function dedupeGraph(graph: KnowledgeGraph): KnowledgeGraph {
  const nodes = new Map<string, GraphNode>();
  for (const n of graph.nodes) nodes.set(n.id, n);
  const edges = new Map<string, GraphEdge>();
  for (const e of graph.edges) edges.set(e.id, e);
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

async function syncLadybug(conn: LadybugConnection, graph: KnowledgeGraph): Promise<void> {
  await conn.query('MATCH (n:GraphNode) DETACH DELETE n');

  const createNodes = await conn.prepare(
    'UNWIND $rows AS row CREATE (n:GraphNode {id: row.id, label: row.label, name: row.name, properties: row.props})',
  );
  for (let i = 0; i < graph.nodes.length; i += LADYBUG_BATCH) {
    const rows = graph.nodes.slice(i, i + LADYBUG_BATCH).map((n) => ({
      id: n.id,
      label: n.label,
      name: n.name,
      props: JSON.stringify(n.properties),
    }));
    await conn.execute(createNodes, { rows });
  }

  const createEdges = await conn.prepare(
    `UNWIND $rows AS row
     MATCH (a:GraphNode {id: row.from}), (b:GraphNode {id: row.to})
     CREATE (a)-[:GraphRel {label: row.label, properties: row.props}]->(b)`,
  );
  for (let i = 0; i < graph.edges.length; i += LADYBUG_BATCH) {
    const rows = graph.edges.slice(i, i + LADYBUG_BATCH).map((e) => ({
      from: e.from,
      to: e.to,
      label: e.label,
      props: JSON.stringify(e.properties ?? {}),
    }));
    await conn.execute(createEdges, { rows });
  }
}

export class GraphStore {
  private db: unknown = null;
  private conn: unknown = null;
  readonly engine: 'ladybug' | 'json-fallback';
  private jsonPath: string;

  constructor(private readonly indexDir: string) {
    this.jsonPath = path.join(indexDir, 'graph.json');
    this.engine = 'json-fallback';
  }

  async open(): Promise<void> {
    fs.mkdirSync(this.indexDir, { recursive: true });
    try {
      const lbug = await import('lbug');
      const dbPath = ladybugDbPath(this.indexDir);
      this.db = new lbug.Database(dbPath);
      this.conn = new lbug.Connection(this.db as never);
      const openConn = this.conn as LadybugConnection;
      for (const stmt of SCHEMA_CYPHER.split(';')
        .map((x) => x.trim())
        .filter(Boolean)) {
        await openConn.query(stmt);
      }
      (this as { engine: 'ladybug' | 'json-fallback' }).engine = 'ladybug';
    } catch {
      if (!fs.existsSync(this.jsonPath)) {
        fs.writeFileSync(
          this.jsonPath,
          JSON.stringify({ nodes: [], edges: [] }, null, 2),
          'utf-8',
        );
      }
    }
  }

  async saveGraph(graph: KnowledgeGraph, meta: IndexMeta): Promise<void> {
    const deduped = dedupeGraph(graph);
    const metaOut = {
      ...meta,
      nodeCount: deduped.nodes.length,
      edgeCount: deduped.edges.length,
    };

    fs.writeFileSync(path.join(this.indexDir, 'meta.json'), JSON.stringify(metaOut, null, 2));
    fs.writeFileSync(this.jsonPath, JSON.stringify(deduped, null, 2), 'utf-8');

    if (this.engine === 'ladybug' && this.conn) {
      try {
        await syncLadybug(this.conn as LadybugConnection, deduped);
      } catch (err) {
        console.warn('[ted] LadybugDB sync ignorée:', (err as Error).message);
      }
    }
  }

  loadGraphJson(): KnowledgeGraph {
    return JSON.parse(fs.readFileSync(this.jsonPath, 'utf-8')) as KnowledgeGraph;
  }

  loadMeta(): IndexMeta | null {
    const p = path.join(this.indexDir, 'meta.json');
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as IndexMeta;
  }

  async query(text: string, limit = 12): Promise<QueryHit[]> {
    const graph = this.loadGraphJson();
    const q = text.toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);

    const scored = graph.nodes.map((n) => {
      const hay = `${n.name} ${n.label} ${JSON.stringify(n.properties)}`.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (hay.includes(t)) score += 1;
      }
      if (hay.includes(q)) score += 3;
      return {
        id: n.id,
        label: n.label,
        name: n.name,
        score,
        excerpt: (n.properties['path'] as string) ?? n.name,
        skill: n.properties['skill'] as string | undefined,
        path: n.properties['path'] as string | undefined,
      };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async cypher(query: string): Promise<unknown> {
    if (this.engine === 'ladybug' && this.conn) {
      return (this.conn as LadybugConnection).query(query);
    }
    throw new Error('Cypher nécessite LadybugDB (index local). Réessayez après npm install lbug.');
  }

  context(nodeId: string, depth = 1): KnowledgeGraph {
    const graph = this.loadGraphJson();
    const ids = new Set<string>([nodeId]);
    for (let d = 0; d < depth; d++) {
      for (const e of graph.edges) {
        if (ids.has(e.from)) ids.add(e.to);
        if (ids.has(e.to)) ids.add(e.from);
      }
    }
    return {
      nodes: graph.nodes.filter((n) => ids.has(n.id)),
      edges: graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    };
  }
}

export function defaultIndexDir(repoRoot: string): string {
  return path.join(repoRoot, '.ted');
}

export function ladybugDatabasePath(repoRoot: string): string {
  return path.join(defaultIndexDir(repoRoot), LADYBUG_DB_FILE);
}

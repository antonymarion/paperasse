import fs from 'node:fs';
import path from 'node:path';
import type { GraphEdge, GraphNode, JustifyResult, QueryHit } from '../types.js';
import type { GraphStore } from '../graph/store.js';
import type { GraphLayer } from '../graph/layer.js';
import { inferNodeLayer } from '../graph/layer.js';
import { searchTokens } from './normalize.js';
import { resolveSkillsRoot } from '../paths.js';

const KNOWLEDGE_PREFERRED = new Set(['Rule', 'Section', 'Document', 'Concept', 'Dataset', 'Skill']);
const ACCOUNTS_PREFERRED = new Set(['Transaction', 'Concept', 'Account', 'Provider', 'Company']);

function mergeHits(...lists: QueryHit[][]): QueryHit[] {
  const byId = new Map<string, QueryHit>();
  for (const hits of lists) {
    for (const h of hits) {
      const prev = byId.get(h.id);
      if (!prev || h.score > prev.score) byId.set(h.id, h);
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

function readMarkdownSnippet(relPath: string, line?: number): string {
  const skillsRoot = resolveSkillsRoot();
  const fp = path.join(skillsRoot, relPath);
  if (!fs.existsSync(fp)) return '';
  const lines = fs.readFileSync(fp, 'utf-8').split('\n');
  const start = line ? Math.max(0, line - 1) : 0;
  const chunk = lines
    .slice(start, start + 8)
    .join('\n')
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*/g, '')
    .trim();
  return chunk.slice(0, 420);
}

function tracePath(
  nodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  stopLabel?: string,
): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pathSteps: string[] = [];
  let current = byId.get(nodeId);
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    pathSteps.unshift(`${current.label} « ${current.name} »`);
    if (stopLabel && current.label === stopLabel) break;
    const parentEdge = edges.find((e) => e.to === current!.id);
    current = parentEdge ? byId.get(parentEdge.from) : undefined;
  }
  return pathSteps;
}

function formatTx(props: Record<string, string | number | boolean | null>): string {
  const amount = props.amount;
  const currency = props.currency ?? 'EUR';
  const date = String(props.date ?? '').slice(0, 10);
  const cat = props.category ? ` · ${props.category}` : '';
  return `${amount} ${currency}${date ? ` · ${date}` : ''}${cat}`;
}

function buildKnowledgeReasoning(
  question: string,
  draft: string,
  tokens: string[],
  citations: JustifyResult['citations'],
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
): { reasoning: string[]; explanation: string } {
  const reasoning: string[] = [];

  reasoning.push(
    tokens.length
      ? `Analyse (savoir métier) : mots-clés — ${tokens.slice(0, 8).join(', ')}.`
      : `Analyse (savoir métier) : « ${question} ».`,
  );

  if (draft) {
    reasoning.push(`Proposition : « ${draft.slice(0, 200)}${draft.length > 200 ? '…' : ''} ».`);
  }

  if (citations.length === 0) {
    reasoning.push('Aucune source skills / open data correspondante.');
    return {
      reasoning,
      explanation:
        'Pas de règle ou document indexé suffisamment proche. Essayez un terme PCG, TVA ou IS.',
    };
  }

  for (const c of citations.slice(0, 4)) {
    const chain = tracePath(c.nodeId, graph.nodes, graph.edges, 'Skill');
    if (chain.length > 1) reasoning.push(`Fil : ${chain.join(' → ')}.`);
    if (c.snippet) reasoning.push(`Extrait : « ${c.snippet.slice(0, 180)}… ».`);
  }

  const skills = [...new Set(citations.map((c) => c.skill).filter(Boolean))];
  let explanation = `${citations.length} source(s) skills / open data`;
  if (skills.length) explanation += ` (${skills.join(', ')})`;
  explanation += draft
    ? ' — à confronter avec votre situation.'
    : ' — contexte métier pour répondre.';

  return { reasoning, explanation };
}

function buildAccountsReasoning(
  question: string,
  draft: string,
  tokens: string[],
  citations: JustifyResult['citations'],
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
): { reasoning: string[]; explanation: string } {
  const reasoning: string[] = [];

  reasoning.push(
    tokens.length
      ? `Analyse (dépenses Qonto) : mots-clés — ${tokens.slice(0, 8).join(', ')}.`
      : `Analyse (dépenses) : « ${question} ».`,
  );

  const txCitations = citations.filter((c) => c.label === 'Transaction');
  const catCitations = citations.filter(
    (c) => c.label === 'Concept' && c.excerpt?.includes('bank_category'),
  );

  if (txCitations.length === 0 && citations.length === 0) {
    reasoning.push('Aucune transaction ou catégorie Qonto ne correspond.');
    return {
      reasoning,
      explanation:
        'Aucune dépense trouvée pour cette recherche. Essayez un libellé, un montant ou une catégorie (ex. restaurant, frais).',
    };
  }

  const byCategory = new Map<string, { count: number; total: number }>();
  for (const c of txCitations) {
    const node = graph.nodes.find((n) => n.id === c.nodeId);
    const cat = String(node?.properties.category ?? 'sans catégorie');
    const amount = Number(node?.properties.amount ?? 0);
    const prev = byCategory.get(cat) ?? { count: 0, total: 0 };
    prev.count += 1;
    prev.total += amount;
    byCategory.set(cat, prev);
  }

  if (byCategory.size > 0) {
    reasoning.push('Répartition par catégorie Qonto :');
    for (const [cat, stats] of [...byCategory.entries()].slice(0, 6)) {
      reasoning.push(
        `· ${cat.replace(/_/g, ' ')} : ${stats.count} opération(s), total ${stats.total.toFixed(2)} €.`,
      );
    }
  }

  for (const c of txCitations.slice(0, 5)) {
    const chain = tracePath(c.nodeId, graph.nodes, graph.edges, 'Account');
    reasoning.push(`${c.name} — ${c.snippet ?? c.excerpt}${chain.length ? ` (${chain.join(' → ')})` : ''}.`);
  }

  for (const c of citations.filter((x) => x.label === 'Concept').slice(0, 3)) {
    reasoning.push(`Catégorie agrégée : « ${c.name.replace(/_/g, ' ')} ».`);
  }

  let explanation = `${txCitations.length || citations.length} élément(s) trouvé(s) dans vos transactions synchronisées`;
  if (byCategory.size) explanation += `, répartis en ${byCategory.size} catégorie(s) Qonto`;
  explanation += '. Les nœuds du graphe sont regroupés par catégorie.';

  return { reasoning, explanation };
}

async function collectHits(
  store: GraphStore,
  queries: string[],
  layer: 'knowledge' | 'accounts',
  preferred: Set<string>,
): Promise<QueryHit[]> {
  const hitLists = await Promise.all(
    queries.map((text) => store.query(text, 12, { layer })),
  );
  let hits = mergeHits(...hitLists).slice(0, 14);

  hits = hits.sort((a, b) => {
    const pa = preferred.has(a.label) ? 1 : 0;
    const pb = preferred.has(b.label) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return b.score - a.score;
  });

  const graph = store.loadFullGraphJson();
  const layerNodes = new Set(
    graph.nodes.filter((n) => inferNodeLayer(n) === layer).map((n) => n.id),
  );
  return hits.filter((h) => layerNodes.has(h.id)).slice(0, 12);
}

function mapCitations(
  hits: QueryHit[],
  graph: { nodes: GraphNode[] },
  layer: 'knowledge' | 'accounts',
): JustifyResult['citations'] {
  return hits.map((h) => {
    const node = graph.nodes.find((n) => n.id === h.id);
    const props = node?.properties ?? {};
    const docPath = String(props['path'] ?? h.path ?? '');

    if (layer === 'accounts') {
      const snippet =
        h.label === 'Transaction'
          ? formatTx(props)
          : props.kind === 'bank_category'
            ? `Catégorie · ${h.name.replace(/_/g, ' ')}`
            : h.name;

      return {
        nodeId: h.id,
        label: h.label,
        name: h.name,
        excerpt: snippet,
        snippet,
        document: props.category ? String(props.category) : undefined,
      };
    }

    const line = typeof props['line'] === 'number' ? props['line'] : undefined;
    const snippet = docPath.endsWith('.md') ? readMarkdownSnippet(docPath, line) : '';

    return {
      nodeId: h.id,
      label: h.label,
      name: h.name,
      excerpt: docPath || h.excerpt || h.name,
      skill: props['skill'] as string | undefined,
      document: docPath || undefined,
      snippet: snippet || undefined,
    };
  });
}

export async function justifyAnswer(
  store: GraphStore,
  question: string,
  draft?: string,
  layer: GraphLayer = 'knowledge',
): Promise<JustifyResult> {
  const q = question.trim();
  const d = draft?.trim() ?? '';
  const tokens = searchTokens(`${q} ${d}`);
  const targetLayer = layer === 'accounts' ? 'accounts' : 'knowledge';

  const queries = [q, d && d !== q ? d : '', tokens.join(' '), ...tokens.slice(0, 5)].filter(
    Boolean,
  );

  const preferred = targetLayer === 'accounts' ? ACCOUNTS_PREFERRED : KNOWLEDGE_PREFERRED;
  const hits = await collectHits(store, queries, targetLayer, preferred);
  const graph = store.loadFullGraphJson();
  const citations = mapCitations(hits, graph, targetLayer);

  const { reasoning, explanation } =
    targetLayer === 'accounts'
      ? buildAccountsReasoning(q, d, tokens, citations, graph)
      : buildKnowledgeReasoning(q, d, tokens, citations, graph);

  return {
    question: q,
    summary: [`Question : ${q}`, d ? `Proposition : ${d}` : null, explanation]
      .filter(Boolean)
      .join('\n\n'),
    explanation,
    reasoning,
    citations,
  };
}

export function graphStats(nodes: { label: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of nodes) {
    counts[n.label] = (counts[n.label] ?? 0) + 1;
  }
  return counts;
}

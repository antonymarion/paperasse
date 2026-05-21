const LABEL_COLORS = {
  Skill: '#3b82f6',
  Document: '#22c55e',
  Section: '#a855f7',
  Concept: '#f59e0b',
  Term: '#eab308',
  Rule: '#ef4444',
  Reference: '#64748b',
  Dataset: '#06b6d4',
  Company: '#ec4899',
  Provider: '#14b8a6',
  Account: '#8b5cf6',
  Transaction: '#f97316',
};

const $ = (id) => document.getElementById(id);

let graphInstance = null;
let fullGraph = { nodes: [], links: [] };
let selectedNodeId = null;

function toForceGraph(raw) {
  const nodes = raw.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    label: n.label,
    val: n.label === 'Skill' ? 4 : n.label === 'Document' ? 2.5 : 1,
    color: LABEL_COLORS[n.label] ?? '#94a3b8',
    path: n.properties?.path,
  }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const links = raw.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({
      source: e.from,
      target: e.to,
      label: e.label,
    }));
  return { nodes, links };
}

function initGraph(container) {
  graphInstance = ForceGraph()(container)
    .backgroundColor('#0a0e14')
    .nodeLabel((n) => `${n.label}: ${n.name}`)
    .nodeColor((n) => n.color)
    .nodeVal((n) => n.val)
    .linkColor(() => 'rgba(148, 163, 184, 0.35)')
    .linkDirectionalArrowLength(3)
    .linkDirectionalArrowRelPos(1)
    .onNodeClick((node) => {
      selectedNodeId = node.id;
      document.querySelectorAll('.hit').forEach((el) => {
        el.classList.toggle('active', el.dataset.id === node.id);
      });
      showContext(node.id);
      graphInstance.centerAt(node.x, node.y, 800);
      graphInstance.zoom(2.5, 800);
    });
}

function renderGraph(subgraph) {
  if (!graphInstance) return;
  const data = toForceGraph(subgraph);
  graphInstance.graphData(data);
}

async function loadStatus() {
  const meta = await fetch('/api/status').then((r) => r.json());
  if (!meta.indexedAt) {
    $('status').textContent = 'Index absent — lancez: ted analyze';
    return;
  }
  $('status').innerHTML = `
    Indexé: ${new Date(meta.indexedAt).toLocaleString('fr-FR')}<br>
    Skills: ${meta.skillCount} · Docs: ${meta.documentCount}<br>
    Comptes: ${meta.accountCount ?? 0} · Transactions: ${meta.transactionCount ?? 0}<br>
    Fournisseurs: ${(meta.providersSynced ?? []).join(', ') || '—'}<br>
    Nœuds: ${meta.nodeCount} · Arêtes: ${meta.edgeCount}<br>
    data.gouv.fr: ${meta.datagouvDatasets} datasets<br>
    Moteur: ${meta.engine}
  `;
}

async function loadFullGraph() {
  const raw = await fetch('/api/graph').then((r) => r.json());
  fullGraph = toForceGraph(raw);
  renderGraph(raw);
}

async function search() {
  const q = $('query').value.trim();
  if (!q) return;
  const hits = await fetch(`/api/query?q=${encodeURIComponent(q)}`).then((r) => r.json());
  $('results').innerHTML = hits
    .map(
      (h) => `
        <div class="hit" data-id="${h.id}">
          <div class="label">${h.label}</div>
          <strong>${h.name}</strong>
          <div style="color:var(--muted);font-size:0.8rem">${h.path || h.excerpt || ''}</div>
        </div>
      `,
    )
    .join('');
  document.querySelectorAll('.hit').forEach((el) => {
    el.onclick = () => {
      selectedNodeId = el.dataset.id;
      document.querySelectorAll('.hit').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      showContext(el.dataset.id);
    };
  });
  if (hits[0]) showContext(hits[0].id);
}

async function showContext(nodeId) {
  const sub = await fetch(`/api/context/${encodeURIComponent(nodeId)}?depth=2`).then((r) =>
    r.json(),
  );
  renderGraph(sub);
}

async function justify() {
  const question = $('query').value.trim();
  const draft = $('draft').value.trim();
  if (!question) return;
  const j = await fetch('/api/justify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, draft: draft || undefined }),
  }).then((r) => r.json());
  $('citations').innerHTML =
    `<p>${j.summary.replace(/\n/g, '<br>')}</p>` +
    j.citations
      .map(
        (c) => `
          <div class="citation">
            <strong>${c.name}</strong> (${c.label})<br>
            ${c.document || c.excerpt}
          </div>
        `,
      )
      .join('');
}

$('search').onclick = search;
$('query').onkeydown = (e) => e.key === 'Enter' && search();
$('justify-btn').onclick = justify;

initGraph($('graph-container'));
loadStatus();
loadFullGraph();

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

const ZOOM_CLICK_MAX = 1.45;
const ZOOM_CLICK_MIN = 1.1;
const ZOOM_ANIM_MS = 900;

let graphInstance = null;
let selectedNodeId = null;
/** @type {'knowledge' | 'accounts'} */
let currentLayer = 'knowledge';
/** @type {object|null} dernier graphe brut (API) */
let lastRawGraph = null;

function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 62%, 52%)`;
}

function txCategoryMaps(raw) {
  const txToCat = new Map();
  const catNames = new Map();
  for (const e of raw.edges) {
    if (e.label !== 'CATEGORIZED_AS') continue;
    const from = raw.nodes.find((n) => n.id === e.from);
    const to = raw.nodes.find((n) => n.id === e.to);
    if (from?.label === 'Transaction' && to?.properties?.kind === 'bank_category') {
      txToCat.set(from.id, to.id);
      catNames.set(to.id, to.name);
    }
  }
  return { txToCat, catNames };
}

function categoryCenters(raw) {
  const cats = raw.nodes.filter((n) => n.properties?.kind === 'bank_category');
  const centers = new Map();
  const r = 220 + Math.min(cats.length * 8, 100);
  cats.forEach((cat, i) => {
    const angle = (2 * Math.PI * i) / Math.max(cats.length, 1);
    centers.set(cat.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  });
  return centers;
}

function txNodeVal(amount) {
  const abs = Math.abs(Number(amount) || 0);
  if (abs < 0.01) return 0.35;
  return Math.min(Math.max(Math.log10(abs + 1) * 0.9, 0.35), 6);
}

function categoryTotals(raw) {
  const { txToCat } = txCategoryMaps(raw);
  const totals = new Map();
  for (const n of raw.nodes) {
    if (n.label !== 'Transaction') continue;
    const catId = txToCat.get(n.id);
    if (!catId) continue;
    const prev = totals.get(catId) ?? 0;
    totals.set(catId, prev + Math.abs(Number(n.properties?.amount ?? 0)));
  }
  return totals;
}

function filterKnowledgeOverview(raw) {
  if (raw.nodes.length < 600) return raw;
  const keepLabels = new Set(['Skill', 'Document', 'Dataset', 'Rule', 'Reference']);
  const keptIds = new Set();
  const nodes = raw.nodes.filter((n) => {
    if (keepLabels.has(n.label)) {
      keptIds.add(n.id);
      return true;
    }
    if (n.label === 'Section' && Number(n.properties?.level ?? 99) <= 2) {
      keptIds.add(n.id);
      return true;
    }
    return false;
  });
  return {
    nodes,
    edges: raw.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to)),
  };
}

function toForceGraph(raw, layer) {
  const { txToCat, catNames } = txCategoryMaps(raw);
  const catTotals = layer === 'accounts' ? categoryTotals(raw) : null;

  const nodes = raw.nodes.map((n) => {
    let color = LABEL_COLORS[n.label] ?? '#94a3b8';
    let group = n.label;
    let categoryName = '';
    let val = 1;

    if (layer === 'accounts') {
      if (n.properties?.kind === 'bank_category') {
        categoryName = n.name;
        color = hashColor(n.name);
        group = n.name;
        const total = catTotals?.get(n.id) ?? 0;
        val = txNodeVal(total / Math.max(catTotals?.size ?? 1, 1)) * 2.2;
      } else if (n.label === 'Transaction') {
        const amount = Number(n.properties?.amount ?? 0);
        const catId = txToCat.get(n.id);
        categoryName = catId ? catNames.get(catId) ?? '' : 'sans_categorie';
        color = amount >= 0 ? '#22c55e' : hashColor(categoryName);
        group = categoryName;
        val = txNodeVal(amount);
      } else if (n.label === 'Account') {
        val = 2.5;
      } else if (n.label === 'Company' || n.label === 'Provider') {
        val = 2;
      }
    } else {
      val =
        n.label === 'Skill'
          ? 4
          : n.label === 'Document'
            ? 2.5
            : n.label === 'Dataset' || n.label === 'Rule'
              ? 2
              : n.label === 'Section'
                ? 1.4
                : 1;
    }

    return {
      id: n.id,
      name: n.name,
      label: n.label,
      group,
      categoryName,
      amount: n.properties?.amount != null ? Number(n.properties.amount) : undefined,
      val,
      color,
      path: n.properties?.path,
    };
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const links = raw.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({
      source: e.from,
      target: e.to,
      label: e.label,
    }));

  return { nodes, links, txToCat, centers: layer === 'accounts' ? categoryCenters(raw) : null };
}

function sizeGraph() {
  const el = $('graph-container');
  if (!graphInstance || !el) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w > 0 && h > 0) graphInstance.width(w).height(h);
}

function configureZoomBehavior(fg, container) {
  if (typeof fg.minZoom === 'function') fg.minZoom(0.25);
  if (typeof fg.maxZoom === 'function') fg.maxZoom(4);
  if (typeof fg.enableZoomInteraction === 'function') {
    fg.enableZoomInteraction((event) => event.type !== 'wheel');
  }
  container.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const z = fg.zoom();
      const step = e.deltaY > 0 ? 0.94 : 1.06;
      const min = typeof fg.minZoom === 'function' ? fg.minZoom() : 0.25;
      const max = typeof fg.maxZoom === 'function' ? fg.maxZoom() : 4;
      fg.zoom(Math.min(Math.max(z * step, min), max), 120);
    },
    { passive: false },
  );
}

function applyAccountsLayout(data) {
  if (!graphInstance || !data.centers || typeof d3 === 'undefined') return;

  const { txToCat, centers } = data;

  graphInstance.d3Force('charge')?.strength(-32);
  graphInstance.d3Force('link')?.distance((link) => (link.label === 'CATEGORIZED_AS' ? 28 : 55));

  graphInstance.d3Force(
    'x',
    d3
      .forceX((n) => {
        if (n.label === 'Concept' && centers.has(n.id)) return centers.get(n.id).x;
        const catId = txToCat.get(n.id);
        if (catId && centers.has(catId)) return centers.get(catId).x;
        if (n.label === 'Account') return 0;
        return 0;
      })
      .strength((n) => {
        if (n.label === 'Concept') return 1;
        if (n.label === 'Transaction') return 0.15;
        if (n.label === 'Account') return 0.08;
        return 0.03;
      }),
  );

  graphInstance.d3Force(
    'y',
    d3
      .forceY((n) => {
        if (n.label === 'Concept' && centers.has(n.id)) return centers.get(n.id).y;
        const catId = txToCat.get(n.id);
        if (catId && centers.has(catId)) return centers.get(catId).y;
        if (n.label === 'Account') return 0;
        return 0;
      })
      .strength((n) => {
        if (n.label === 'Concept') return 1;
        if (n.label === 'Transaction') return 0.15;
        if (n.label === 'Account') return 0.08;
        return 0.03;
      }),
  );

  const gd = graphInstance.graphData();
  for (const n of gd.nodes) {
    if (n.label === 'Concept' && centers.has(n.id)) {
      const c = centers.get(n.id);
      n.fx = c.x;
      n.fy = c.y;
    } else {
      n.fx = undefined;
      n.fy = undefined;
    }
  }
  graphInstance.d3ReheatSimulation();
}

function resetKnowledgeForces() {
  if (!graphInstance || typeof graphInstance.d3Force !== 'function') return;
  graphInstance.d3Force('x', null);
  graphInstance.d3Force('y', null);
  graphInstance.d3Force('charge')?.strength(-80);
  graphInstance.d3Force('link')?.distance(28);
  graphInstance.d3Force('center')?.strength(0.04);
  const gd = graphInstance.graphData();
  if (gd?.nodes) {
    for (const n of gd.nodes) {
      n.fx = undefined;
      n.fy = undefined;
    }
  }
  if (typeof graphInstance.d3ReheatSimulation === 'function') {
    graphInstance.d3ReheatSimulation();
  }
}

function fitGraphView(delayMs = 500) {
  if (!graphInstance) return;
  setTimeout(() => {
    if (typeof graphInstance.zoomToFit === 'function') {
      graphInstance.zoomToFit(600, 60);
    }
  }, delayMs);
}

function focusNode(node) {
  const current = graphInstance.zoom() ?? 1;
  const target = Math.min(Math.max(current * 1.06, ZOOM_CLICK_MIN), ZOOM_CLICK_MAX);
  graphInstance.centerAt(node.x, node.y, ZOOM_ANIM_MS);
  if (Math.abs(target - current) > 0.02) graphInstance.zoom(target, ZOOM_ANIM_MS);
}

function initGraph(container) {
  graphInstance = ForceGraph()(container)
    .backgroundColor('#0a0e14')
    .nodeLabel((n) => {
      if (n.label === 'Transaction') {
        const sign = n.amount >= 0 ? '+' : '';
        const amt = n.amount != null ? `\n${sign}${n.amount.toFixed(2)} €` : '';
        const cat = n.categoryName ? `\n${n.categoryName.replace(/_/g, ' ')}` : '';
        return `${n.name}${amt}${cat}`;
      }
      return `${n.label}: ${n.name}`;
    })
    .nodeColor((n) => n.color)
    .nodeVal((n) => n.val)
    .linkColor((link) =>
      link.label === 'CATEGORIZED_AS' ? 'rgba(249, 115, 22, 0.45)' : 'rgba(148, 163, 184, 0.3)',
    )
    .linkDirectionalArrowLength(3)
    .linkDirectionalArrowRelPos(1)
    .onNodeClick((node) => {
      selectedNodeId = node.id;
      document.querySelectorAll('.hit').forEach((el) => {
        el.classList.toggle('active', el.dataset.id === node.id);
      });
      showContext(node.id);
      focusNode(node);
    });

  configureZoomBehavior(graphInstance, container);
  sizeGraph();
  window.addEventListener('resize', sizeGraph);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => sizeGraph()).observe(container);
  }
  requestAnimationFrame(sizeGraph);
}

function renderGraph(raw) {
  if (!graphInstance) return;
  lastRawGraph = raw;
  const data = toForceGraph(raw, currentLayer);
  graphInstance.graphData({ nodes: data.nodes, links: data.links });

  if (currentLayer === 'accounts') {
    applyAccountsLayout(data);
    fitGraphView(350);
  } else {
    resetKnowledgeForces();
    fitGraphView(800);
  }
  requestAnimationFrame(sizeGraph);
}

function setLayer(layer) {
  currentLayer = layer;
  document.querySelectorAll('.layer-tabs button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.layer === layer);
  });
  $('search-query').placeholder =
    layer === 'accounts'
      ? 'Question sur vos dépenses (ex: restaurant, abonnement, frais)'
      : 'Question fiscale ou comptable (ex: TVA, PCG, dividendes)';
  const leg = $('graph-legend');
  if (leg) {
    leg.textContent =
      layer === 'accounts'
        ? 'Comptes Qonto : communautés par catégorie · taille ∝ montant · vert = encaissement'
        : 'Savoir métier : skills paperasse & open data (vue synthétique) · Entrée = justifier';
  }
  loadFullGraph();
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
    Sync API: ${(meta.providersSynced ?? []).join(', ') || '—'}<br>
    Cache local: ${(meta.providersCached ?? []).join(', ') || '—'}<br>
    Nœuds: ${meta.nodeCount} · Arêtes: ${meta.edgeCount}<br>
    data.gouv.fr: ${meta.datagouvDatasets} datasets<br>
    Moteur: ${meta.engine}
  `;
}

async function loadFullGraph() {
  let raw = await fetch(`/api/graph?layer=${currentLayer}`).then((r) => r.json());
  if (currentLayer === 'knowledge') {
    raw = filterKnowledgeOverview(raw);
  }
  renderGraph(raw);
}

async function showContext(nodeId) {
  const sub = await fetch(
    `/api/context/${encodeURIComponent(nodeId)}?depth=2&layer=${currentLayer}`,
  ).then((r) => r.json());
  renderGraph(sub);
}

function renderJustifyResults(j) {
  const reasoning =
    j.reasoning?.length > 0
      ? j.reasoning.map((step) => `<div class="reasoning-step">${step}</div>`).join('')
      : '';

  const emptyMsg =
    currentLayer === 'accounts'
      ? 'Aucune transaction — essayez « restaurant », « frais », « abonnement »…'
      : 'Aucune source skills — essayez « TVA », « PCG », « dividendes »…';

  const cites =
    j.citations?.length > 0
      ? j.citations
          .map(
            (c) => `
          <div class="hit" data-id="${c.nodeId}">
            <div class="label">${c.label}</div>
            <strong>${c.name}</strong>
            <div style="color:var(--muted);font-size:0.8rem">${c.snippet || c.excerpt || '—'}</div>
          </div>
        `,
          )
          .join('')
      : `<p style="color:var(--muted)">${emptyMsg}</p>`;

  $('results').innerHTML = cites;
  document.querySelectorAll('#results .hit').forEach((el) => {
    el.onclick = () => {
      selectedNodeId = el.dataset.id;
      document.querySelectorAll('.hit').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      showContext(el.dataset.id);
    };
  });

  $('citations').innerHTML = `
    ${j.explanation ? `<div class="explanation">${j.explanation}</div>` : ''}
    ${reasoning}
  `;

  if (j.citations?.[0]) showContext(j.citations[0].nodeId);
  $('justification-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function justify() {
  const question = $('search-query').value.trim();
  const draft = $('draft').value.trim();
  const queryText = question || draft;
  if (!queryText) {
    $('citations').innerHTML =
      '<p class="citation" style="border-color:#ef4444">Saisissez une question (Entrée pour justifier).</p>';
    return;
  }

  const layerLabel = currentLayer === 'accounts' ? 'dépenses Qonto' : 'savoir métier';
  $('citations').innerHTML = `<p style="color:var(--muted)">Justification (${layerLabel})…</p>`;

  try {
    const res = await fetch('/api/justify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question || draft,
        draft: question && draft ? draft : undefined,
        layer: currentLayer,
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      $('citations').innerHTML = `<p class="citation" style="border-color:#ef4444">${j.error ?? res.statusText}</p>`;
      return;
    }
    renderJustifyResults(j);
  } catch (err) {
    $('citations').innerHTML = `<p class="citation" style="border-color:#ef4444">${err.message}</p>`;
  }
}

$('search-query').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    justify();
  }
});
$('justify-btn').onclick = justify;
$('layer-knowledge').onclick = () => setLayer('knowledge');
$('layer-accounts').onclick = () => setLayer('accounts');

initGraph($('graph-container'));
loadStatus();
loadFullGraph();

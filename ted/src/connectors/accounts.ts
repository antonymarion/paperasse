import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeGraph } from '../core/types.js';
import { journalEntriesPath } from '../core/paths.js';
import { fiscalYearRange, loadCompanyConfig } from './company.js';
import { loadCachedTransactions, syncQonto, type NormalizedTransaction } from './qonto.js';
import { syncStripe } from './stripe.js';

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

export interface AccountsSyncSummary {
  /** Fournisseurs synchronisés via API lors de ce `ted analyze`. */
  providersSynced: string[];
  /** Fournisseurs présents dans le cache local `~/.ted/data/transactions/*.json`. */
  providersCached: string[];
  accountCount: number;
  transactionCount: number;
  warnings: string[];
}

export async function syncAccountData(): Promise<AccountsSyncSummary> {
  const company = loadCompanyConfig();
  const range = fiscalYearRange(company);
  const providersSynced: string[] = [];
  const warnings: string[] = [];

  const qontoExplicitOff = company?.qonto?.enabled === false;
  const hasQontoEnv = Boolean(process.env.QONTO_ID && process.env.QONTO_API_SECRET);

  if (!qontoExplicitOff && hasQontoEnv) {
    try {
      const result = await syncQonto({
        updated_at_from: range.from,
        updated_at_to: range.to,
      });
      providersSynced.push('qonto');
      for (const a of result.accounts) {
        console.log(`[ted] Qonto ${a.name}: ${a.count} transaction(s) (API)`);
      }
    } catch (err) {
      warnings.push(`Qonto: ${(err as Error).message}`);
      console.warn('[ted] Qonto ignoré:', (err as Error).message);
    }
  } else if (company?.qonto?.enabled === true && !hasQontoEnv) {
    warnings.push('Qonto activé dans company.json mais QONTO_ID / QONTO_API_SECRET absents');
  }

  const stripeAccounts = company?.stripe_accounts ?? [];
  if (stripeAccounts.length > 0) {
    const rangeStart = range.from?.slice(0, 10);
    const rangeEnd = range.to?.slice(0, 10);
    try {
      const result = await syncStripe({
        startDate: rangeStart,
        endDate: rangeEnd,
      });
      if (result.accounts.length > 0) {
        providersSynced.push('stripe');
        for (const a of result.accounts) {
          console.log(`[ted] Stripe ${a.name}: ${a.count} transaction(s) (API)`);
        }
      }
    } catch (err) {
      warnings.push(`Stripe: ${(err as Error).message}`);
      console.warn('[ted] Stripe ignoré:', (err as Error).message);
    }
  }

  const txs = loadCachedTransactions();
  const providersCached = [...new Set(txs.map((t) => t.source))];
  if (providersCached.length > 0) {
    console.log(
      `[ted] Cache local: ${txs.length} transaction(s) (${providersCached.join(', ')}) — ~/.ted/data/transactions/`,
    );
  }

  const accountIds = new Set(txs.map((t) => `${t.source}:${t.accountId}`));

  return {
    providersSynced,
    providersCached,
    accountCount: accountIds.size,
    transactionCount: txs.length,
    warnings,
  };
}

export function transactionsToGraph(
  transactions: NormalizedTransaction[],
  companyName?: string,
): KnowledgeGraph {
  const graph: KnowledgeGraph = { nodes: [], edges: [] };
  const nodeIds = new Set<string>();

  const companyId = nodeId('Company', companyName ?? 'default');
  graph.nodes.push({
    id: companyId,
    label: 'Company',
    name: companyName ?? 'Société',
    properties: { layer: 'accounts' },
  });
  nodeIds.add(companyId);

  const providers = new Map<string, string>();
  for (const tx of transactions) {
    if (!providers.has(tx.source)) {
      const providerId = nodeId('Provider', tx.source);
      providers.set(tx.source, providerId);
      graph.nodes.push({
        id: providerId,
        label: 'Provider',
        name: tx.source,
        properties: { type: tx.source, layer: 'accounts' },
      });
      graph.edges.push({
        id: `e:${companyId}->${providerId}`,
        from: companyId,
        to: providerId,
        label: 'CONTAINS',
      });
    }
  }

  const accounts = new Map<string, string>();
  for (const tx of transactions) {
    const accKey = `${tx.source}:${tx.accountId}`;
    if (!accounts.has(accKey)) {
      const providerId = providers.get(tx.source)!;
      const accountNodeId = nodeId('Account', tx.source, tx.accountId);
      accounts.set(accKey, accountNodeId);
      graph.nodes.push({
        id: accountNodeId,
        label: 'Account',
        name: tx.accountName,
        properties: {
          source: tx.source,
          accountId: tx.accountId,
          iban: tx.iban ?? '',
          layer: 'accounts',
        },
      });
      graph.edges.push({
        id: `e:${providerId}->${accountNodeId}`,
        from: providerId,
        to: accountNodeId,
        label: 'HAS_ACCOUNT',
      });
      graph.edges.push({
        id: `e:${companyId}->${accountNodeId}`,
        from: companyId,
        to: accountNodeId,
        label: 'HAS_ACCOUNT',
      });
    }

    const txNodeId = nodeId('Transaction', tx.source, tx.id);
    if (nodeIds.has(txNodeId)) continue;
    nodeIds.add(txNodeId);

    graph.nodes.push({
      id: txNodeId,
      label: 'Transaction',
      name: tx.label,
      properties: {
        source: tx.source,
        date: tx.date,
        amount: tx.amount,
        currency: tx.currency,
        label: tx.label,
        reference: tx.reference ?? '',
        category: tx.category ?? '',
        our_category: tx.our_category ?? '',
        accountId: tx.accountId,
        accountName: tx.accountName,
        layer: 'accounts',
      },
    });

    graph.edges.push({
      id: `e:${accounts.get(accKey)!}->${txNodeId}`,
      from: accounts.get(accKey)!,
      to: txNodeId,
      label: 'RECORDED',
    });

    if (tx.category) {
      const catId = nodeId('Concept', 'category', tx.category);
      if (!nodeIds.has(catId)) {
        nodeIds.add(catId);
        graph.nodes.push({
          id: catId,
          label: 'Concept',
          name: tx.category,
          properties: { kind: 'bank_category', layer: 'accounts' },
        });
      }
      graph.edges.push({
        id: `e:${txNodeId}->${catId}`,
        from: txNodeId,
        to: catId,
        label: 'CATEGORIZED_AS',
      });
    }

    if (tx.our_category) {
      const pcgId = nodeId('Concept', 'pcg', tx.our_category);
      if (!nodeIds.has(pcgId)) {
        nodeIds.add(pcgId);
        graph.nodes.push({
          id: pcgId,
          label: 'Concept',
          name: String(tx.our_category),
          properties: { kind: 'pcg_account', layer: 'accounts' },
        });
      }
      graph.edges.push({
        id: `e:${txNodeId}->${pcgId}:pcg`,
        from: txNodeId,
        to: pcgId,
        label: 'CATEGORIZED_AS',
      });
    }
  }

  return graph;
}

export function loadJournalConcepts(): KnowledgeGraph {
  const graph: KnowledgeGraph = { nodes: [], edges: [] };
  const p = process.env.TED_JOURNAL
    ? path.resolve(process.env.TED_JOURNAL)
    : journalEntriesPath();

  if (!fs.existsSync(p)) return graph;

  const entries = JSON.parse(fs.readFileSync(p, 'utf-8')) as {
    id?: string;
    label?: string;
    lines?: { account: string; label?: string }[];
  }[];
  if (!Array.isArray(entries)) return graph;

  const journalId = nodeId('Document', 'journal-entries');
  graph.nodes.push({
    id: journalId,
    label: 'Document',
    name: 'journal-entries.json',
    properties: { path: p, kind: 'journal' },
  });

  for (const entry of entries.slice(0, 500)) {
    const entryId = nodeId('Section', 'journal', entry.id ?? entry.label ?? 'entry');
    graph.nodes.push({
      id: entryId,
      label: 'Section',
      name: entry.label ?? entry.id ?? 'Écriture',
      properties: { kind: 'journal_entry' },
    });
    graph.edges.push({
      id: `e:${journalId}->${entryId}`,
      from: journalId,
      to: entryId,
      label: 'CONTAINS',
    });
    for (const line of entry.lines ?? []) {
      const accId = nodeId('Concept', 'pcg', line.account);
      if (!graph.nodes.some((n) => n.id === accId)) {
        graph.nodes.push({
          id: accId,
          label: 'Concept',
          name: line.account,
          properties: { kind: 'pcg_account', label: line.label ?? '' },
        });
      }
      graph.edges.push({
        id: `e:${entryId}->${accId}`,
        from: entryId,
        to: accId,
        label: 'MENTIONS',
      });
    }
  }

  return graph;
}

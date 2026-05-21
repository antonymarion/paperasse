import fs from 'node:fs';
import path from 'node:path';
import { transactionsDir } from '../core/paths.js';

const QONTO_API_BASE = 'https://thirdparty.qonto.com/v2';

export interface NormalizedTransaction {
  id: string;
  source: string;
  accountId: string;
  accountName: string;
  iban?: string;
  date: string;
  amount: number;
  currency: string;
  label: string;
  reference?: string;
  category?: string;
  our_category?: string | null;
  status?: string;
}

interface QontoTx {
  transaction_id: string;
  side: string;
  amount: number;
  currency: string;
  label: string;
  reference?: string;
  category?: string;
  status?: string;
  settled_at?: string;
  emitted_at?: string;
}

function transformQontoTx(
  tx: QontoTx,
  accountId: string,
  accountName: string,
  iban: string,
): NormalizedTransaction {
  return {
    id: tx.transaction_id,
    source: 'qonto',
    accountId,
    accountName,
    iban,
    date: tx.settled_at || tx.emitted_at || '',
    amount: tx.side === 'credit' ? tx.amount : -tx.amount,
    currency: tx.currency,
    label: tx.label,
    reference: tx.reference,
    category: tx.category,
    our_category: null,
    status: tx.status,
  };
}

async function qontoHeaders(): Promise<Record<string, string>> {
  const id = process.env.QONTO_ID;
  const secret = process.env.QONTO_API_SECRET;
  if (!id || !secret) {
    throw new Error('QONTO_ID ou QONTO_API_SECRET manquant (~/.ted/.env)');
  }
  return {
    Authorization: `${id}:${secret}`,
    'Content-Type': 'application/json',
  };
}

async function getAllQontoTransactions(
  iban: string,
  options: { updated_at_from?: string; updated_at_to?: string } = {},
): Promise<QontoTx[]> {
  const headers = await qontoHeaders();
  const all: QontoTx[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      iban,
      status: 'completed',
      per_page: '100',
      current_page: String(page),
    });
    if (options.updated_at_from) params.set('updated_at_from', options.updated_at_from);
    if (options.updated_at_to) params.set('updated_at_to', options.updated_at_to);

    const res = await fetch(`${QONTO_API_BASE}/transactions?${params}`, { headers });
    if (!res.ok) throw new Error(`Qonto API ${res.status}`);

    const body = (await res.json()) as {
      transactions: QontoTx[];
      meta: { total_count: number; per_page: number };
    };
    all.push(...body.transactions);

    const totalPages = Math.ceil(body.meta.total_count / body.meta.per_page);
    hasMore = page < totalPages;
    page++;
    if (hasMore) await new Promise((r) => setTimeout(r, 200));
  }

  return all;
}

export interface QontoSyncResult {
  accounts: { slug: string; name: string; iban: string; count: number; file: string }[];
  organization?: string;
}

export async function syncQonto(options: {
  updated_at_from?: string;
  updated_at_to?: string;
} = {}): Promise<QontoSyncResult> {
  const headers = await qontoHeaders();
  const orgRes = await fetch(`${QONTO_API_BASE}/organization`, { headers });
  if (!orgRes.ok) throw new Error(`Qonto organization ${orgRes.status}`);

  const orgBody = (await orgRes.json()) as {
    organization: {
      slug: string;
      bank_accounts: { slug: string; name: string; iban: string }[];
    };
  };

  const outDir = transactionsDir();
  fs.mkdirSync(outDir, { recursive: true });

  const accounts: QontoSyncResult['accounts'] = [];
  for (const account of orgBody.organization.bank_accounts) {
    const txs = await getAllQontoTransactions(account.iban, options);
    const normalized = txs.map((tx) =>
      transformQontoTx(tx, account.slug, account.name, account.iban),
    );
    const file = path.join(outDir, `qonto-${account.slug}.json`);
    fs.writeFileSync(file, JSON.stringify(normalized, null, 2));
    accounts.push({
      slug: account.slug,
      name: account.name,
      iban: account.iban,
      count: normalized.length,
      file,
    });
  }

  return { accounts, organization: orgBody.organization.slug };
}

export function loadCachedTransactions(): NormalizedTransaction[] {
  const dir = transactionsDir();
  if (!fs.existsSync(dir)) return [];

  const all: NormalizedTransaction[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')) as unknown;
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (item && typeof item === 'object' && 'id' in item && 'source' in item) {
        all.push(item as NormalizedTransaction);
      }
    }
  }
  return all;
}

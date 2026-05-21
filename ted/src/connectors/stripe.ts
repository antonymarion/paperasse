import fs from 'node:fs';
import path from 'node:path';
import { transactionsDir } from '../core/paths.js';
import { loadCompanyConfig } from './company.js';
import type { NormalizedTransaction } from './qonto.js';

interface StripeBalanceTx {
  id: string;
  type: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  created: number;
  description: string | null;
  status: string;
  payout?: string | null;
}

interface StripeAccountConfig {
  id: string;
  name: string;
  env_key: string;
  stripe_account_id?: string;
}

function mapStripeType(type: string): string {
  const mapping: Record<string, string> = {
    charge: 'revenue',
    payment: 'revenue',
    payout: 'bank_transfer',
    stripe_fee: 'banking_fees',
    refund: 'refund',
    adjustment: 'adjustment',
    application_fee: 'platform_fee',
  };
  return mapping[type] ?? 'other';
}

function transformStripeTx(tx: StripeBalanceTx, account: StripeAccountConfig): NormalizedTransaction {
  return {
    id: tx.id,
    source: 'stripe',
    accountId: account.id,
    accountName: account.name,
    date: new Date(tx.created * 1000).toISOString(),
    amount: tx.net / 100,
    currency: tx.currency.toUpperCase(),
    label: tx.description?.trim() || tx.type,
    category: tx.type,
    our_category: mapStripeType(tx.type),
    status: tx.status,
    reference: tx.payout ?? undefined,
  };
}

async function stripeListBalanceTransactions(
  apiKey: string,
  account: StripeAccountConfig,
  range: { from?: string; to?: string },
): Promise<StripeBalanceTx[]> {
  const all: StripeBalanceTx[] = [];
  let startingAfter: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({ limit: '100' });
    if (range.from) {
      params.set('created[gte]', String(Math.floor(new Date(range.from).getTime() / 1000)));
    }
    if (range.to) {
      params.set('created[lte]', String(Math.floor(new Date(range.to).getTime() / 1000)));
    }
    if (startingAfter) params.set('starting_after', startingAfter);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    };
    if (account.stripe_account_id) {
      headers['Stripe-Account'] = account.stripe_account_id;
    }

    const res = await fetch(`https://api.stripe.com/v1/balance_transactions?${params}`, {
      headers,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Stripe API ${res.status}: ${body.slice(0, 200)}`);
    }

    const body = (await res.json()) as {
      data: StripeBalanceTx[];
      has_more: boolean;
    };
    all.push(...body.data);
    hasMore = body.has_more;
    if (body.data.length > 0) {
      startingAfter = body.data[body.data.length - 1]!.id;
    }
    if (hasMore) await new Promise((r) => setTimeout(r, 150));
  }

  return all;
}

export interface StripeSyncResult {
  accounts: { id: string; name: string; count: number; file: string }[];
}

export async function syncStripe(options: {
  startDate?: string;
  endDate?: string;
  accountId?: string;
} = {}): Promise<StripeSyncResult> {
  const company = loadCompanyConfig();
  const accounts = company?.stripe_accounts ?? [];
  if (accounts.length === 0) {
    return { accounts: [] };
  }

  const filtered = options.accountId
    ? accounts.filter((a) => a.id === options.accountId)
    : accounts;

  const outDir = transactionsDir();
  fs.mkdirSync(outDir, { recursive: true });

  const range = {
    from: options.startDate,
    to: options.endDate,
  };

  const results: StripeSyncResult['accounts'] = [];

  for (const account of filtered) {
    const apiKey = process.env[account.env_key];
    if (!apiKey) {
      console.warn(`[ted] Stripe "${account.name}" ignoré: ${account.env_key} absent`);
      continue;
    }

    const txs = await stripeListBalanceTransactions(apiKey, account, range);
    const normalized = txs.map((tx) => transformStripeTx(tx, account));
    const file = path.join(outDir, `stripe-${account.id}.json`);
    fs.writeFileSync(file, JSON.stringify(normalized, null, 2));
    results.push({ id: account.id, name: account.name, count: normalized.length, file });
  }

  return { accounts: results };
}

import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../core/load-env.js';
import { transactionsDir } from '../core/paths.js';
import { syncAccountData, type AccountsSyncSummary } from '../connectors/accounts.js';
import { runAnalyze } from './analyze.js';

export interface SyncOptions {
  /** Supprime les JSON existants dans ~/.ted/data/transactions avant la sync. */
  clearCache?: boolean;
  /** Reconstruit le graphe après la synchronisation (`ted analyze` sans re-sync API). */
  analyze?: boolean;
}

export function clearTransactionsCache(): void {
  const dir = transactionsDir();
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    fs.unlinkSync(path.join(dir, name));
  }
}

export async function runSync(opts: SyncOptions = {}): Promise<AccountsSyncSummary> {
  loadEnv();

  if (opts.clearCache) {
    clearTransactionsCache();
    console.log(`[ted] Cache transactions vidé (${transactionsDir()})`);
  }

  const summary = await syncAccountData();

  console.log('[ted] Sync terminée');
  console.log(`  API: ${summary.providersSynced.join(', ') || '—'}`);
  console.log(`  Cache: ${summary.providersCached.join(', ') || '—'}`);
  console.log(`  Comptes: ${summary.accountCount}, Transactions: ${summary.transactionCount}`);
  if (summary.warnings.length > 0) {
    for (const w of summary.warnings) console.warn(`[ted] ${w}`);
  }
  if (summary.providersSynced.length === 0 && summary.transactionCount === 0) {
    console.log(
      '[ted] Aucune donnée synchronisée. Vérifiez ~/.ted/.env et ~/.ted/company.json, puis relancez.',
    );
  } else if (!opts.analyze) {
    console.log('[ted] Lancez `ted analyze` (ou `ted sync --analyze`) pour mettre à jour le graphe.');
  }

  if (opts.analyze) {
    await runAnalyze({ ingestTransactions: true, datagouv: false });
  }

  return summary;
}

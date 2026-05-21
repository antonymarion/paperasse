import fs from 'node:fs';
import { companyConfigPath } from '../core/paths.js';

export interface TedCompanyConfig {
  name?: string;
  siren?: string;
  fiscal_year?: { start?: string; end?: string };
  banks?: { id: string; name: string; account?: string }[];
  qonto?: { enabled?: boolean };
  stripe_accounts?: { id: string; name: string; env_key: string; stripe_account_id?: string }[];
}

export function loadCompanyConfig(): TedCompanyConfig | null {
  const p = companyConfigPath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as TedCompanyConfig;
}

export function fiscalYearRange(company: TedCompanyConfig | null): {
  from?: string;
  to?: string;
} {
  const start = company?.fiscal_year?.start;
  const end = company?.fiscal_year?.end;
  if (start) {
    return {
      from: `${start}T00:00:00Z`,
      to: end ? `${end}T23:59:59Z` : undefined,
    };
  }
  const year = new Date().getFullYear();
  return {
    from: `${year}-01-01T00:00:00Z`,
    to: `${year}-12-31T23:59:59Z`,
  };
}

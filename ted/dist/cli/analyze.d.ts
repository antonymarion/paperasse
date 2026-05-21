import type { IndexMeta } from '../core/types.js';
export interface AnalyzeOptions {
    repo?: string;
    datagouv?: boolean;
    datagouvQuery?: string;
}
export declare function runAnalyze(opts?: AnalyzeOptions): Promise<IndexMeta>;
export declare function runStatus(repo?: string): Promise<void>;
export declare function resolveRepo(cwd?: string): string;

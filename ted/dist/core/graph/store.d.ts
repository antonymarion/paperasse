import type { IndexMeta, KnowledgeGraph, QueryHit } from '../types.js';
export declare class GraphStore {
    private readonly indexDir;
    private db;
    private conn;
    readonly engine: 'ladybug' | 'json-fallback';
    private jsonPath;
    constructor(indexDir: string);
    open(): Promise<void>;
    saveGraph(graph: KnowledgeGraph, meta: IndexMeta): Promise<void>;
    loadGraphJson(): KnowledgeGraph;
    loadMeta(): IndexMeta | null;
    query(text: string, limit?: number): Promise<QueryHit[]>;
    cypher(query: string): Promise<unknown>;
    context(nodeId: string, depth?: number): KnowledgeGraph;
}
export declare function defaultIndexDir(repoRoot: string): string;
export declare function ladybugDatabasePath(repoRoot: string): string;

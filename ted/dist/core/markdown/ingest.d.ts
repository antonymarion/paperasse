import type { KnowledgeGraph } from '../types.js';
export declare function buildGraphFromRepo(repoRoot: string): Promise<KnowledgeGraph>;
export declare function mergeGraphs(base: KnowledgeGraph, extra: KnowledgeGraph): KnowledgeGraph;

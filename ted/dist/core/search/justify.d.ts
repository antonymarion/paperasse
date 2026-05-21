import type { GraphNode, JustifyResult } from '../types.js';
import type { GraphStore } from '../graph/store.js';
export declare function justifyAnswer(store: GraphStore, question: string, draft?: string): Promise<JustifyResult>;
export declare function graphStats(nodes: GraphNode[]): Record<string, number>;

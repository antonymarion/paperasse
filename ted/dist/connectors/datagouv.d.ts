import type { KnowledgeGraph } from '../core/types.js';
export interface DatagouvDataset {
    id: string;
    title: string;
    url: string;
    organization?: string;
    tags: string[];
}
export declare function fetchDatagouvDatasets(query?: string, pageSize?: number): Promise<DatagouvDataset[]>;
export declare function datasetsToGraph(datasets: DatagouvDataset[]): KnowledgeGraph;

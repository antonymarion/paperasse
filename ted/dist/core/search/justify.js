export async function justifyAnswer(store, question, draft) {
    const hits = await store.query(question, 8);
    const graph = store.loadGraphJson();
    const citations = hits.map((h) => {
        const node = graph.nodes.find((n) => n.id === h.id);
        const props = node?.properties ?? {};
        return {
            nodeId: h.id,
            label: h.label,
            name: h.name,
            excerpt: String(props['path'] ?? h.name),
            skill: props['skill'],
            document: props['path'],
        };
    });
    const summaryParts = [
        `Question : ${question}`,
        draft ? `Proposition à justifier : ${draft}` : null,
        citations.length
            ? `${citations.length} source(s) trouvée(s) dans l'ontologie skills (Markdown indexé).`
            : 'Aucune source directe — enrichissez l\'index ou précisez la question.',
    ].filter(Boolean);
    return {
        question,
        summary: summaryParts.join('\n'),
        citations,
    };
}
export function graphStats(nodes) {
    const counts = {};
    for (const n of nodes) {
        counts[n.label] = (counts[n.label] ?? 0) + 1;
    }
    return counts;
}

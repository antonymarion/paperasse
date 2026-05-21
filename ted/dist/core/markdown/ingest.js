import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import fg from 'fast-glob';
const SKILL_DIRS = [
    'comptable',
    'fiscaliste',
    'controleur-fiscal',
    'commissaire-aux-comptes',
    'notaire',
    'syndic',
];
function slug(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
}
function nodeId(label, ...parts) {
    return `${label}:${parts.map(slug).join(':')}`;
}
function extractConcepts(text) {
    const concepts = new Set();
    for (const m of text.matchAll(/\*\*([^*]{3,80})\*\*/g))
        concepts.add(m[1].trim());
    for (const m of text.matchAll(/`([A-Za-z0-9_./-]{3,60})`/g))
        concepts.add(m[1].trim());
    for (const m of text.matchAll(/\b(20\d{2}[A-Z0-9-]{0,12})\b/g))
        concepts.add(m[1]);
    return [...concepts].slice(0, 40);
}
function extractLinks(text, baseDir) {
    const links = [];
    for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
        const target = m[1].split('#')[0];
        if (target.endsWith('.md') && !target.startsWith('http')) {
            links.push(path.normalize(path.join(baseDir, target)));
        }
    }
    return links;
}
function parseMarkdownFile(absPath, repoRoot, skillName, graph) {
    const raw = fs.readFileSync(absPath, 'utf-8');
    const { content } = matter(raw);
    const rel = path.relative(repoRoot, absPath).replace(/\\/g, '/');
    const docId = nodeId('Document', rel);
    graph.nodes.push({
        id: docId,
        label: 'Document',
        name: path.basename(absPath),
        properties: { path: rel, skill: skillName },
    });
    const skillId = nodeId('Skill', skillName);
    graph.edges.push({
        id: `e:${skillId}->${docId}`,
        from: skillId,
        to: docId,
        label: 'CONTAINS',
    });
    const lines = content.split('\n');
    let sectionStack = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            const level = heading[1].length;
            const title = heading[2].trim();
            while (sectionStack.length && sectionStack[sectionStack.length - 1].level >= level) {
                sectionStack.pop();
            }
            const secId = nodeId('Section', rel, title, String(i));
            graph.nodes.push({
                id: secId,
                label: 'Section',
                name: title,
                properties: { path: rel, skill: skillName, line: i + 1, level },
            });
            const parentId = sectionStack.length
                ? sectionStack[sectionStack.length - 1].id
                : docId;
            graph.edges.push({
                id: `e:${parentId}->${secId}`,
                from: parentId,
                to: secId,
                label: 'CONTAINS',
            });
            sectionStack.push({ level, id: secId });
            if (/^(règle|rule|article|obligation|définition)/i.test(title)) {
                const ruleId = nodeId('Rule', rel, title, String(i));
                graph.nodes.push({
                    id: ruleId,
                    label: 'Rule',
                    name: title,
                    properties: { path: rel, skill: skillName },
                });
                graph.edges.push({
                    id: `e:${secId}->${ruleId}`,
                    from: secId,
                    to: ruleId,
                    label: 'DEFINED_IN',
                });
            }
            continue;
        }
        const block = lines.slice(i, Math.min(i + 8, lines.length)).join('\n');
        for (const concept of extractConcepts(block)) {
            const cId = nodeId('Concept', concept);
            if (!graph.nodes.some((n) => n.id === cId)) {
                graph.nodes.push({
                    id: cId,
                    label: 'Concept',
                    name: concept,
                    properties: {},
                });
            }
            const parent = sectionStack.length ? sectionStack[sectionStack.length - 1].id : docId;
            graph.edges.push({
                id: `e:${parent}->${cId}:${i}`,
                from: parent,
                to: cId,
                label: 'MENTIONS',
            });
        }
        for (const refPath of extractLinks(block, path.dirname(absPath))) {
            const refRel = path.relative(repoRoot, refPath).replace(/\\/g, '/');
            const refId = nodeId('Reference', refRel);
            if (!graph.nodes.some((n) => n.id === refId)) {
                graph.nodes.push({
                    id: refId,
                    label: 'Reference',
                    name: path.basename(refPath),
                    properties: { path: refRel },
                });
            }
            graph.edges.push({
                id: `e:${docId}->${refId}:${i}`,
                from: docId,
                to: refId,
                label: 'REFERENCES',
            });
        }
    }
}
export async function buildGraphFromRepo(repoRoot) {
    const graph = { nodes: [], edges: [] };
    for (const skillDir of SKILL_DIRS) {
        const skillPath = path.join(repoRoot, skillDir);
        if (!fs.existsSync(skillPath))
            continue;
        const skillId = nodeId('Skill', skillDir);
        graph.nodes.push({
            id: skillId,
            label: 'Skill',
            name: skillDir,
            properties: { path: skillDir },
        });
        const skillMd = path.join(skillPath, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
            parseMarkdownFile(skillMd, repoRoot, skillDir, graph);
        }
        const refs = await fg(['**/*.md', '**/*.mdx'], {
            cwd: skillPath,
            absolute: true,
            ignore: ['**/node_modules/**', '**/evals/**'],
        });
        for (const md of refs) {
            if (path.basename(md) === 'SKILL.md')
                continue;
            parseMarkdownFile(md, repoRoot, skillDir, graph);
        }
    }
    return graph;
}
export function mergeGraphs(base, extra) {
    const nodeIds = new Set(base.nodes.map((n) => n.id));
    const edgeIds = new Set(base.edges.map((e) => e.id));
    for (const n of extra.nodes) {
        if (!nodeIds.has(n.id)) {
            base.nodes.push(n);
            nodeIds.add(n.id);
        }
    }
    for (const e of extra.edges) {
        if (!edgeIds.has(e.id)) {
            base.edges.push(e);
            edgeIds.add(e.id);
        }
    }
    return base;
}

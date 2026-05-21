# TED

**TED** (Tax Expert Documents) indexe des skills Markdown et des jeux open data (data.gouv.fr) dans un graphe de connaissances queryable — UI web, API REST et serveur MCP pour justifier les réponses des agents IA.

Inspiré par les idées de [GitNexus](https://github.com/abhigyanpatwari/GitNexus) (graphe + MCP), orienté fiscalité/comptabilité française.

## Chaîne

1. Ingestion Markdown (skills, frontmatter)
2. Enrichissement optionnel data.gouv.fr
3. Ontologie LadybugDB + `graph.json`
4. Persistance dans `.ted/` à la racine du dépôt indexé

## Installation

```bash
cd ted
npm install
npm run build
```

Depuis la racine du monorepo :

```bash
npm run ted:install
npm run ted:build
```

## CLI

| Commande | Description |
|----------|-------------|
| `ted analyze` | Indexe skills Markdown + data.gouv.fr |
| `ted status` | Métadonnées de l'index |
| `ted serve` | UI + API REST (port 3847) |
| `ted mcp` | Serveur MCP stdio |

Options communes :

- `-r, --repo <path>` — racine du dépôt à indexer
- `--no-datagouv` — sans enrichissement data.gouv.fr

## MCP (Cursor / Claude)

```json
{
  "mcpServers": {
    "ted": {
      "command": "node",
      "args": ["C:/chemin/vers/ted/bin/ted.js", "mcp", "-r", "C:/chemin/vers/projet"]
    }
  }
}
```

Outils : `ted_status`, `ted_analyze`, `ted_query`, `ted_cypher`, `ted_context`, `ted_justify`.

## Licence

MIT

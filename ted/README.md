# TED

**TED** (Tax Expert Documents) indexe des skills Markdown et des jeux open data (data.gouv.fr) dans un graphe de connaissances queryable — UI web, API REST et serveur MCP pour justifier les réponses des agents IA.

Orienté **fiscalité et comptabilité française**.

## Rôle de TED

TED est la couche **cognitive** de votre environnement comptable : il ne saisit pas vos écritures ni ne produit votre liasse à votre place. Il rend l’accompagnement IA **fiable** en ancrant chaque réponse dans des sources indexées et interconnectées.

Typiquement, vous l’utilisez pour :

- comprendre **comment** imputer une opération (compte PCG, TVA, régime applicable) ;
- retrouver une **échéance** ou une règle fiscale avec sa source ;
- obtenir un **sous-graphe de contexte** autour d’un concept (ex. TVA déductible, micro-BNC, 44566) ;
- **vérifier** une proposition de l’agent avant de l’appliquer (`ted_justify`).

## Graphe de connaissances (GraphRAG)

### Chaîne d’indexation

1. Ingestion Markdown (skills, frontmatter, sections, liens internes)
2. Enrichissement optionnel data.gouv.fr
3. Ontologie LadybugDB + export `graph.json`
4. Persistance dans `.ted/` à la racine du dépôt indexé

### Structure de l’ontologie

**Types de nœuds**

| Label | Rôle |
|-------|------|
| `Skill` | Domaine métier (comptable, fiscaliste, etc.) |
| `Document` | Fichier Markdown indexé |
| `Section` | Titre / chapitre dans un document |
| `Concept` | Notion métier extraite (gras, codes, références) |
| `Term` | Terme technique |
| `Rule` | Règle ou procédure |
| `Reference` | Lien vers une autre source |
| `Dataset` | Jeu open data (data.gouv.fr) |

**Types de relations**

| Label | Signification |
|-------|---------------|
| `CONTAINS` | Skill → document → section |
| `MENTIONS` | Section ou document → concept |
| `REFERENCES` | Lien vers une autre ressource |
| `DEFINED_IN` | Concept défini dans un document |
| `RELATED_TO` | Concepts voisins |
| `SOURCED_FROM` | Donnée ancrée sur un dataset open data |

### Exemple de navigation

```
Skill (comptable)
  └─ CONTAINS → Document (TVA.md)
       └─ CONTAINS → Section « Déduction »
            └─ MENTIONS → Concept « TVA déductible »
                 └─ SOURCED_FROM → Dataset data.gouv.fr
```

Un RAG vectoriel retourne des paragraphes **similaires**. TED retourne un **réseau de sens** : la règle, son contexte documentaire, les concepts liés et, le cas échéant, la référence open data.

### Pourquoi c’est utile en autonomie ou en support fiable

1. **Traçabilité** — `ted_justify` cite les nœuds sources (skill, document, chemin).
2. **Contexte local** — `ted_context` extrait le sous-graphe autour d’un nœud (profondeur configurable).
3. **Requêtes structurées** — `ted_cypher` interroge LadybugDB en Cypher pour des parcours précis.
4. **Moins d’hallucinations plausibles** — l’agent doit s’appuyer sur l’index, pas inventer une règle.
5. **Open data** — barèmes, nomenclatures et jeux publics complètent vos skills privés.

> **Limite** : la qualité du support dépend de vos sources Markdown et de la réindexation (`ted analyze`) après chaque mise à jour. TED est un garde-fou intellectuel, pas un substitut à un professionnel pour les situations complexes ou engageantes.

## Installation

```bash
npm install -g ted
# ou
npx ted --version
```

Depuis les sources :

```bash
cd ted
npm install
npm run build
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

| Outil | Description |
|-------|-------------|
| `ted_status` | État de l’index (skills, nœuds, moteur) |
| `ted_analyze` | Réindexation skills + data.gouv.fr |
| `ted_query` | Recherche sémantique légère dans le graphe |
| `ted_cypher` | Requête Cypher sur LadybugDB |
| `ted_context` | Sous-graphe autour d’un nœud (justification locale) |
| `ted_justify` | Citations sources pour une question ou une proposition de réponse |

## Publication npm

Le package est publié sur [npm](https://www.npmjs.com/package/ted) via GitHub Actions :

- **CI** (`.github/workflows/ci.yml`) — build + `npm pack --dry-run` sur chaque push/PR `main` ; artefact `.tgz` téléchargeable
- **Publish** (`.github/workflows/publish-npm.yml`) — `npm publish` à la création d'une **GitHub Release**

Configurer le secret **`NPM_TOKEN`** dans les paramètres du repo (token npm avec permission publish). Publier une release en incrémentant `version` dans `ted/package.json`.

Installation depuis un artefact CI :

```bash
npm install -g ./ted-0.1.0.tgz
```

## Licence

MIT

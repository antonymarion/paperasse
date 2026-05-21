# TED — Tax Expert Documents

**TED** indexe des skills Markdown et des jeux open data (data.gouv.fr) dans un **graphe de connaissances** interrogeable — pour des réponses d’agents IA **ancrées, traçables et vérifiables** en fiscalité et comptabilité française.

Ce dépôt contient le package npm [`ted/`](ted/README.md) (CLI, MCP, UI web, API REST).

## À quoi sert TED ?

TED ne remplace pas un logiciel comptable : il **structure le savoir métier** (règles PCG, TVA, IS, échéances, concepts fiscaux, références open data) afin qu’un agent IA ou un utilisateur autonome puisse :

- poser des questions en langage naturel ;
- obtenir un **contexte local** autour des concepts pertinents ;
- **justifier** chaque réponse avec des citations vers les sources indexées.

## Intérêt du graphe (GraphRAG)

Contrairement à un RAG vectoriel classique (chunks de texte similaires), TED construit une **ontologie relationnelle** :

- **Nœuds** : skills, documents, sections, concepts, termes, règles, références, datasets open data
- **Relations** : contient, mentionne, référence, défini dans, lié à, sourcé depuis

Cela permet de naviguer entre une règle comptable, la section qui la décrit, les concepts associés et les jeux data.gouv.fr — plutôt que d’isoler un paragraphe sans lien.

**Bénéfices pour une gestion autonome ou un support fiable :**

| Bénéfice | Description |
|----------|-------------|
| Traçabilité | Chaque réponse peut être reliée à un document ou skill précis |
| Contexte structuré | Remontée des sections, skills et concepts connexes |
| Cohérence métier | Liens explicites entre PCG, TVA, IS, échéances et open data |
| Vérifiabilité | L’utilisateur contrôle le conseil à la source, pas seulement la formulation IA |
| Ancrage officiel | Enrichissement optionnel via data.gouv.fr |

## Démarrage rapide

```bash
npm install -g ted
ted analyze
ted serve
```

- **`ted analyze`** — met à jour data.gouv.fr et reconstruit le graphe dans `~/.ted/index`
- **`ted serve`** — UI graphe (force-graph) + API REST + MCP HTTP sur le port 3847

Documentation complète : [ted/README.md](ted/README.md).

## Licence

MIT

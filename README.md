# Commerce Agent Protocol (CAP)

**Une couche standard entre les catalogues e-commerce et les agents IA qui achètent pour des humains.**

---

## En bref

| Aujourd’hui | CAP |
|-------------|-----|
| L’agent scrape le HTML, devine prix/stock, casse à chaque refonte | **Catalogue structuré + recherche sémantique + API** pensées pour les LLM |
| Le marchand jongle entre flux fermés et zéro visibilité agent | **Connexion type Shopify → données enrichies → outils MCP / REST** |

Ce dépôt est une **implémentation de référence** (proto SaaS) : API Hono, dashboard marchand, sync Shopify, embeddings pgvector, serveur MCP.

---

## Architecture

```
Shopify ──► sync ──► PostgreSQL (pgvector) ──► /v1/search · /v1/compare
                              │
                              └── MCP (stdio) pour Claude / clients compatibles
```

Fichiers détail : [`cap_system_architecture_overview.svg`](cap_system_architecture_overview.svg) · [`cap_data_flow_product_to_agent.svg`](cap_data_flow_product_to_agent.svg)

---

## Prérequis

- Node **≥ 22**
- **pnpm** ≥ 9
- **Docker** (Postgres + Redis)

---

## Démarrage rapide

```bash
# 1. Base locale (Postgres pgvector + Redis)
docker compose up -d

# 2. Variables d’environnement
cp .env.example .env
# Renseigne au minimum : DATABASE_URL, REDIS_URL,
# OPENAI_API_KEY, ENCRYPTION_KEY (32 caractères), clés Shopify si tu branches une boutique.

# 3. Dépendances & schéma DB
pnpm install
pnpm db:generate
pnpm db:push

# 4. API + dashboard (Turbo)
pnpm dev
```

Par défaut : API **`http://localhost:3000`**, dashboard **`http://localhost:3001`**.

**Workers** (sync catalogue + enrichissement LLM) : lancer à part, par ex.

```bash
pnpm --filter=@cap/api exec tsx watch src/workers/enrichment.worker.ts
pnpm --filter=@cap/api exec tsx watch src/workers/catalog-sync.worker.ts
```

(Documentation OpenAPI servie par l’API : **`GET /openapi.json`**.)

---

## Structure du monorepo

| Dossier | Rôle |
|---------|------|
| `apps/api` | Hono — OAuth Shopify, webhooks, recherche, MCP |
| `apps/dashboard` | Next.js — vue marchand |
| `packages/db` | Prisma + schéma Postgres |
| `packages/shared` | Schémas Zod & utilitaires |

---

## Licence & statut

Projet en **v0.1** — spec ouverte et périmètre produit en évolution.  
Issues et PR bienvenues sur ce repo.

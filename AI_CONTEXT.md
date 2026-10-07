# Commerce Agent Protocol (CAP) — AI Context

Updated: 2026-10-08

## Purpose

Open protocol (spec v0.1, Apache-2.0) plus reference implementation that lets AI agents search a merchant catalog, compare products and start a checkout. The shopper always completes payment on the merchant's Shopify checkout; agents never pay.

## Project classification

Prototype / unrelated standalone product. No paying user, no adopter, no production deployment. Keep it local until the positioning is validated with merchants (see Known risks).

## Architecture

- pnpm 9 + Turbo monorepo, Node 22, TypeScript.
- `apps/api`: Hono API. `POST /v1/search` (pgvector cosine + lexical fallback), `POST /v1/compare`, `POST /v1/checkout/initiate` (Shopify Storefront `cartCreate`), Shopify OAuth (`/shopify/*`), webhooks (`/webhooks/shopify`), operations (`/internal/operations/*`, dedicated token), `/openapi.json`.
- `apps/api/src/workers`: BullMQ catalog sync (Admin GraphQL `2026-07`, active products only) and enrichment (GPT-4o-mini strict structured output + `text-embedding-3-small`, GEO score).
- `apps/api/src/mcp`: stdio MCP server (3 tools), bound to one merchant through `CAP_MERCHANT_ID`; reads the database directly.
- `apps/dashboard`: Next.js 15, own HMAC session cookies, scrypt passwords, roles OWNER/ADMIN/ANALYST, invitations, API keys.
- `apps/site`: Next.js marketing site.
- `packages/db`: Prisma 5.22 schema + SQL migrations (Postgres 16 + pgvector). `packages/shared`: zod schemas, GEO score.
- Tenancy: every API key belongs to exactly one merchant; every query filters on `merchant_id`. No cross-merchant search, no agent identity.

## Infrastructure

- Planned: Render blueprints `render.yaml` (production) and `render.staging.yaml` (Frankfurt; Postgres, Key Value, API, 2 workers, dashboard). As of 2026-10-07 the custom domains `api.`, `api-staging.` and `dashboard.cap-protocol.org` do not resolve. Whether Render services exist without those domains is unknown: the Render account was not inspected.
- Vercel project `commerce-agent-protocol-site` (team "T4C2's projects") serves `commerce-agent-protocol-site.vercel.app`; Dependabot branches create preview deployments.
- `cap-protocol.org` currently serves another site through Cloudflare (see `docs/PRODUCTION_DEPLOYMENT.md`).
- Secrets live only in provider dashboards and the git-ignored `.env` (`apps/dashboard/.env` is a symlink to it).

## Commands

- Install: `pnpm install`; Prisma client: `pnpm db:generate`.
- Local services: `docker compose up -d` (Postgres pgvector on 5432, Redis on 6379).
- Migrations: `pnpm db:migrate` (`prisma migrate deploy`); drift check: `pnpm db:check-drift` (needs a migrated database).
- Dev: `pnpm dev`; workers: `pnpm dev:workers`; MCP: `CAP_MERCHANT_ID=<uuid> pnpm --silent -C apps/api mcp`.
- Checks: `pnpm lint` (tsc for api/shared, ESLint for Next apps), `pnpm test` (API integration tests need Postgres + Redis), `pnpm build`.

## Stable decisions

- Certifications and comparable products come only from merchant metafields `cap.certifications` / `cap.comparison_tags`; the LLM never produces claims (EU Directive 2024/825). `trust_score` was removed; `winner_by_eco` became `winner_by_certifications`.
- Only Shopify products with status `active` are synced, searchable, comparable and purchasable.
- Example secrets are rejected at boot (API, workers, MCP, dashboard). Production requires `ENCRYPTION_KEY` as 64 hex chars or base64 of 32 bytes; new ciphertexts use the `v2:` format; `ENCRYPTION_KEY_PREVIOUS` supports rotation.
- No `db:push`: schema changes ship as migrations, CI checks drift. The pgvector `embedding` column is declared `Unsupported("vector(1536)")`.
- Owner sign-in after OAuth requires a same-origin confirmation POST (`/session/confirm`); invitation acceptance never checks passwords for existing accounts.
- Dashboard sessions carry the membership version (`mv` = `merchant_members.session_version`, an atomically incremented counter); role changes, revocations, re-invitations and owner reinstatement sign that member out everywhere, routine OAuth re-authorization does not. Password hashes store their scrypt parameters (`scrypt$N=…,r=…,p=…$salt$key`) and are upgraded on login.
- Enrichment calls OpenAI only when `products_enriched.source_hash` (content + `ENRICHMENT_VERSION`) changes; bump `ENRICHMENT_VERSION` after prompt or schema changes.
- `POST /v1/checkout/initiate` supports `Idempotency-Key` (stored on `agent_checkouts`; the first outcome, success or error, is replayed with `Idempotent-Replayed: true`; keys are never released, an unfinished attempt answers `IDEMPOTENCY_KEY_OUTCOME_UNKNOWN`).
- GDPR: Shopify compliance topics handled on `/webhooks/shopify`; daily `maintenance` job (03:00 UTC, catalog worker) purges agent queries after 180 days and webhook receipts after 30 days.
- Processes run `node` as PID 1 and drain on SIGTERM; every Render service runs `pnpm db:migrate` before deploy.

## Known risks and constraints

- Strategic: Google + Shopify UCP (Jan 2026) and OpenAI + Stripe ACP (Sep 2025) cover the same ground, and Shopify reportedly enables UCP and native MCP servers for its merchants. CAP only supports Shopify. Positioning decision pending (recommended: GEO/catalog-quality layer that feeds UCP/ACP).
- MCP is stdio-only with direct database access and the master encryption key; not usable as a remote connector.
- No email verification (invitation email squatting), no observability vendor (Sentry or similar), no remote MCP transport.

## Current delivery milestone

P0 hardening (PR #34, branch `chore/p0-hardening`) and P2 reliability (branch `chore/p2-reliability`, stacked on it), 2026-10-08. Next: merge both, then the P1 strategic decision.

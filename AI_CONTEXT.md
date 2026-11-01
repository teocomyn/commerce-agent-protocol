# Commerce Agent Protocol (CAP) — AI Context

Updated: 2026-11-01

## Purpose

Open protocol (spec v0.1, Apache-2.0) plus reference implementation that lets AI agents search a merchant catalog, compare products and start a checkout. The shopper always completes payment on the merchant's Shopify checkout; agents never pay.

## Project classification

Prototype / unrelated standalone product. No paying user, no adopter, no production deployment. Positioning decided on 2026-11-01: CAP becomes the agent-readiness and catalog-quality layer that feeds UCP, Shopify Catalog, ChatGPT and Gemini (option A, `docs/ADR-0001-positioning-agent-readiness.md`). It is not a competing checkout protocol.

## Architecture

- pnpm 9 + Turbo monorepo, Node 22, TypeScript.
- `apps/api`: Hono API. `POST /v1/search` (pgvector cosine + lexical fallback), `POST /v1/compare`, `POST /v1/checkout/initiate` (Shopify Storefront `cartCreate`), Shopify OAuth (`/shopify/*`), webhooks (`/webhooks/shopify`), operations (`/internal/operations/*`, dedicated token), `/openapi.json`.
- `apps/api/src/workers`: BullMQ catalog sync (Admin GraphQL `2026-07`, active products only) and enrichment (GPT-4o-mini strict structured output + `text-embedding-3-small`, GEO score).
- `apps/api/src/mcp`: MCP server (3 tools) built on the shared services in `apps/api/src/services`. Over stdio it is bound to one merchant through `CAP_MERCHANT_ID` and reads the database directly; over Streamable HTTP (`/mcp` on the API) the API key decides the merchant.
- `apps/dashboard`: Next.js 15, own HMAC session cookies, scrypt passwords, roles OWNER/ADMIN/ANALYST, invitations, API keys.
- `apps/site`: Next.js marketing site.
- `packages/db`: Prisma 5.22 schema + SQL migrations (Postgres 16 + pgvector). `packages/shared`: zod schemas, GEO score.
- Tenancy: every API key belongs to exactly one merchant; every query filters on `merchant_id`. No cross-merchant search, no agent identity.

## Infrastructure

- Render blueprints `render.yaml` (production) and `render.staging.yaml` exist but were never synced: verified on 2026-11-01, `api.`, `api-staging.`, `dashboard.` and `dashboard-staging.cap-protocol.org` have no DNS records, no Render CLI or key is configured on the development machine, and the staging environment is intentionally not created until a pilot merchant exists (paid resources need explicit approval).
- Vercel project `commerce-agent-protocol-site` (team `t4c2s-projects`, id `prj_KDJojzsG8rOpVYQbnhhL2fvLfrCN`) serves `commerce-agent-protocol-site.vercel.app` from `main`; it is the only deployed component. Dependabot branches create preview deployments.
- `cap-protocol.org` serves an unrelated site titled "CLI Agent Protocol" through Cloudflare (domain registered 2026-05-18 at Namecheap, private WHOIS). Ownership is unconfirmed: do not rely on the domain in artefacts until Teo confirms.
- No Shopify Partners app has ever been created: `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` are placeholders everywhere, so the OAuth → sync → checkout path has only run against mocked Shopify responses.
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
- `POST /v1/checkout/initiate` supports `Idempotency-Key`. Only keyed requests that reach checkout creation are recorded on `agent_checkouts` (with the request hash and, once known, the response); requests rejected before (validation, not found, out of stock) do not consume the key. A recorded outcome, success or error, is replayed with `Idempotent-Replayed: true`; a different body answers `IDEMPOTENCY_KEY_REUSED`; an unfinished attempt answers `IDEMPOTENCY_KEY_IN_PROGRESS` until it is older than `IDEMPOTENCY_IN_PROGRESS_MS` (at least 2 minutes, longer than the bounded Shopify call), then `IDEMPOTENCY_KEY_OUTCOME_UNKNOWN`. Keys are never released.
- GDPR: Shopify compliance topics handled on `/webhooks/shopify`; daily `maintenance` job (03:00 UTC, catalog worker) purges agent queries after 180 days and webhook receipts after 30 days.
- Processes run `node` as PID 1 and drain on SIGTERM; every Render service runs `pnpm db:migrate` before deploy.
- zod 4 everywhere (3.x has no fix for GHSA-mrhx-c7xc-m3w5). Ids are validated with `z.guid()` (any 8-4-4-4-12 form, like the Postgres `uuid` columns), not the version-checked `uuid()`. MCP tool input schemas come from the native `z.toJSONSchema(schema, { target: 'draft-7', io: 'input' })`; validation error `details` use `z.flattenError` and keep the `{ formErrors, fieldErrors }` shape.
- `stripHtml` is a linear tag scanner plus a single-pass entity decode (no regex backtracking, no double-unescape).
- Next.js floor is 15.5.28 (GHSA-2464-fhr4-w9xw image-optimizer RCE). `openai` stays on 4.104 for now: the code uses hand-written JSON schemas, not the SDK zod helpers, so the zod peer warning is inert; moving to openai 7 is a separate change.
- vitest 4 with vite 7; `dist/` is excluded from test collection.

## Known risks and constraints

- Strategic (decided, see ADR-0001): Shopify ships a UCP Storefront MCP per store, a cross-merchant catalog MCP, Agentic Storefronts and a $0 Agentic Plan for non-Shopify brands; OpenAI scaled in-chat checkout back. CAP therefore pivots to agent-readiness scoring and catalog quality. The checkout endpoint, remote MCP product and the spec-as-standard are no longer promises; the code stays until replaced.
- Remote MCP (`/mcp`) authenticates with an API key (Bearer or `X-CAP-Key`); OAuth, which web connectors such as Claude.ai require, is not implemented. The stdio server still needs direct database access and the master encryption key.
- No email verification (invitation email squatting), no observability vendor (Sentry or similar). The readiness score is not yet calibrated on real catalogs.

## Current delivery milestone

Security and CI recovery plus the positioning decision, branch `chore/security-ci-positioning-2026-11` (2026-11-01): Next 15.5.28, zod 4, dependency overrides, vitest 4, CodeQL fixes, CHANGELOG 0.2.0-alpha, ADR-0001. Next: merge, tag `v0.2.0-alpha`, first real Shopify dev-store install, Agent Readiness Score v1.

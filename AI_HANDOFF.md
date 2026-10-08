# AI Handoff

Updated: 2026-10-08
Agent/tool: Claude Code (with a sub-agent for apps/dashboard)
Branch: `main`. PR #34 (P0 hardening), PR #35 (P2 reliability) and PR #36 (P4 platform) are merged (`12dc48b`).

## Status of earlier work

- P0 hardening (PR #34), P2 reliability (PR #35) and P4 platform (PR #36) are merged into `main` (2026-10-08).
- Workflow from now on: every change goes through a PR with GitHub auto-merge (merge commit). The repository has "Allow auto-merge" enabled at the user's request. `main` requires "Build & typecheck" and CodeQL, and branches must be up to date.

## P2 reliability (PR #35, merged)

- Graceful shutdown (`apps/api/src/lib/shutdown.ts`) for the API and both workers; Docker images run `node`/Next as PID 1; Render runs `pnpm db:migrate` before every service.
- API Redis client fails fast (2 s); rate limiting fails open; search cache invalidation is an O(1) per-merchant generation bump.
- Enrichment pipeline extracted to `apps/api/src/lib/enrichment-pipeline.ts`: LLM/embedding skipped when `source_hash` is unchanged, per-location inventory levels carried over on re-sync, snapshots scheduled after the product row exists, jobs for uninstalled/erased shops skipped.
- `Idempotency-Key` on checkout (migration `20261008091000_checkout_idempotency`), documented in the spec and served OpenAPI.
- GDPR: `customers/data_request`, `customers/redact`, `shop/redact` handlers; daily retention job (`apps/api/src/lib/retention.ts`); app uninstall revokes pending invitations and sign-in links.
- Dashboard: per-account + per-IP login limits, session revocation by membership version, scrypt parameters stored in hashes with rehash-on-login, zod validation and correct status codes on all API routes, error messages in the UI, role-based controls, TypeScript strict mode.
- Docs: OPERATIONS (retention, GDPR, shutdown, deploys), SHOPIFY_E2E, DASHBOARD_AUTH, README, CHANGELOG, `.env.example`.

## Review rounds (2026-10-08)

- PR #34: 57 review threads fixed and resolved (latest: `024d7db`). This includes:
  - dashboard origins from `DASHBOARD_URL`, which fail closed and are validated at boot in production;
  - the owner confirmation bound to the merchant it displays;
  - invitation viewer states;
  - claim filtering of `care_info` and `summary`;
  - the guessability check for canonical and previous keys;
  - compare-and-set in `reencrypt-tokens`;
  - catalog sync: inactive products only update their status;
  - resync deduplication per shop.
- PR #35 (this branch, `chore/p2-reliability`): P0 merged in (`9f7f11f`):
  - the Storefront token is decrypted before the checkout row exists;
  - `ENRICHMENT_VERSION` is bumped to `2026-10-08.2`;
  - the `shopify_updated_at` guard is now atomic with the raw product write (`bce3e11`).
  - All 35 threads are resolved.

## Validation

- `chore/p2-reliability` at `bce3e11`, run against pgvector Postgres and Redis in throwaway Docker containers:
  - API: 124 tests. Dashboard: 71 tests.
  - Lint, build, `pnpm audit --prod` and the drift check pass.
- `chore/p0-hardening` at `024d7db`: API 103 tests and dashboard 32 tests; the same checks pass.
- Compiled API and both workers exit 0 on SIGTERM after draining.
- Not exercised at runtime: dashboard flows with a real signed-in session (unit-tested pure functions only), real OpenAI/Shopify calls.

## Behaviour changes to announce

- Every dashboard user signs in once more after deploy (old cookies have no membership version).
- 10 failed logins per account per 15 minutes lock that account for up to 15 minutes, whoever makes them.
- Re-running a full catalog sync is now cheap: unchanged products skip OpenAI.

## Blockers and decisions needed

- Configure the three Shopify compliance topics in the app settings before an App Store submission; legal review of erasure.
- Email verification for invitations and an error-tracking vendor need product/billing decisions.
- Strategic positioning vs UCP/ACP (P1).

## P4 platform (PR #36, merged)

- Docker images: two-stage builds, runtime holds production dependencies only and runs as `node`; base pinned by version and digest (API 1.56 GB → 529 MB, dashboard 1.64 GB → 725 MB). Verified locally: migrations as `node`, API `/ready`, worker drain on SIGTERM, dashboard pages with Prisma.
- CI: runs on every PR (stacked ones too), actions pinned by SHA, job timeouts, `/ready` + `/openapi.json` smoke test, Docker image build job that checks the image is non-root; Dependabot watches the Docker base image.
- Migration `20261008160000_foreign_key_indexes`: indexes on the 7 foreign keys that had none.
- Dashboard route tests: session, role and merchant scoping on the keys and team routes, and the cross-origin rejection on every mutating route (login, invitation acceptance, logout and owner sign-in included). Login and invitation logic keep their own unit tests.
- Site: no button inside a link, canonical URL, particles and globe lazy-loaded and still under reduced motion (first-load JS 200 kB → 154 kB).

## Shared commerce services (PR #42, merged)

- `apps/api/src/services/` holds search, compare and checkout. The REST routes and the MCP tools both call them: same validation (MCP tool schemas are generated from the shared zod schemas), visibility rules, errors, search cache, agent-query logging and idempotency (`commerce_checkout` takes `idempotency_key`).
- MCP tools take the REST request bodies and return the REST response bodies. Breaking for MCP clients: search filters are under `filters`.
- Next step for this layer: a remote MCP endpoint (Streamable HTTP, API-key auth) on top of `mcp/tools.ts` (backlog item 24).

## Next concrete action

- Deploy `main` (Render blueprint + Vercel), then check `/ready`, the dashboard sign-in and one Shopify install on staging.
- Then the open decisions above: strategic positioning vs UCP/ACP (P1: A, a GEO/catalog-quality layer that feeds UCP and ACP, recommended in AI_CONTEXT.md; or B, UCP/ACP adapters for non-Shopify stores), Sentry or another error tracker, and email delivery for invitations.
- No manual resync is needed after deploying. The catalog worker re-enriches every active shop automatically, 10 minutes after starting, because `ENRICHMENT_VERSION` changed. This sets `shopify_updated_at` and re-applies claim filtering.

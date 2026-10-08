# AI Handoff

Updated: 2026-10-08
Agent/tool: Claude Code (with a sub-agent for apps/dashboard)
Branch: `chore/p2-reliability` = PR #35 (→ `main`, contains all of PR #34). P0 is `chore/p0-hardening` = PR #34 (→ `main`).

## Status of earlier work

- P0 hardening is in PR #34 (`chore/p0-hardening` → `main`). Its required checks passed (Build & typecheck incl. the drift check, CodeQL). Merging was blocked by the agent's auto-mode guard ("merge without review"): the user must merge it, or allow merges for the agent.

## Completed in this branch (P2 reliability)

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

- Merge PR #34 (`chore/p0-hardening`), then PR #35 (`chore/p2-reliability`).
- Configure the three Shopify compliance topics in the app settings before an App Store submission; legal review of erasure.
- Email verification for invitations and an error-tracking vendor need product/billing decisions.
- Strategic positioning vs UCP/ACP (P1).

## P4 platform branch (`chore/p4-platform`, stacked on PR #35)

- Docker images: two-stage builds, runtime holds production dependencies only and runs as `node`; base pinned by version and digest (API 1.56 GB → 529 MB, dashboard 1.64 GB → 725 MB). Verified locally: migrations as `node`, API `/ready`, worker drain on SIGTERM, dashboard pages with Prisma.
- CI: runs on every PR (stacked ones too), actions pinned by SHA, job timeouts, `/ready` + `/openapi.json` smoke test, Docker image build job that checks the image is non-root; Dependabot watches the Docker base image.
- Migration `20261008160000_foreign_key_indexes`: indexes on the 7 foreign keys that had none.
- Dashboard route tests: auth, roles, origin and merchant scoping on every API route.
- Site: no button inside a link, canonical URL, particles and globe lazy-loaded and still under reduced motion (first-load JS 200 kB → 154 kB).

## Next concrete action

- The user merges PR #34 (`chore/p0-hardening`), then PR #35 (`chore/p2-reliability`). The agent's auto-mode guard blocks `gh pr merge`.
- No manual resync is needed after deploying. The catalog worker re-enriches every active shop automatically, 10 minutes after starting, because `ENRICHMENT_VERSION` changed. This sets `shopify_updated_at` and re-applies claim filtering.

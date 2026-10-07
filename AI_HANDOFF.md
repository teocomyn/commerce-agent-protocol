# AI Handoff

Updated: 2026-10-08
Agent/tool: Claude Code (with a sub-agent for apps/dashboard)
Branch: `chore/p2-reliability`, stacked on `chore/p0-hardening` (PR #34)

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

## Validation

- API: 109 tests (21 integration + 6 enrichment pipeline against pgvector Postgres + Redis in Docker). Dashboard: 63 tests. Drift check passes with the two new migrations.
- Compiled API and both workers exit 0 on SIGTERM after draining.
- Not exercised at runtime: dashboard flows with a real signed-in session (unit-tested pure functions only), real OpenAI/Shopify calls.

## Behaviour changes to announce

- Every dashboard user signs in once more after deploy (old cookies have no membership version).
- 10 failed logins per account per 15 minutes lock that account for up to 15 minutes, whoever makes them.
- Re-running a full catalog sync is now cheap: unchanged products skip OpenAI.

## Blockers and decisions needed

- Merge PR #34, then the P2 PR (GitHub retargets it to `main` once `chore/p0-hardening` is merged and deleted).
- Configure the three Shopify compliance topics in the app settings before an App Store submission; legal review of erasure.
- Email verification for invitations and an error-tracking vendor need product/billing decisions.
- Strategic positioning vs UCP/ACP (P1).

## Next concrete action

- Watch CI on the P2 PR, merge #34 then the P2 PR.

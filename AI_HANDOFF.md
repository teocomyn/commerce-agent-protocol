# AI Handoff

Updated: 2026-10-07
Agent/tool: Claude Code (with sub-agents for apps/site and apps/dashboard)
Branch: `chore/p0-hardening` (from `main` at c951ad8), committed and opened as a PR to `main`

## Completed (P0 plan)

1. Marketing site: removed unsupported claims (adoption wall, "signed", multi-vendor/federation, latency figures, live network, fraud, "5 minutes", hosted SaaS, real brand in the demo). `apps/site/**`.
2. Paid resources inventory (read-only): no Render service answers on `api.`, `api-staging.` or `dashboard.cap-protocol.org` (no DNS). Vercel project `commerce-agent-protocol-site` exists on `*.vercel.app` only. Render account itself not inspected (no access from this session).
3. Claims: certifications and comparison tags only from merchant metafields; LLM schema no longer asks for them; migration `20261007120000_remove_generated_claims` clears generated values; `trust_score` removed; `winner_by_eco` → `winner_by_certifications` (spec + examples updated).
4. Schema safety: `embedding Unsupported("vector(1536)")`, `onDelete: Cascade` and SQL defaults mirrored in `schema.prisma`; `db:push` removed; `pnpm db:check-drift` added to CI (only the ivfflat index DROP is tolerated, Prisma 5 cannot express it).
5. Dashboard: password oracle removed from invitation acceptance (session of the invited user required), invitation rate limit (IP + token), owner sign-in confirmation page (`/session/confirm`, POST + same-origin), security headers, `/api/cap` rewrite removed.
6. Secrets: `assertRuntimeSecrets()` at API, worker and MCP start; dashboard `instrumentation.ts` exits on placeholder secret; `v2:` ciphertexts with full 32-byte keys, legacy ciphertexts still readable, `ENCRYPTION_KEY_PREVIOUS` for rotation.
7. Active products only: sync query `status:active`, enrichment skips the LLM for non-active products, search/compare/MCP filter `pr.status = 'active'`, checkout returns 404 otherwise.
8. `Dockerfile.dashboard` declares `ARG NEXT_PUBLIC_API_URL` and fails the build without it.
9. MCP: dedicated `src/mcp/stdio.ts` entrypoint, console routed to stderr, `pnpm --silent -C apps/api mcp`.
10. Local `.env` aligned (example `ENCRYPTION_KEY` regenerated, missing keys added with local random values, NextAuth keys commented out); AI context files created.

Also fixed while there: OpenAI strict structured-output schema (the previous one used open maps and optional keys), `/openapi.json` `Money` schema.

## Validation

- `pnpm lint`: 4/4 packages pass. `pnpm build`: 5/5 pass.
- `pnpm test` against a throwaway pgvector Postgres + Redis (Docker): API 96/96 (incl. 17 integration tests, new draft-visibility test), dashboard 24/24.
- `pnpm db:check-drift`: passes on a freshly migrated DB and fails on an injected schema change.
- MCP stdio smoke test: stdout contains only JSON-RPC responses; tools/list returns the 3 tools.
- Compiled API: refuses to start with the example `ENCRYPTION_KEY`; starts and `/ready` is OK with a hex key.
- `docker build -f Dockerfile.dashboard`: succeeds; bundle contains the build-arg API URL and no `localhost:3000`; no `.env` in the image; container exits 1 with the example session secret.
- Site checked in the browser preview (desktop + 375 px, no console errors, no horizontal scroll).
- Not exercised at runtime: dashboard routes needing Postgres/Redis (invitation consume, rate limits, owner confirmation consume); real OpenAI and Shopify calls.

## Uncommitted or sensitive areas

- None in Git: all P0 changes are committed on `chore/p0-hardening`.
- `.env` (git-ignored) was edited in place with new local random secrets; values were never printed.

## Blockers and decisions needed

- Breaking API changes (`trust_score`, `winner_by_certifications`) are acceptable only because there is no consumer; confirm before release.
- Deploying requires a canonical `ENCRYPTION_KEY` in production (move any older key to `ENCRYPTION_KEY_PREVIOUS`).
- An existing account without an active membership can no longer accept an invitation by typing its password; it needs to sign in first (documented in `docs/DASHBOARD_AUTH.md`).
- Email squatting through invitations (no email verification) remains open (plan P2).
- Strategic positioning vs UCP/ACP (plan P1) must be decided before further feature work.

## Next concrete action

- Watch the PR's CI (first run of the new drift check), review, then merge to `main`.
- Then take the P1 strategic decision before starting P2 reliability work.

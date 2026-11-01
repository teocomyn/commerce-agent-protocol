# AI Handoff

Updated: 2026-11-01
Agent/tool: Claude Code
Branch: `chore/security-ci-positioning-2026-11` (from `main` at `47dcf36`). One PR (#53), auto-merge enabled; it merges once "Build & typecheck" and CodeQL pass and every review thread is resolved (`main` requires conversation resolution and linear history).

## Where the project stands (verified 2026-11-01)

- `main` had not moved since 2026-10-08. The only deployed component is the Vercel marketing site (`commerce-agent-protocol-site.vercel.app`, commit `47dcf36`). No Render service exists, no DNS for `api.cap-protocol.org` or `dashboard.cap-protocol.org`, no Shopify Partners app (keys are placeholders), no real-store install ever ran.
- The real working copy is `~/Business/42/42 BUSINESS/Commerce Agent Protocol (CAP)`. The old `~/Downloads/.../Commerce Agent Protocol (CAP)` folder is an empty leftover and should be deleted.
- `cap-protocol.org` serves an unrelated "CLI Agent Protocol" site (registered 2026-05-18, private WHOIS). Ownership unconfirmed; Teo to clarify.
- Positioning decided: option A, agent-readiness / catalog-quality layer feeding UCP, Shopify Catalog, ChatGPT and Gemini. See `docs/ADR-0001-positioning-agent-readiness.md` and `AI_CONTEXT.md`.

## What this branch changes

- **Security**: Next.js 15.5.28 on `apps/site` and `apps/dashboard` (GHSA-2464-fhr4-w9xw unauthenticated image-optimizer RCE, GHSA-p3m5-59mp-jv5r DoS; the live site ran 15.5.27 and its `/_next/image` route answered). zod 4.6.7 in api, dashboard, shared (GHSA-mrhx-c7xc-m3w5; no 3.x fix). pnpm overrides `body-parser` 2.4.0, `fast-uri@3` 3.1.9, `ip-address` 10.7.5. `@modelcontextprotocol/sdk` 1.32.2.
- **zod 4 migration**: `z.string().uuid()` → `z.guid()` (3 sites in `packages/shared`); `error.flatten()` → `z.flattenError()` in `apps/api/src/lib/validation.ts` and `apps/api/src/mcp/tools.ts`; MCP input schemas via native `z.toJSONSchema(schema, { target: 'draft-7', io: 'input' })`; direct `zod-to-json-schema` dependency removed. `z.record` calls given an explicit key schema.
- **CodeQL**: `stripHtml` rewritten as a linear scanner + single-pass entity decode (closes polynomial-redos and double-escaping alerts); seed script variable renamed so the DB record is not confused with the secret (clear-text-logging alert); alert #5 (SHA-256 of a 160-bit API key) dismissed as false positive with justification.
- **Tests**: vitest 4.1.12 with vite 7.3.7 (Dependabot's vitest 4 PR failed because the lockfile kept vite 5, which has no `./module-runner` export); `**/dist/**` excluded from collection in both vitest configs.
- **Docs**: CHANGELOG cut as `0.2.0-alpha` (2026-11-01) with today's entries and corrected compare links; ADR-0001; `AI_CONTEXT.md` facts and decisions; README positioning.

## Validation (local, 2026-11-01)

Run in the real working copy against Docker `cap_postgres` (pgvector 16) and `cap_redis`, after `pnpm db:migrate` (the local volume was at the April schema):

- `pnpm audit --prod --audit-level high`: exit 0 (2 moderate remain, dev-only).
- `pnpm db:check-drift`: "schema.prisma matches the migrations" (needs `DATABASE_URL` exported; the script does not read `.env`).
- `pnpm typecheck`, `pnpm lint`: 4/4 tasks green.
- `pnpm test`: API 10 files / 133 tests passed; dashboard 9 files / 85 tests passed.
- `pnpm build`: 5/5 tasks green (site first-load JS 154 kB unchanged).
- Not exercised: real OpenAI or Shopify calls; the Vercel deploy of 15.5.28 happens on merge.

## Behaviour changes to announce

- Ids are accepted in any 8-4-4-4-12 hex form (`z.guid()`), matching Postgres; previously zod 3 did the same, zod 4's `uuid()` would have rejected non-version-checked ids.
- MCP `tools/list` input schemas are now draft-07 documents produced by zod itself; `type`, `properties`, `required` are unchanged for the three tools, `additionalProperties: false` is now explicit.
- Validation error `details` keep the `{ formErrors, fieldErrors }` shape.

## Blockers and decisions needed

- Confirm who owns `cap-protocol.org`. It is referenced today in docs and the Render blueprints (not deployed), as the `SHOPIFY_APP_URL` fallback in `apps/api/src/index.ts` and `apps/api/src/services/search.ts` (unused while nothing is deployed), in the dashboard API-keys example (`ApiKeysClient.tsx`), as `security@cap-protocol.org` in README and SECURITY.md, and in the live site's metadata: `apps/site/app/layout.tsx` (`metadataBase`, OpenGraph URL), `robots.ts` and `sitemap.ts` point canonical URLs at a domain that currently serves someone else's site. Replace these with the Vercel hostname or the confirmed domain in a small follow-up PR.
- `openai` 4.104 → 7.x is a separate major bump (zod helpers are not used, so nothing breaks today).
- Branch protection: after this merge, enable "Require a pull request before merging" (0 approvals) and `enforce_admins` so direct pushes to `main` stop.

## Next concrete actions

1. Merge this PR (Vercel redeploys the site on Next 15.5.28), then `git tag v0.2.0-alpha` on the merge commit and publish a GitHub release from the CHANGELOG section.
2. Delete merged branches (`chore/p0-hardening`, `chore/p2-reliability`, `chore/p4-platform`, `chore/deps-2026-10-08`, `docs/handoff-after-merge`, `feat/remote-mcp`, `feat/shared-commerce-services`); Dependabot PRs #31, #48, #49 are superseded by this PR.
3. First real Shopify install: create a Partners app + development store, run OAuth → sync locally through ngrok, compare `/v1/search` with the store's own `https://{store}/api/ucp/mcp`. This is the gap study that defines the readiness product.
4. Agent Readiness Score v1: publish the weights of `computeGeoScore`, add per-attribute "why / how to fix" output, calibrate on 20–50 public catalogs via the Shopify Catalog API, then surface it in the dashboard and as a free URL-only audit (PDF).
5. Retire checkout / remote-MCP / "neutral protocol" claims from the site copy and fix the site metadata (`metadataBase`, sitemap, robots and the security contact currently use `cap-protocol.org`); keep the code until replaced.
6. No Render or staging resources until a pilot merchant exists; explicit approval before any paid creation.

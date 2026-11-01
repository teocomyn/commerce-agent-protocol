# AI Handoff

Updated: 2026-11-01 (after the v0.2.0-alpha release)
Agent/tool: Claude Code
Branch: `chore/post-release-housekeeping-2026-11` (from `main` at `9f2e9b9`), one small PR with squash auto-merge.

## Where the project stands (verified 2026-11-01)

- PR #53 merged as `9f2e9b9` (squash). Tag `v0.2.0-alpha` and the GitHub pre-release point at it. Vercel rebuilt the marketing site from that commit (Next.js 15.5.28); `ci.yml` and CodeQL are green on `main`.
- `main` rules: pull request required (0 approvals), "Build & typecheck" and "Analyze JavaScript and TypeScript" required and up to date, conversation resolution (bot threads count), linear history (squash or rebase), enforced for admins too. GitHub private vulnerability reporting is enabled.
- Remote branches: only `main` and Dependabot branches remain; the merged feature and doc branches were deleted.
- Dependabot: #31 (vitest 4.1.11) closed as superseded; #49 (all-deps group) asked to recreate; #48, #50, #51, #52, #54 asked to rebase on the new `main`. #54 bumps `@hono/node-server` 1.x → 2.x (major: read its changelog before merging). Two Dependabot security-update jobs (`qs`, `postcss-selector-parser`) failed on `main` right after the merge; cause not read yet.
- Deployment reality unchanged: only the Vercel site is live. No Render service, no DNS for `api.cap-protocol.org` or `dashboard.cap-protocol.org`, no Shopify Partners app (keys are placeholders), no real-store install.
- `cap-protocol.org` serves an unrelated "CLI Agent Protocol" site (registered 2026-05-18, private WHOIS). Ownership unconfirmed; Teo to clarify.
- Positioning: option A, agent-readiness / catalog-quality layer feeding UCP, Shopify Catalog, ChatGPT and Gemini (`docs/ADR-0001-positioning-agent-readiness.md`).

## What this branch changes

- Site: `metadataBase`, the Open Graph URL, `robots.ts` and `sitemap.ts` derive from `NEXT_PUBLIC_SITE_URL`, else Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, else `http://localhost:3002` (`apps/site/lib/site-url.ts`). Canonical URLs no longer point at a domain we may not own.
- Security contact: GitHub private vulnerability reporting (`/security/advisories/new`) replaces `security@cap-protocol.org` in `SECURITY.md` and the README.
- API: the OpenAPI `servers` entry and the checkout base URL fall back to the local API URL instead of `https://api.cap-protocol.org` when `SHOPIFY_APP_URL` is unset (`apps/api/src/lib/public-url.ts`). `.env.example` uses a placeholder host.
- Dashboard: the API-keys curl example uses `NEXT_PUBLIC_API_URL`.
- Docs: this handoff and `AI_CONTEXT.md`.

Still referencing the domain on purpose: `render.yaml`, `render.staging.yaml` and the runbooks in `docs/` (never deployed; rewrite them with the real hostnames when a deployment is decided), and the site copy (next action 4).

## Validation (local, 2026-11-01)

- `pnpm typecheck`, `pnpm lint`: 4/4 green.
- `pnpm test`: API 10 files / 134 tests, dashboard 9 files / 85 tests.
- `pnpm --filter @cap/site build`: green; `robots.txt` and `sitemap.xml` resolve against the configured origin.

## Blockers and decisions needed

- Ownership of `cap-protocol.org` (Teo). If it is not ours, choose the domain before any deployment, Shopify app URL or email sender is configured.
- Shopify Partners app and development store (Teo's accounts): prerequisite for the first real install.
- `openai` 4.104 → 7.x is a separate major bump (zod helpers are not used, nothing breaks today).

## Next concrete actions

1. Read the two failed Dependabot security-update jobs on `main` (`qs`, `postcss-selector-parser`) and fix the cause (an override pin that blocks the update is the usual suspect).
2. Merge the rebased Dependabot PRs that come back green (#48 node image, #50 setup-node, #51/#52 codeql-action); evaluate #54 (`@hono/node-server` 2.x) against its changelog first.
3. First real Shopify install: Partners app + development store, OAuth → sync locally through ngrok, compare `/v1/search` with the store's own `https://{store}/api/ucp/mcp`. This gap study defines the readiness product.
4. Rewrite the marketing site copy (`apps/site`) around the readiness positioning; drop checkout / remote-MCP / "neutral protocol" claims.
5. Agent Readiness Score v1: publish the weights of `computeGeoScore`, add per-attribute "why / how to fix" output, calibrate on 20–50 public catalogs via the Shopify Catalog API, then surface it in the dashboard and as a free URL-only audit (PDF).
6. No Render or staging resources until a pilot merchant exists; explicit approval before any paid creation.

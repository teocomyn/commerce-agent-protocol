# AI Handoff

Updated: 2026-11-01 (after the v0.2.0-alpha release)
Agent/tool: Claude Code
Branch: `chore/actions-bumps-grouped-2026-11` (from `main` after #57), one small PR with squash auto-merge. PRs #55 (site origin, security contact) and #57 (dependency alerts) merged earlier today.

## Where the project stands (verified 2026-11-01)

- PR #53 merged as `9f2e9b9` (squash). Tag `v0.2.0-alpha` and the GitHub pre-release point at it. Vercel rebuilt the marketing site from that commit (Next.js 15.5.28); `ci.yml` and CodeQL are green on `main`.
- `main` rules: pull request required (0 approvals), "Build & typecheck" and "Analyze JavaScript and TypeScript" required (no up-to-date-branch requirement), conversation resolution (bot threads count), linear history (squash or rebase), enforced for admins too. GitHub private vulnerability reporting is enabled.
- Remote branches: only `main` and Dependabot branches remain; the merged feature and doc branches were deleted.
- Dependabot: #48 (node image) merged; #54 closed, superseded by #57 (merged: `@hono/node-server` 2.1.5, `qs` 6.17.1, `shell-quote` 1.12.0, `postcss-selector-parser` 6.1.5); #50, #51, #52 closed, superseded by this PR (grouped action bumps: separate codeql-action init/analyze bumps fail the Analyze job with a version mismatch); #56 (all-deps group, 11 minor/patch bumps) pending with auto-merge; the `minimatch` alert is dismissed (ESLint tooling only, no patched 3.x/10.x). The failed security-update jobs on `main` came from the `qs` 6.16.0 override pin, fixed in #57.
- Deployment reality unchanged: only the Vercel site is live. No Render service, no DNS for `api.cap-protocol.org` or `dashboard.cap-protocol.org`, no Shopify Partners app (keys are placeholders), no real-store install.
- `cap-protocol.org` serves an unrelated "CLI Agent Protocol" site (registered 2026-05-18, private WHOIS). Ownership unconfirmed; Teo to clarify.
- Positioning: option A, agent-readiness / catalog-quality layer feeding UCP, Shopify Catalog, ChatGPT and Gemini (`docs/ADR-0001-positioning-agent-readiness.md`).

## What this branch changes

- `actions/setup-node` 7.1.0 and `github/codeql-action` init + analyze 4.39.1 (SHA-pinned), in one commit so the CodeQL versions match.
- `.github/dependabot.yml`: GitHub Actions updates arrive as one grouped PR.
- This handoff and `AI_CONTEXT.md`.

Merged earlier today (#55): site origin from `NEXT_PUBLIC_SITE_URL` / `VERCEL_PROJECT_PRODUCTION_URL` (`apps/site/lib/site-url.ts`), security contact on GitHub private vulnerability reporting, API fallbacks off `api.cap-protocol.org` (`apps/api/src/lib/public-url.ts`), dashboard curl example on `NEXT_PUBLIC_API_URL`. Merged (#57): the dependency alerts above; `pnpm audit --prod` is clean, API smoke-tested on `@hono/node-server` 2.

Still referencing `cap-protocol.org` on purpose: `render.yaml`, `render.staging.yaml` and the runbooks in `docs/` (never deployed; rewrite them with the real hostnames when a deployment is decided), and the site copy (next action 3).

## Validation (local, 2026-11-01)

- #57 branch: `pnpm audit --prod` no known vulnerabilities; `pnpm typecheck`, `pnpm lint` 4/4; `pnpm test` API 134 / dashboard 85; API started locally on node-server 2 (`/health`, `/openapi.json` 200, `/v1/search` without key 401).
- This branch changes workflows only; CI on the PR is the validation.

## Blockers and decisions needed

- Ownership of `cap-protocol.org` (Teo). If it is not ours, choose the domain before any deployment, Shopify app URL or email sender is configured.
- Shopify Partners app and development store (Teo's accounts): prerequisite for the first real install.
- `openai` 4.104 → 7.x is a separate major bump (zod helpers are not used, nothing breaks today).

## Next concrete actions

1. Let #56 (grouped minor/patch bumps) land through auto-merge; if it conflicts on `pnpm-lock.yaml`, comment `@dependabot rebase`. The `postcss` 8.5.29 override can then be lifted to 8.5.32.
2. First real Shopify install: Partners app + development store, OAuth → sync locally through ngrok, compare `/v1/search` with the store's own `https://{store}/api/ucp/mcp`. This gap study defines the readiness product.
3. Rewrite the marketing site copy (`apps/site`) around the readiness positioning; drop checkout / remote-MCP / "neutral protocol" claims.
4. Agent Readiness Score v1: publish the weights of `computeGeoScore`, add per-attribute "why / how to fix" output, calibrate on 20–50 public catalogs via the Shopify Catalog API, then surface it in the dashboard and as a free URL-only audit (PDF).
5. No Render or staging resources until a pilot merchant exists; explicit approval before any paid creation.

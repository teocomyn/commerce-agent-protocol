# Contributing to Commerce Agent Protocol

Thanks for your interest in CAP! This document explains how to set up the project locally, the change types we accept, and our review process.

## Code of conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Be excellent to each other.

## What we accept

| Type of contribution | How to submit |
|---|---|
| Bug fix in the reference implementation | Pull request against `main` |
| New e-commerce platform adapter (Woo, Salesforce, custom) | Pull request — see [`apps/api/src/lib/shopify.ts`](./apps/api/src/lib/shopify.ts) for the existing Shopify pattern |
| Documentation / typo fix | Pull request, no issue needed |
| Feature request | Open a [Feature request](./.github/ISSUE_TEMPLATE/feature_request.md) issue first |
| Protocol-level change (new endpoint, breaking field, signature scheme) | Open a [Spec Proposal](./.github/ISSUE_TEMPLATE/spec_proposal.md) — protocol changes are versioned in [`cap-spec/`](./cap-spec) and require maintainer review |
| Security vulnerability | **Do not open a public issue.** Email security@cap-protocol.org — see [SECURITY.md](./SECURITY.md) |

## Local setup

### Requirements

- **Node** ≥ 22
- **pnpm** ≥ 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- **Docker** (for local Postgres + Redis)

### First run

```bash
git clone https://github.com/teocomyn/commerce-agent-protocol.git
cd commerce-agent-protocol

# Local Postgres (pgvector) + Redis
docker compose up -d

# Env
cp .env.example .env
# At minimum: DATABASE_URL, REDIS_URL, OPENAI_API_KEY, ENCRYPTION_KEY

# Install + DB
pnpm install
pnpm db:generate
pnpm db:migrate

# Run API + dashboard
pnpm dev
```

API: <http://localhost:3000> · Dashboard: <http://localhost:3001>

Workers run as separate processes (intentionally — they should be deployed as separate Railway services in production):

```bash
pnpm --filter=@cap/api exec tsx watch src/workers/enrichment.worker.ts
pnpm --filter=@cap/api exec tsx watch src/workers/catalog-sync.worker.ts
```

## Pull request flow

1. **Open or claim an issue.** For non-trivial changes, please discuss first to avoid wasted work.
2. **Branch from `main`.** Use a descriptive branch name (e.g. `feat/woocommerce-adapter`, `fix/checkout-stock-race`).
3. **Keep PRs focused.** One concern per PR. If you find an unrelated bug, open a separate PR.
4. **Run checks locally** before opening:

   ```bash
   pnpm typecheck   # tsc across all packages
   pnpm lint        # turbo lint
   pnpm test        # vitest (when present)
   pnpm build       # ensures clean build
   ```

5. **Open the PR** using the [PR template](./.github/PULL_REQUEST_TEMPLATE.md). Link the issue with `Closes #N`.
6. **CI must pass.** All status checks are required to merge.
7. **Sign-off.** By submitting a contribution you agree it is licensed under [Apache-2.0](./LICENSE).

## Coding conventions

- **TypeScript strict mode** is enabled (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`). Don't loosen it.
- **No new dependencies** without justification in the PR description.
- **No comments that restate code.** Comments should explain *why*, not *what*.
- **Database access** goes through Prisma. Raw SQL is allowed for vector queries (pgvector is not natively supported by Prisma) — always use bound parameters, never string concatenation.
- **Secrets** never in code or fixtures. Use `.env`, document in `.env.example`.

## Protocol changes

If your PR touches the wire format (request/response schemas, headers, MCP tool inputs), it is a **protocol change** and requires:

1. A [Spec Proposal](./.github/ISSUE_TEMPLATE/spec_proposal.md) issue with motivation, alternatives considered, and migration plan.
2. An update to [`cap-spec/v0.x/cap-protocol.md`](./cap-spec) and [`cap-spec/v0.x/openapi.yaml`](./cap-spec).
3. A new entry in [`CHANGELOG.md`](./CHANGELOG.md) under the `Protocol` section.
4. If breaking, a bumped spec version directory (e.g. `cap-spec/v0.2/`).

## Releases

Releases follow [SemVer](https://semver.org/). The current line is `0.x` and breaking changes are still expected. Maintainers cut releases by tagging `v0.x.y` and publishing a GitHub Release with the relevant CHANGELOG section.

## Questions

Open a [Discussion](https://github.com/teocomyn/commerce-agent-protocol/discussions) or @-mention the maintainers in your PR.

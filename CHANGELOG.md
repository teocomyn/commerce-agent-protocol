# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Signed dashboard accounts with invitations and merchant roles.
- Authoritative Shopify inventory snapshots with per-location quantities.
- Shopify shipping and refund policy URLs in search and comparison responses.
- Variant-level prices, quantities, and availability in search responses.
- `Idempotency-Key` header on `POST /v1/checkout/initiate`: retries replay the first outcome, success or error (`Idempotent-Replayed: true`), instead of creating another cart; keys are never released.
- Shopify GDPR compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) and a daily retention job (agent queries 180 days, webhook receipts 30 days, expired tokens and invitations).
- Graceful shutdown on `SIGTERM` for the API and both workers; containers run `node` as PID 1.
- `commerce_checkout` accepts `idempotency_key`, with the same semantics as the `Idempotency-Key` header.
- Remote MCP: the commerce tools over Streamable HTTP at `/mcp`, authenticated with an API key (`Authorization: Bearer` or `X-CAP-Key`), stateless and rate-limited like the REST endpoints.
- Compare responses list the compared products (`comparison.products`, id and title).

### Changed
- The MCP tools and the REST endpoints run the same services: the tools take the REST request bodies as arguments (published as JSON Schema from the same zod schemas) and return the REST response bodies, with the same validation, visibility rules, error codes, search cache and agent-query logging. **Breaking for MCP clients:** search filters move under `filters` (`{"query": "…", "filters": {"price_max": 120}}`), and results use the REST search format.
- Catalog synchronization uses Shopify Admin GraphQL `2026-07` and asynchronously backfills inventory locations.
- Checkout and search availability now honor untracked inventory and Shopify's `CONTINUE` selling policy.
- Shopify shipping destinations are synchronized and enforced before cart creation.
- Enrichment skips the LLM and embedding calls when the product content is unchanged; prices, policies and merchant claims are still refreshed.
- Inventory snapshots are scheduled after a product row exists, and product re-syncs keep per-location inventory levels.
- Search cache invalidation bumps a per-merchant generation instead of scanning the Redis keyspace.
- Every Render service runs migrations before starting.
- Enrichment jobs never overwrite a newer stored product revision (`products_raw.shopify_updated_at`), and inventory webhooks that arrive before the first per-location snapshot no longer zero the stock.
- Dashboard sessions are versioned by an atomic `merchant_members.session_version` counter; a routine Shopify re-authorization no longer signs the owner out.
- The API Redis client fails fast during an outage; rate limiting fails open and `/ready` reports the outage.

### Fixed
- Inventory webhooks no longer replace total stock with a single location's quantity.
- Enrichment requests a JSON schema that OpenAI strict structured outputs accepts (closed objects, every key required); the previous schema used open maps and optional keys.
- The stdio MCP server writes only JSON-RPC frames to stdout; logs go to stderr. New entrypoint `pnpm --silent -C apps/api mcp`.
- The dashboard Docker image requires `NEXT_PUBLIC_API_URL` at build time instead of shipping a bundle that points at localhost.
- `/openapi.json` defines the `Money` schema it references.
- Initial inventory snapshots no longer fail and fill the dead-letter queue on large catalogs.
- Jobs for an uninstalled or erased shop are skipped instead of retried.

### Security
- The API, workers, MCP server and dashboard refuse to start with the `.env.example` values of `ENCRYPTION_KEY`, `CAP_OPERATIONS_TOKEN` and `DASHBOARD_SESSION_SECRET`, or with trivially guessable values; in production the Shopify app secret must also be set. Production requires a 32-byte `ENCRYPTION_KEY` (hex or base64); new tokens use the `v2:` ciphertext format, `ENCRYPTION_KEY_PREVIOUS` supports rotation, and `pnpm --filter @cap/api reencrypt-tokens` re-encrypts stored tokens.
- Invitation acceptance no longer verifies passwords of existing accounts (it requires a session of the invited user instead) and is rate limited per IP and per invitation.
- Owner sign-in after Shopify OAuth goes through a same-origin confirmation step, closing login CSRF.
- Uninstalling the app revokes pending invitations and unused sign-in links.
- Dependency updates clearing every `pnpm audit --prod` finding (3 critical, 9 high): Next.js 15.5.27, MCP SDK 1.32.1, Hono 4.13.13, and patched `sharp`, `fast-uri`, `proxy-addr`, `qs`, `ip-address`, `postcss`, `source-map-js` overrides.
- Dashboard sends CSP `frame-ancestors 'none'`, HSTS (production), `nosniff`, referrer and permissions policies; the unused `/api/cap` proxy is removed.

### Protocol
- **Breaking:** `merchant.trust_score` is removed from search results and `comparison.winner_by_eco` is renamed `winner_by_certifications`.
- `certifications` and `comparison.similar_to` come only from merchant metafields `cap.certifications` and `cap.comparison_tags`; servers must not generate them. A migration clears the values previously generated by the LLM.
- Only products with Shopify status `ACTIVE` are synced, returned, compared or sent to checkout.

### Removed
- `db:push` scripts: schema changes ship as migrations, and CI checks that `schema.prisma` matches them (`pnpm db:check-drift`).
- Unsupported claims on the marketing site (signed transactions, multi-vendor federation, latency figures, adoption, fraud detection).

## [0.1.0] — 2026-04-30

First public alpha release of the Commerce Agent Protocol reference implementation.

### Added

**Protocol**
- `POST /v1/search` — semantic product search (pgvector + Zod-validated filters)
- `POST /v1/compare` — multi-product comparison matrix with per-criterion winners
- `POST /v1/checkout/initiate` — Shopify Cart API checkout (replaces deprecated `checkoutCreate`)
- MCP stdio server with three real tools: `commerce_search`, `commerce_compare`, `commerce_checkout`
- OpenAPI 3.1 spec served at `/openapi.json`

**Reference implementation**
- Hono API on Node 22 with security headers, CORS, structured error responses
- API key authentication: SHA-256 hashing, prefix display, plan-based rate limits, Redis cache
- Shopify OAuth (HMAC-validated) with AES-256-GCM admin token encryption
- Storefront access token provisioning (required for Cart API)
- Shopify webhooks: `products/create|update|delete`, `inventory_levels/update`, `orders/create|paid`, `app/uninstalled`
- BullMQ workers for catalog sync (paginated Shopify Admin REST) and per-product enrichment (GPT-4o-mini structured output + text-embedding-3-small)
- GEO score (0–100) covering completeness, specs depth, quality signal, image quality, freshness
- Postgres schema with pgvector ANN index (`ivfflat`) and initial Prisma migration
- Next.js 15 dashboard: overview, products, API keys

**Security**
- Multi-tenant guard: `merchant_id` filtering enforced on every search/compare/checkout query
- SQL embeddings bound as parameters (no string concatenation in vector queries)
- OAuth nonces stored in Redis with TTL (no longer in-process memory)
- AgentQuery analytics persisted on every search (used to mark conversions on `orders/paid`)

**Project**
- Apache-2.0 license with explicit patent grant (and NOTICE file)
- CONTRIBUTING, CODE_OF_CONDUCT, SECURITY policy
- Issue + PR templates, CI workflow, CODEOWNERS
- Initial `cap-spec/` directory (versioned protocol spec, conformance fixtures)

### Status

Alpha. Breaking changes expected before `v1.0`. Catalog → search → checkout end-to-end works against a real Shopify store; payment is delegated to Shopify checkout.

[Unreleased]: https://github.com/teocomyn/commerce-agent-protocol/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/teocomyn/commerce-agent-protocol/releases/tag/v0.1.0

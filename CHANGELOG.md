# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- N/A

### Changed
- N/A

### Fixed
- N/A

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

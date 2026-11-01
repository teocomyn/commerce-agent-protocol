# ADR-0001 — Position CAP as the agent-readiness layer, not a competing checkout protocol

- Status: **Accepted** (Teo Comyn, 2026-11-01)
- Supersedes: the "P1 strategic positioning" open question in `AI_CONTEXT.md` and `AI_HANDOFF.md` (2026-10-08)

## Context

CAP v0.1 was built in April 2026 as a neutral protocol plus reference implementation letting AI agents search a merchant catalog, compare products and start a Shopify checkout, exposed over REST and MCP. Between April and November 2026 the platforms shipped the same surface themselves (facts checked on 2026-11-01, see Sources):

- **Google + Shopify UCP** (announced 2026-01-11 with Etsy, Wayfair, Target, Walmart; endorsed by Visa, Mastercard, Stripe, Adyen) is the de-facto standard for agent checkout. Checkout is live for eligible US merchants, with CA/AU/UK announced for late 2026.
- **Shopify exposes a UCP Storefront MCP per store** (`https://{store}/api/ucp/mcp`, since 2026-04-22), a cross-merchant catalog MCP (`catalog.shopify.com/api/ucp/mcp`), auto-published `llms.txt`, `agents.md` and `/.well-known/ucp`, and **Agentic Storefronts** enabled by default for US merchants towards ChatGPT, Google AI Mode, Gemini, Copilot and Meta. The **Agentic Plan ($0, pay per sale)** lets non-Shopify brands list in Shopify Catalog.
- **OpenAI + Stripe ACP** scaled in-chat Instant Checkout back in March 2026; ACP survives as discovery plus hand-off to the merchant site.
- For WooCommerce, PrestaShop, Magento: core UCP support is "coming soon", several young plugins and UCPhub.ai already compete, and the Agentic Plan sidesteps the need.
- **France / EU**: Agentic Storefronts are not open to French customers yet; UCP discovery is live on some EU storefronts; no official Google/Shopify date for EU checkout.
- A new category is forming around **"AI readiness" of product data**: Digital Commerce 360 × ReFiBuy Top 1000 (average 41.9/100), Aido Lighthouse (48.1/100), StoreRank "AI Commerce Score". The shared finding is that agents need 30+ structured attributes per product and most catalogs expose 3 to 8. No vendor dominates.

CAP's own evidence: zero adopters, zero merchant installs against a real store, no deployment, 1 star. Its strongest asset is the ingestion + structured enrichment + GEO score pipeline, not the checkout endpoint.

## Decision

CAP becomes the **agent-readiness and catalog-quality layer** for merchants: it measures how well a catalog is read, ranked and transacted by shopping agents, and fixes the data so that UCP, Shopify Catalog, ChatGPT, Google AI Mode and Gemini expose it well. CAP **feeds** these channels; it does not compete with them.

Concretely:

1. `computeGeoScore` becomes a documented **Agent Readiness Score** per product, catalog and market, with published weights and actionable fixes (missing attributes, non-quantitative specs, undeclared certifications, images without alt text, missing shipping or return policy).
2. The Shopify ingestion pipeline (OAuth, sync, webhooks, multi-location stock) stays as the source connector. Enrichment writes back to **native Shopify metafields and structured data** that Shopify Catalog and UCP read, and validates `/.well-known/ucp`, `llms.txt` and schema.org Product/Offer.
3. `AgentQuery` analytics are repurposed to measure what agents read and bought once UCP / Shopify Catalog webhooks are connected.
4. The dashboard, accounts, roles and API keys become the SaaS surface. A free, URL-only readiness audit (score + top 10 fixes, PDF) is the entry point.

## Consequences

Kept: `apps/api` ingestion and enrichment, `packages/shared` scoring, `apps/dashboard`, migrations, CI, security hardening, GDPR handlers.

Retired as product promises (code stays until replaced, but is no longer the pitch): `POST /v1/checkout/initiate` as a merchant-facing feature, the remote MCP server as a product, `cap-spec` as a standard for others to implement. OAuth for Claude.ai connectors, Ed25519 request signing, negotiation, reservation and federation are dropped from the roadmap.

Infrastructure: no staging environment and no Render services until the readiness product has a pilot merchant. One environment running the API, the dashboard and the two BullMQ workers (catalog sync, enrichment) is enough, and creating it requires explicit approval because it is paid.

Messaging: the README drops "the Stripe of agent commerce" and any claim that CAP is the neutral protocol between merchants and agents with this ADR. The marketing site (`apps/site`) still carries the protocol and checkout copy; rewriting it is a follow-up tracked in `AI_HANDOFF.md`.

## Alternatives considered

- **B — UCP adapters for non-Shopify platforms.** Real gap in France (no PrestaShop plugin), but squeezed from both sides by Shopify's Agentic Plan and existing WooCommerce plugins, and it needs three connectors maintained by a one-person team. Possible later as additional *source connectors* for option A.
- **C — Ship the protocol as planned** (Render, OAuth MCP, App Store). Technically weeks away, but it would deliver a less-distributed copy of what Shopify gives every merchant for free.

## Open points

- Ownership of `cap-protocol.org` (serves an unrelated "CLI Agent Protocol" site since 2026-05-18) must be clarified before the domain is used in any artefact.
- The score needs calibration on 20–50 real catalogs; the first real Shopify install is a prerequisite.

## Sources

- Google: https://blog.google/products/ads-commerce/agentic-commerce-ai-tools-protocol-retailers-platforms/
- Shopify Spring '26 dev edition: https://www.shopify.com/news/spring-26-edition-dev
- Shopify Storefront MCP: https://shopify.dev/apps/build/storefront-mcp/servers/storefront and https://shopify.dev/changelog/posts/storefront-catalog-mcp-now-implements-ucp.md
- Shopify Agentic Plan: https://weaverse.io/blogs/shopify-agentic-plan-non-shopify-merchants-2026
- ACP status: https://www.digitalcommerce360.com/2026/03/06/openai-shifts-checkout-plans-agentic-commerce-strategy/
- Non-Shopify UCP: https://virtina.com/woocommerce-ucp-guide/ and https://ucphub.ai/
- France: https://getkanal.com/fr/blog/commerce-agentique
- AI readiness scoring: https://www.retailtouchpoints.com/?p=620388 and https://www.paz.ai/glossary/ai-readiness-score-ecommerce

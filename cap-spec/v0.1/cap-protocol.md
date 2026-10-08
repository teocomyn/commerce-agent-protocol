# Commerce Agent Protocol (CAP) — v0.1 (Draft)

**Status:** Draft · **Date:** 2026-04-30 · **Editors:** Teo Comyn

CAP is an open protocol that lets AI shopping agents discover, compare, and transact against e-commerce catalogs through a unified interface. This document describes the wire format and behavior an implementation must follow to be CAP-compliant.

The companion machine-readable contract is [`openapi.yaml`](./openapi.yaml).

## Conformance language

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

## 1. Roles

- **Merchant** — operates a store catalog (Shopify, WooCommerce, custom, …).
- **CAP Server** — exposes a CAP-compliant HTTP and/or MCP interface to merchant catalogs.
- **Agent** — an AI program (Claude, ChatGPT, Perplexity, custom) that consumes the CAP interface on behalf of an end user.

A CAP Server **MAY** front a single merchant or many; when it fronts many, it **MUST** scope every response to the merchant identified by the request's authentication credential.

## 2. Transport

CAP is transport-agnostic. v0.1 defines two normative bindings:

1. **HTTP/JSON** over TLS, with `Content-Type: application/json`.
2. **MCP** ([Model Context Protocol](https://modelcontextprotocol.io)) tools, over stdio for local clients or over Streamable HTTP for remote ones.

Servers **MAY** expose either or both. The semantics of operations are identical across bindings.

## 3. Authentication

### 3.1 HTTP

Agents authenticate using an API key in the header:

```
X-CAP-Key: cap_live_<40-hex>
```

- Keys **MUST** be opaque, bearer-style tokens.
- Servers **MUST** store keys hashed (e.g. SHA-256) — never in clear text.
- Keys **SHOULD** carry a prefix (`cap_live_`, `cap_test_`) to disambiguate environments.
- A 401 response **MUST** be returned for missing, malformed, or revoked keys.

### 3.2 MCP

- **Streamable HTTP:** clients authenticate with the same API key as the HTTP binding, sent as `Authorization: Bearer cap_live_…` (or `X-CAP-Key`), and the key determines the merchant. The reference server exposes this binding at `/mcp`.
- **stdio:** clients are bound to a merchant context out-of-band, for example when the merchant configures the CAP server in their MCP client.

The server **MUST** reject calls when the merchant context is missing.

## 4. Operations

CAP v0.1 defines three operations. Each has a normative HTTP binding and a corresponding MCP tool. A tool takes the HTTP request body as its arguments and returns the HTTP response body; an error returns the same error envelope with `isError: true`. `commerce_checkout` also accepts `idempotency_key`, with the semantics of the `Idempotency-Key` header.

| Operation | HTTP | MCP tool |
|---|---|---|
| Search | `POST /v1/search` | `commerce_search` |
| Compare | `POST /v1/compare` | `commerce_compare` |
| Initiate Checkout | `POST /v1/checkout/initiate` | `commerce_checkout` |

These product data rules apply to every operation:

- Servers **MUST** only expose products the merchant currently offers for sale (for example Shopify status `ACTIVE`); draft, archived and unlisted products are never returned, compared or checked out. Servers **SHOULD** also exclude products not published to the sales channel they serve.
- `certifications`, and any result derived from them such as `winner_by_certifications`, **MUST** come from data declared by the merchant. Servers **MUST NOT** infer or generate certifications, labels or environmental claims.

### 4.1 Search

Semantic + filtered product retrieval.

**Request body**

```json
{
  "query": "white eco-friendly sneakers under 120",
  "filters": {
    "price_max": 120,
    "currency": "EUR",
    "certifications": ["OEKO-TEX"],
    "shipping_country": "FR",
    "in_stock": true,
    "category": "Footwear"
  },
  "limit": 5,
  "sort": "relevance"
}
```

- `query` **MUST** be present, 1–500 chars.
- `sort` **MUST** be one of `relevance | price_asc | price_desc | geo_score`.
- Servers **MUST** filter results to the calling merchant's catalog.

**Response body** — see `examples/search-response.json`. Each result **MUST** include a stable `id`, `merchant`, `price`, `availability`, and a `checkout_url` that points at the same server's checkout endpoint.

### 4.2 Compare

Side-by-side comparison of 2–10 products on a fixed set of criteria.

**Request body**

```json
{
  "product_ids": ["<uuid>", "<uuid>"],
  "criteria": ["price", "certifications", "shipping", "specs", "return_policy"]
}
```

Servers **MUST** return a `matrix` keyed by criterion, plus optional per-criterion `winner_*` fields.

### 4.3 Initiate Checkout

Create a checkout session for a single product/variant.

**Request body**

```json
{
  "product_id": "<uuid>",
  "variant_id": "optional",
  "quantity": 1,
  "shipping_country": "FR",
  "agent_session_id": "optional, returned by /v1/search"
}
```

**Response** **MUST** include `checkout_url` (an HTTPS URL the user follows to pay), `cart_id`, an `amount` object, and `agent_checkout_id` for downstream reconciliation.

The CAP Server **MUST** persist enough state to reconcile the checkout against an order webhook (or equivalent) and surface the conversion outcome back through analytics.

**Idempotency.** Agents **SHOULD** send an `Idempotency-Key` header (1–255 characters among ASCII letters, digits, `_`, `-`, `.`, `:`) so that a retried request does not create a second checkout. A CAP Server that receives a key it already processed for the same merchant:

- **MUST** return the first outcome unchanged (success or error, same status and body), with the header `Idempotent-Replayed: true`, when the request body is identical;
- **MUST** reject the request with `422 IDEMPOTENCY_KEY_REUSED` when the body differs;
- **MUST** reject the request with `409 IDEMPOTENCY_KEY_IN_PROGRESS` while the first request is still running;
- **MUST** reject the request with `409 IDEMPOTENCY_KEY_OUTCOME_UNKNOWN` when the first request stopped before recording its outcome.

Bodies are compared as validated requests, not as bytes: the same fields with the same values are identical whatever the JSON key order or whitespace, a field left out equals its default value (`quantity` 1), and unknown fields are ignored.

A key is never released. A failed or unknown first attempt may still have created a checkout upstream (for example after a timeout), so agents retry with a **new** key once they have decided to try again.

Only requests that reach checkout creation are recorded. A request rejected before it (invalid body, `PRODUCT_NOT_FOUND`, `OUT_OF_STOCK`, `SHIPPING_COUNTRY_UNAVAILABLE`…) creates nothing upstream and does not consume the key: a retry with the same key is evaluated again and can succeed once the cause is gone.

## 5. Errors

All errors **MUST** use the canonical envelope:

```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Human-readable explanation",
    "details": { }
  }
}
```

Reserved codes for v0.1:

| Code | HTTP status | Meaning |
|---|---|---|
| `MISSING_API_KEY` | 401 | No `X-CAP-Key` header |
| `INVALID_API_KEY` | 401 | Key not found, revoked, or malformed |
| `RATE_LIMIT_EXCEEDED` | 429 | Per-key/plan rate limit reached |
| `PRODUCT_NOT_FOUND` | 404 | Unknown `product_id` |
| `VARIANT_NOT_FOUND` | 404 | Unknown variant for the given product |
| `OUT_OF_STOCK` | 409 | Insufficient inventory |
| `SHIPPING_COUNTRY_UNAVAILABLE` | 422 | The merchant does not ship to `shipping_country` |
| `INVALID_IDEMPOTENCY_KEY` | 400 | `Idempotency-Key` header is malformed |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Key already used with a different request body |
| `IDEMPOTENCY_KEY_IN_PROGRESS` | 409 | The first request with this key is still running |
| `IDEMPOTENCY_KEY_OUTCOME_UNKNOWN` | 409 | The first request stopped before recording its outcome; retry with a new key |
| `FORBIDDEN` | 403 | Caller is not authorized for the merchant or product |
| `STOREFRONT_NOT_PROVISIONED` | 503 | Server cannot create a checkout (missing upstream credential) |
| `CHECKOUT_FAILED` | 502 | Upstream commerce platform rejected the checkout |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

Implementations **MAY** introduce additional codes; new codes **MUST NOT** be added in the `CAP_*` namespace without a Spec Proposal.

## 6. Rate limiting

Servers **SHOULD** apply per-key rate limits and **SHOULD** surface them via standard headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 873
X-RateLimit-Reset: 1735689600
```

Limits and quotas are negotiated out-of-band (server-defined plans).

## 7. Versioning

The base path `/v1/` reflects the major spec version. Breaking changes ship under `/v2/` and live in a new spec directory. Servers **MAY** support multiple major versions concurrently.

## 8. Out of scope for v0.1

These will be addressed in later drafts:

- Cryptographic request/response signatures (Ed25519 envelope)
- Negotiation API (agent-exclusive pricing, bulk discounts)
- Reservation API (hold inventory while user decides)
- Reviews and ratings aggregation
- Multi-merchant federated search

## 9. Acknowledgements

CAP draws ideas from MCP, Open Banking, OpenAPI, and the early Stripe API ergonomics. It is intentionally minimal: do the boring transactional work cleanly first, add expressive features later.

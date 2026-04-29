# Conformance tests — CAP v0.1

This directory holds the minimum set of tests that any CAP-compliant implementation **MUST** pass.

The tests are intentionally transport-agnostic: each scenario is described as a sequence of request/expectation pairs in JSON. A test runner translates them into HTTP calls (or MCP tool calls) against the implementation under test.

## How to run against the reference implementation

The reference runner is shipped separately and not in v0.1. For v0.1 we only provide the static fixtures. The expected behavior:

```bash
# Pseudo-code — actual runner ships in cap-spec/v0.2
cap-conformance run \
  --base-url http://localhost:3000 \
  --api-key cap_live_test_xxx \
  cap-spec/v0.1/tests/conformance/
```

Each scenario file is a standalone test case. A passing implementation **MUST** produce a response that satisfies every assertion.

## Scenario format

```json
{
  "id": "search-001",
  "title": "Empty query returns 400",
  "operation": "POST /v1/search",
  "request": { "body": { "query": "" } },
  "expect": {
    "status": 400,
    "body_matches": {
      "error.code": "HTTP_ERROR"
    }
  }
}
```

Matchers supported in v0.1:

- `body_matches` — JSON-path-like exact equality on a subset of fields.
- `body_has_path` — path exists, value not asserted.
- `header_equals` — case-insensitive header equality.
- `status` — numeric HTTP status.

## Coverage targets for v0.1

- Authentication: missing key, invalid key, revoked key, valid key.
- Search: validation errors, sort modes, multi-tenant scoping.
- Compare: insufficient ids, invalid uuid, cross-tenant access denied.
- Checkout: out-of-stock, missing storefront token, happy path returns `checkout_url`.
- Error envelope shape on every 4xx / 5xx.

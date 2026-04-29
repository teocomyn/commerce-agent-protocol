# CAP Spec

This directory holds the **Commerce Agent Protocol** specification — the wire format and behavioral contract that any CAP-compliant implementation must follow.

The reference implementation lives in [`apps/`](../apps) and [`packages/`](../packages) at the repo root. The spec is intentionally separate so that other teams can implement CAP without depending on the Hono/Postgres reference stack.

## Layout

```
cap-spec/
  v0.1/
    cap-protocol.md         # Human-readable spec
    openapi.yaml            # Machine-readable contract
    examples/               # Request/response fixtures
    tests/conformance/      # Tests an implementation must pass
```

## Versioning

We follow [SemVer](https://semver.org/) on the spec itself.

- **Patch** (`v0.1.0` → `v0.1.1`) — clarifications, examples, no wire change.
- **Minor** (`v0.1.x` → `v0.2.0`) — additive, backwards-compatible.
- **Major** (`v0.x` → `v1.0`) — breaking changes. New version directory.

Breaking changes always create a new `vX.Y/` directory next to the previous one, so old implementations can keep working against the previous version.

## Status

| Version | Status | Notes |
|---|---|---|
| `v0.1` | **Draft** | Tracks the v0.1.0 reference release. Endpoint set, error model, MCP tool surface. Signatures and negotiation API are still TBD. |

## How to propose a change

Open a [Spec Proposal](../.github/ISSUE_TEMPLATE/spec_proposal.md) issue. See [CONTRIBUTING](../CONTRIBUTING.md#protocol-changes) for the full process.

## License

Apache-2.0 (same as the rest of the repo). The spec is free to implement, fork, or embed.

# Staging environment

The staging environment is intentionally isolated from production. It uses its own Postgres database, Redis instance, API, dashboard, workers, Shopify application credentials, encryption key, and domains.

No resource is created by committing `render.staging.yaml`. Creating the Blueprint provisions paid Render resources, so obtain explicit approval immediately before syncing it.

## Topology

- API: `https://api-staging.cap-protocol.org`
- Dashboard: `https://dashboard-staging.cap-protocol.org`
- Catalog worker: `cap-staging-catalog-worker`
- Enrichment worker: `cap-staging-enrichment-worker`
- Data: `cap-staging-postgres` and `cap-staging-redis`

Automatic deployment is disabled for every staging service. Releases are promoted manually after the local release gate and remote CI succeed.

## Required secrets

Provide these values only on the `cap-staging-api` service during the initial Blueprint flow:

- `OPENAI_API_KEY`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_SCOPES`
- `ENCRYPTION_KEY`
- `CAP_OPERATIONS_TOKEN` (random, at least 32 characters, staging-only)

Set `SHOPIFY_SCOPES` to the value documented in `.env.example`. The catalog query now requires `read_locations`, `read_legal_policies`, and `read_markets_home` in addition to product and inventory access. Re-authorize the development store after changing scopes.

The workers reference the OpenAI, Shopify, and encryption values from `cap-staging-api`, which guarantees that token encryption and Shopify credentials remain identical across all three processes. The operations token remains API-only, and the dashboard session secret is generated independently by Render.

Use a dedicated Shopify development app for staging. Configure:

- App URL: `https://api-staging.cap-protocol.org`
- Callback URL: `https://api-staging.cap-protocol.org/shopify/callback`
- Webhook URL: `https://api-staging.cap-protocol.org/webhooks/shopify`

## Deployment gate

Before a manual sync or deploy:

```bash
pnpm install --frozen-lockfile
pnpm audit --prod --audit-level high
pnpm db:generate
pnpm lint
pnpm test
pnpm build
```

After Render reports all four services healthy and DNS certificates are active:

```bash
pnpm smoke:staging
```

The smoke test verifies HTTPS, API health, the OpenAPI document, the unauthenticated API boundary, and dashboard availability. It never uses an API key and does not create commerce data.

Then complete the dedicated [Shopify E2E runbook](./SHOPIFY_E2E.md) with the staging development store. That second gate deliberately creates a Shopify cart and therefore requires an explicit confirmation environment variable.

## Promotion and rollback

Record the tested Git commit before promotion. Promote the same commit to production; do not rebuild from an uncommitted working tree.

For an application regression, roll back all four services to the same previously healthy commit. A Render application rollback does not reverse database migrations. CAP migrations must therefore remain backward-compatible during the rollback window. If a migration requires destructive cleanup, ship it separately only after the old application version can no longer be restored.

After rollback, rerun the staging smoke test and verify worker queue progress. Never replay dead-letter jobs until the underlying defect is confirmed fixed.

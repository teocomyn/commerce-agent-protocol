# Operations and observability

CAP separates liveness, readiness, and privileged operational data:

- `GET /health` proves that the API process can answer HTTP. It does not touch dependencies.
- `GET /ready` checks Postgres and Redis with a two-second timeout and returns `503` if either is unavailable. Render uses this route as its health check.
- `/internal/operations/*` requires the dedicated `CAP_OPERATIONS_TOKEN`. Never reuse a merchant API key or expose this token to the dashboard browser.

Use a random secret of at least 32 characters and send it as a bearer token or `X-CAP-Operations-Token`. Keep separate values for staging and production.

## Queue and metrics checks

```bash
export CAP_API_URL=https://api-staging.cap-protocol.org
export CAP_OPERATIONS_TOKEN=replace-with-staging-secret

curl --fail "$CAP_API_URL/ready"
curl --fail \
  --header "Authorization: Bearer $CAP_OPERATIONS_TOKEN" \
  "$CAP_API_URL/internal/operations/queues"
curl --fail \
  --header "Authorization: Bearer $CAP_OPERATIONS_TOKEN" \
  "$CAP_API_URL/internal/operations/metrics"
```

The metrics response uses the Prometheus text format and exposes only low-cardinality operational gauges:

- active Shopify installations;
- BullMQ counts per queue and state;
- persisted webhook events per processing status.

Alert immediately when `/ready` is non-200, the dead-letter queue is non-empty, a queue has failed jobs, or webhook `failed` events increase. Alert on sustained waiting-job growth only after setting a baseline from staging traffic.

The `catalog-sync` queue contains both full catalog pulls and authoritative inventory snapshots. An `inventory_levels/update` webhook applies a fail-closed local update immediately, then schedules an `inventory-level-sync` job to refresh the total and per-location quantities from Admin GraphQL. A sustained inventory-job backlog means checkout availability may remain conservatively unavailable until the catalog worker catches up.

Initial inventory snapshots are scheduled by each enrichment job once the product row exists, and only for inventory items whose per-location levels are missing or no longer match the aggregate stock. Product re-syncs keep known levels. Jobs for a shop that is uninstalled or erased are skipped, not retried.

Enrichment calls the LLM and the embedding model only when the product content changes (title, description, vendor, type, tags, first three images, and `ENRICHMENT_VERSION`). Price, stock, policy, and metafield changes are applied without an OpenAI call. Bump `ENRICHMENT_VERSION` in `apps/api/src/lib/enrichment-output.ts` after changing the prompt or the output schema to re-enrich every product on its next sync.

## Data retention and GDPR

The catalog worker runs a `maintenance` job every day at 03:00 UTC (BullMQ job scheduler `daily-retention`). It deletes:

- agent queries older than `AGENT_QUERY_RETENTION_DAYS` (default 180): they contain free text typed by shoppers;
- processed webhook receipts older than `WEBHOOK_EVENT_RETENTION_DAYS` (default 30);
- dashboard login tokens one day after expiry or use, and invitations 30 days after expiry, acceptance, or revocation;
- and it marks checkouts stuck in `creating` for over a day as `failed`, storing an "outcome unknown" answer for their idempotency key (the key is never released, because the Shopify cart may exist).

Agent queries without a merchant (from an erased shop or recorded before `merchant_id` existed) are deleted by the same job. A `shop/redact` received for a shop that is not marked uninstalled fails on purpose (`webhook_events.status = failed`, HTTP 500) so Shopify redelivers it; investigate why `app/uninstalled` was missed.

Shopify compliance webhooks are handled on the same `/webhooks/shopify` endpoint. Configure the three topics in the Shopify app (Dev Dashboard or `shopify.app.toml` `compliance_topics`); they cannot be registered through the Admin API:

- `customers/data_request`: CAP keeps no customer profile, so the request is acknowledged and recorded.
- `customers/redact`: the Shopify order ids listed in `orders_to_redact` are removed from `agent_checkouts`.
- `shop/redact`: if the shop is uninstalled, every row of that merchant is deleted (products, keys, checkouts, agent queries, members, and accounts that belonged only to that shop). A `shop/redact` for a shop that is still installed is ignored and logged.

Have the export and erasure behaviour reviewed legally before an App Store submission.

## Deploys and shutdown

Every service runs `pnpm db:migrate` as its Render pre-deploy command (Prisma takes an advisory lock, so concurrent runs are safe), so workers and the dashboard never start against an older schema. Keep migrations backward-compatible with the previous release.

Processes run `node` directly as PID 1 and handle `SIGTERM`: the API stops accepting connections and drains in-flight requests (25 s budget), workers wait for their active jobs (110 s budget, below `maxShutdownDelaySeconds: 120`), then queues, Redis, and Postgres connections close. A process that does not drain in time exits with status 1.

If Redis becomes unavailable, API commands fail after about two seconds instead of hanging: authentication falls back to Postgres, the search cache is bypassed, and per-key rate limiting fails open (logged) while `/ready` reports the outage.

## Full catalog resync

`POST /internal/operations/catalog-sync` with `{"confirm":true}` queues a full catalog sync for every active install and returns the number of queued shops. Use it after a release that changes stored product data. It calls Shopify for every product, but OpenAI only for active products whose title, description, vendor, type, tags or images changed since their last enrichment, or after a release that bumps `ENRICHMENT_VERSION`. Run it once, not on a schedule. A second request while a shop's resync is still waiting or running is ignored for that shop.

A full sync reads every product, active or not, so a product that became a draft or was archived while its webhook was missed is hidden on the next sync. Inactive products only have their stored status updated: they are not enriched and get no inventory job.

## Dead-letter inspection and replay

List at most 100 recent entries:

```bash
curl --fail \
  --header "Authorization: Bearer $CAP_OPERATIONS_TOKEN" \
  "$CAP_API_URL/internal/operations/dead-letter?limit=25"
```

Replaying changes external state: it schedules the original catalog or enrichment work again and removes the dead-letter entry only after the destination queue accepts the new job. Confirm the underlying code, credentials, scopes, and upstream availability are fixed first.

```bash
curl --fail \
  --request POST \
  --header "Authorization: Bearer $CAP_OPERATIONS_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"confirm":true}' \
  "$CAP_API_URL/internal/operations/dead-letter/JOB_ID/replay"
```

The endpoint rejects missing confirmation, unknown source queues, malformed jobs, missing jobs, and a second replay of the same entry. Record the response `replay_job_id` in the incident log.

## Incident order

1. Check `/health`; if it fails, inspect the API service and its most recent deployment.
2. Check `/ready`; isolate Postgres versus Redis before restarting application services.
3. Check queue metrics and recent webhook failures.
4. Inspect the DLQ without replaying it.
5. Fix and deploy the underlying defect to staging, run smoke and Shopify gates, then replay one entry.
6. Verify the replay completes before processing the remaining entries.

Application rollback does not roll back database migrations. Keep migrations backward-compatible throughout the rollback window.

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

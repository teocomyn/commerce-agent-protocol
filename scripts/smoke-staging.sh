#!/usr/bin/env bash
set -euo pipefail

api_url="${CAP_API_URL:-https://api-staging.cap-protocol.org}"
dashboard_url="${CAP_DASHBOARD_URL:-https://dashboard-staging.cap-protocol.org}"

if [[ "${CAP_ALLOW_INSECURE_SMOKE:-false}" != "true" ]]; then
  [[ "$api_url" == https://* ]] || { echo "CAP_API_URL must use HTTPS" >&2; exit 1; }
  [[ "$dashboard_url" == https://* ]] || { echo "CAP_DASHBOARD_URL must use HTTPS" >&2; exit 1; }
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

curl_common=(--fail --silent --show-error --connect-timeout 10 --max-time 30)

echo "Checking API health: $api_url/health"
curl "${curl_common[@]}" "$api_url/health" > "$tmp_dir/health.json"
node -e '
  const body = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (body.status !== "ok") throw new Error(`Unexpected health status: ${body.status}`);
' "$tmp_dir/health.json"

echo "Checking API readiness: $api_url/ready"
curl "${curl_common[@]}" "$api_url/ready" > "$tmp_dir/ready.json"
node -e '
  const body = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (body.status !== "ready" || body.checks?.postgres !== "ok" || body.checks?.redis !== "ok") {
    throw new Error("API dependencies are not ready");
  }
' "$tmp_dir/ready.json"

echo "Checking OpenAPI document"
curl "${curl_common[@]}" "$api_url/openapi.json" > "$tmp_dir/openapi.json"
node -e '
  const body = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (!body.openapi || !body.paths?.["/v1/search"]) throw new Error("Incomplete OpenAPI document");
' "$tmp_dir/openapi.json"

echo "Checking unauthenticated API boundary"
status="$(curl --silent --show-error --output "$tmp_dir/unauthorized.json" --write-out '%{http_code}' \
  --connect-timeout 10 --max-time 30 \
  --request POST "$api_url/v1/search" \
  --header 'Content-Type: application/json' \
  --data '{"query":"staging smoke test"}')"
[[ "$status" == "401" ]] || { echo "Expected 401 without API key, received $status" >&2; exit 1; }
node -e '
  const body = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (body.error?.code !== "MISSING_API_KEY") throw new Error("Unexpected authentication error envelope");
' "$tmp_dir/unauthorized.json"

echo "Checking dashboard availability: $dashboard_url"
curl "${curl_common[@]}" --output /dev/null "$dashboard_url/"

echo "Staging smoke test passed"

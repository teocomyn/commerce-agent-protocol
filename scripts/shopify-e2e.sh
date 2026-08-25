#!/usr/bin/env bash
set -euo pipefail

api_url="${CAP_API_URL:-https://api-staging.cap-protocol.org}"
api_key="${CAP_API_KEY:-}"
product_id="${CAP_PRODUCT_ID:-}"
variant_id="${CAP_VARIANT_ID:-}"
shipping_country="${CAP_SHIPPING_COUNTRY:-FR}"

[[ "$api_url" == https://* ]] || { echo "CAP_API_URL must use HTTPS" >&2; exit 1; }
[[ -n "$api_key" ]] || { echo "CAP_API_KEY is required" >&2; exit 1; }
[[ -n "$product_id" ]] || { echo "CAP_PRODUCT_ID is required" >&2; exit 1; }
if [[ "${CAP_CONFIRM_CREATE_SHOPIFY_CART:-}" != "yes" ]]; then
  echo "This check creates a real Shopify cart. Set CAP_CONFIRM_CREATE_SHOPIFY_CART=yes to continue." >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
curl_common=(--fail --silent --show-error --connect-timeout 10 --max-time 30)

echo "Checking API health"
curl "${curl_common[@]}" "$api_url/health" > "$tmp_dir/health.json"
node -e '
  const body = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (body.status !== "ok") throw new Error(`Unexpected health status: ${body.status}`);
' "$tmp_dir/health.json"

checkout_payload="$(node -e '
  const [productId, variantId, country] = process.argv.slice(1);
  process.stdout.write(JSON.stringify({
    product_id: productId,
    ...(variantId ? { variant_id: variantId } : {}),
    quantity: 1,
    shipping_country: country,
  }));
' "$product_id" "$variant_id" "$shipping_country")"

echo "Creating a tracked Shopify cart"
curl "${curl_common[@]}" \
  --request POST "$api_url/v1/checkout/initiate" \
  --header "X-CAP-Key: $api_key" \
  --header 'Content-Type: application/json' \
  --data "$checkout_payload" > "$tmp_dir/checkout.json"

node -e '
  const body = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (!body.agent_checkout_id) throw new Error("Missing deterministic CAP checkout id");
  if (!body.checkout_url || !body.checkout_url.startsWith("https://")) {
    throw new Error("Missing secure Shopify checkout URL");
  }
  console.log(`Checkout URL: ${body.checkout_url}`);
  console.log(`CAP checkout: ${body.agent_checkout_id}`);
' "$tmp_dir/checkout.json"

echo "Shopify staging cart check passed"

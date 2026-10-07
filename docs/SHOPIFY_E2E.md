# Shopify end-to-end validation

Run this gate against a dedicated Shopify development store after staging is healthy. Never install the staging app on a production merchant.

CAP uses Admin GraphQL `2026-07`, expiring offline access tokens, one-time refresh-token rotation, and Storefront `cartCreate`. The automated contract tests validate the GraphQL documents and HTTP envelopes without contacting a store:

```bash
pnpm test:shopify
```

The full API test suite also exercises the Redis-backed OAuth nonce, HMAC verification, merchant provisioning, owner membership, dashboard login token, required webhook registration, catalog job, callback replay prevention, token rotation, scope loss, webhook idempotency, checkout tracking, and uninstall revocation:

```bash
pnpm --filter @cap/api test
```

## Staging app configuration

Create a separate app and development store in the Shopify Dev Dashboard. Configure:

- App URL: `https://api-staging.cap-protocol.org`
- Callback URL: `https://api-staging.cap-protocol.org/shopify/callback`
- Webhook delivery URL: `https://api-staging.cap-protocol.org/webhooks/shopify`
- Admin API version: `2026-07`
- Scopes: exactly the value configured in staging `SHOPIFY_SCOPES`

The install requests an expiring offline token. Shopify returns a 60-minute access token and a refresh token; CAP encrypts both and refreshes five minutes early. If a refresh no longer contains every required scope, CAP deletes the unusable credentials and requires reinstalling the app.

For an App Store distribution, configure the mandatory `customers/data_request`, `customers/redact`, and `shop/redact` compliance topics in the Dev Dashboard with the same delivery URL (`/webhooks/shopify`). CAP handles all three (see `docs/OPERATIONS.md`, "Data retention and GDPR"). Have the export and erasure behaviour reviewed legally before App Store submission; a successful commerce E2E test does not replace this compliance gate.

References: [offline access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens), [expiring-token migration](https://shopify.dev/docs/apps/build/authentication-authorization/migrate-to-expiring-offline-access-tokens), [Admin webhook creation](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/webhookSubscriptionCreate), [Storefront carts](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage), and [privacy webhooks](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance).

## Real-store acceptance sequence

1. Open `https://api-staging.cap-protocol.org/shopify/install?shop=STORE.myshopify.com` and approve every requested scope.
2. Confirm the redirect reaches the staging dashboard without exposing a `merchant_id` selector.
3. Wait for both worker queues to settle, create a staging API key, and verify a known product appears in `/v1/search` with the right currency, every variant price, and the expected `shipping_countries`.
4. Change inventory for that variant at one Shopify location. Confirm the `inventory_levels/update` webhook changes only that location, the catalog worker refreshes the authoritative total, and cached search results are invalidated.
5. Attempt checkout with a country outside `shipping_countries` and confirm CAP returns `SHIPPING_COUNTRY_UNAVAILABLE`; then run the guarded cart check below for a supported country, open the returned URL, and place a Shopify test order.
6. Confirm `orders/create` sets the tracked CAP checkout to `ordered`, and `orders/paid` sets it to `completed` using the deterministic cart attribute—not an amount match.
7. Redeliver one webhook from Shopify and confirm there is only one completed `webhook_events` record and no duplicate enrichment work.
8. Uninstall the app. Confirm the Admin, refresh, and Storefront tokens are cleared; dashboard memberships and API keys are revoked; an already-cached API key immediately returns `401`.

## Guarded cart check

This command creates a real cart but never submits payment. Use a staging-only API key and product:

```bash
CAP_API_URL=https://api-staging.cap-protocol.org \
CAP_API_KEY=cap_staging_xxx \
CAP_PRODUCT_ID=00000000-0000-0000-0000-000000000000 \
CAP_VARIANT_ID=1234567890 \
CAP_SHIPPING_COUNTRY=FR \
CAP_CONFIRM_CREATE_SHOPIFY_CART=yes \
pnpm e2e:shopify
```

The gate passes only when CAP returns a secure Shopify checkout URL and a persisted deterministic checkout identifier. Complete the hosted checkout manually with Shopify test payments, then verify the two order webhooks and uninstall behavior in the dashboard and logs.

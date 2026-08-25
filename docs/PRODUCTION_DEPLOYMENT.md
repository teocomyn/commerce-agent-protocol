# Production deployment

CAP is deployed as four independent processes: the public API, the merchant dashboard, the catalog worker, and the enrichment worker. Postgres/pgvector and Redis are managed services shared over the provider's private network.

## Render Blueprint

The root `render.yaml` provisions the four processes in Frankfurt, plus a private Postgres 16 database and persistent Key Value service. The provider terminates TLS and provisions certificates for:

- `api.cap-protocol.org` → `cap-api`
- `dashboard.cap-protocol.org` → `cap-dashboard`
- `cap-protocol.org` / `www.cap-protocol.org` → Vercel project `commerce-agent-protocol-site`

The root domain currently serves a different product titled “CLI Agent Protocol”. Confirm that this site can be replaced before moving the root DNS record; the API and dashboard subdomains can be added independently without that cutover.

Before the first Blueprint sync, provide the five secrets marked `sync: false`: `OPENAI_API_KEY`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES`, and `ENCRYPTION_KEY`. Do not copy a development encryption key after production tokens have already been encrypted: rotation requires re-encrypting stored tokens.

The API pre-deploy hook runs `prisma migrate deploy`; the initial migration enables `vector`. Render Postgres 16 supports pgvector. Deploys are gated on successful GitHub checks.

## DNS and Shopify

After Render creates each custom domain, add the exact CNAME records Render displays at the authoritative DNS provider. Keep proxying disabled until domain verification succeeds. Verify:

```bash
dig +short api.cap-protocol.org CNAME
dig +short dashboard.cap-protocol.org CNAME
curl --fail https://api.cap-protocol.org/health
curl --fail https://dashboard.cap-protocol.org/
```

In Shopify Partner Dashboard, configure:

- App URL: `https://api.cap-protocol.org`
- Allowed callback: `https://api.cap-protocol.org/shopify/callback`
- Webhook URL: `https://api.cap-protocol.org/webhooks/shopify`

The app uses Admin GraphQL `2026-07`, offline expiring tokens with refresh rotation, and checks that the granted scopes include every requested scope before activating the merchant.

## Release gate

```bash
pnpm install --frozen-lockfile
pnpm audit --prod --audit-level high
pnpm db:generate
pnpm lint
pnpm test
pnpm build
docker build -f Dockerfile.api -t cap-api:release .
docker build -f Dockerfile.dashboard -t cap-dashboard:release .
```

After deployment, validate `/health`, perform a Shopify OAuth install, create and revoke an API key, deliver the same webhook twice, and complete a test checkout. Failed jobs are retained in the `dead-letter` BullMQ queue for inspection and replay.

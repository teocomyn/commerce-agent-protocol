import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { prisma } from '@cap/db'
import { authMiddleware } from '../middleware/auth.js'
import { compareRouter } from '../routes/compare.js'
import { searchRouter } from '../routes/search.js'
import { webhookRouter } from '../routes/webhooks.js'
import { checkoutRouter } from '../routes/checkout.js'
import { oauthRouter } from '../routes/shopify/oauth.js'
import { CAP_WEBHOOK_TOPICS, decryptToken, encryptToken } from '../lib/shopify.js'
import {
  cacheSetIfAbsent,
  invalidateApiKeyCache,
  invalidateMerchantSearchCache,
  redis,
  searchCacheKey,
} from '../lib/redis.js'
import { runRetention } from '../lib/retention.js'
import { queueOutdatedEnrichmentResyncs } from '../lib/enrichment-backfill.js'
import { ENRICHMENT_VERSION } from '../lib/enrichment-output.js'
import { catalogSyncQueue, deadLetterQueue, enrichmentQueue, maintenanceQueue } from '../lib/queue.js'
import { getValidShopifyAdminToken } from '../lib/shopify-token.js'
import { checkReadiness, operationsRouter } from '../routes/operations.js'

const createShopifyCartMock = vi.hoisted(() => vi.fn(async (_shop: string, _token: string, input: { trackingToken: string }) => ({
  cartId: 'gid://shopify/Cart/test-cart',
  checkoutUrl: 'https://shop.example/checkouts/test',
  totalAmount: '29.00',
  subtotalAmount: '29.00',
  totalTax: null,
  currency: 'EUR',
  trackingToken: input.trackingToken,
})))
const embeddingsCreateMock = vi.hoisted(() => vi.fn(async () => ({
  data: [{ embedding: Array.from({ length: 1536 }, () => 0) }],
})))

vi.mock('openai', () => ({
  default: class OpenAITestDouble {
    embeddings = { create: embeddingsCreateMock }
  },
}))

vi.mock('../lib/shopify.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/shopify.js')>()
  return { ...original, createShopifyCart: createShopifyCartMock }
})

const suffix = crypto.randomBytes(5).toString('hex')
const domains = [`cap-test-a-${suffix}.myshopify.com`, `cap-test-b-${suffix}.myshopify.com`]
const oauthDomain = `cap-oauth-${suffix}.myshopify.com`
const refreshDomain = `cap-refresh-${suffix}.myshopify.com`
let merchantA: string
let merchantB: string
let productA: string
let productB: string
let validKey: string
let validKeyHash: string

async function createKey(merchantId: string, label: string): Promise<string> {
  const key = `cap_test_${crypto.randomBytes(20).toString('hex')}`
  await prisma.apiKey.create({
    data: {
      merchantId,
      keyHash: crypto.createHash('sha256').update(key).digest('hex'),
      keyPrefix: key.slice(0, 16),
      label,
    },
  })
  return key
}

function signedWebhook(topic: string, shopDomain: string, webhookId: string, body: unknown = {}) {
  const payload = JSON.stringify(body)
  const hmac = crypto.createHmac('sha256', 'integration-shopify-secret').update(payload).digest('base64')
  return webhookRouter.request('/shopify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Hmac-Sha256': hmac,
      'X-Shopify-Topic': topic,
      'X-Shopify-Shop-Domain': shopDomain,
      'X-Shopify-Webhook-Id': webhookId,
    },
    body: payload,
  })
}

function protectedApp() {
  const app = new Hono()
  app.use('*', authMiddleware)
  app.get('/', (c) => c.json(c.get('auth')))
  return app
}

describe.sequential('CAP integration boundaries', () => {
  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012'
    process.env.SHOPIFY_API_SECRET = 'integration-shopify-secret'
    const merchants = await Promise.all(domains.map((shopifyDomain) => prisma.merchant.create({
      data: { shopifyDomain, shopifyToken: encryptToken('admin'), storefrontToken: encryptToken('storefront') },
    })))
    merchantA = merchants[0]!.id
    merchantB = merchants[1]!.id

    const rawA = await prisma.productRaw.create({
      data: {
        merchantId: merchantA,
        shopifyId: BigInt(`1${Date.now()}`),
        title: 'Tenant A Shoe',
        status: 'active',
        variants: [{ id: 101, inventory_item_id: 9001, price: '29.00', inventory_quantity: 4, title: 'Default' }],
        images: [],
      },
    })
    const rawB = await prisma.productRaw.create({
      data: {
        merchantId: merchantB,
        shopifyId: BigInt(`2${Date.now()}`),
        title: 'Tenant B Shoe',
        status: 'active',
        variants: [{ id: 202, inventory_item_id: 9002, price: '39.00', inventory_quantity: 5, title: 'Default' }],
        images: [],
      },
    })
    const [enrichedA, enrichedB] = await Promise.all([
      prisma.productEnriched.create({
        data: {
          productRawId: rawA.id, merchantId: merchantA, specs: {}, useCases: [],
          targetAudience: [], certifications: [], comparisonTags: [], priceMin: 29,
          priceMax: 29, currency: 'EUR', shippingInfo: { countries: ['FR'] },
        },
      }),
      prisma.productEnriched.create({
        data: {
          productRawId: rawB.id, merchantId: merchantB, specs: {}, useCases: [],
          targetAudience: [], certifications: [], comparisonTags: [], priceMin: 39,
          priceMax: 39, currency: 'EUR', shippingInfo: { countries: ['FR'] },
        },
      }),
    ])
    productA = enrichedA.id
    productB = enrichedB.id
    const zeroVector = JSON.stringify(Array.from({ length: 1536 }, () => 0))
    await prisma.$executeRaw`
      UPDATE products_enriched SET embedding = ${zeroVector}::vector
      WHERE id IN (${productA}::uuid, ${productB}::uuid)
    `
    validKey = await createKey(merchantA, 'integration-valid')
    validKeyHash = crypto.createHash('sha256').update(validKey).digest('hex')
  })

  afterAll(async () => {
    await prisma.merchant.deleteMany({ where: { shopifyDomain: { in: domains } } })
    await redis.del(`apikey:${validKeyHash}`, `rl:${validKeyHash}`)
    await prisma.$disconnect()
    await Promise.all([
      enrichmentQueue.close(),
      catalogSyncQueue.close(),
      maintenanceQueue.close(),
      deadLetterQueue.close(),
    ])
    await redis.quit()
  })

  it('rejects a missing API key', async () => {
    const response = await protectedApp().request('/')
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: 'MISSING_API_KEY' } })
  })

  it('authenticates a valid API key against Postgres and Redis', async () => {
    const response = await protectedApp().request('/', { headers: { 'X-CAP-Key': validKey } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ merchantId: merchantA, plan: 'free' })
    expect(await redis.exists(`apikey:${validKeyHash}`)).toBe(1)
  })

  it('rejects a revoked key immediately after cache invalidation', async () => {
    const key = await createKey(merchantA, 'integration-revoked')
    const hash = crypto.createHash('sha256').update(key).digest('hex')
    expect((await protectedApp().request('/', { headers: { 'X-CAP-Key': key } })).status).toBe(200)
    await prisma.apiKey.update({ where: { keyHash: hash }, data: { revokedAt: new Date() } })
    await invalidateApiKeyCache([hash])
    expect((await protectedApp().request('/', { headers: { 'X-CAP-Key': key } })).status).toBe(401)
  })

  it('never re-caches a key revoked while its lookup was in flight', async () => {
    const key = await createKey(merchantA, 'integration-revoke-race')
    const hash = crypto.createHash('sha256').update(key).digest('hex')
    await prisma.apiKey.update({ where: { keyHash: hash }, data: { revokedAt: new Date() } })
    await invalidateApiKeyCache([hash])
    // A lookup that read the key from Postgres before the revocation fills
    // the cache only now: the tombstone must win.
    await cacheSetIfAbsent(`apikey:${hash}`, { merchantId: merchantA, apiKeyId: 'stale', plan: 'free' }, 60)
    expect((await protectedApp().request('/', { headers: { 'X-CAP-Key': key } })).status).toBe(401)
    await redis.del(`apikey:${hash}`, `rl:${hash}`)
  })

  it('enforces tenant isolation in compare', async () => {
    const app = new Hono()
    app.use('/v1/*', authMiddleware)
    app.route('/v1/compare', compareRouter)
    const response = await app.request('/v1/compare', {
      method: 'POST',
      headers: { 'X-CAP-Key': validKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: [productA, productB] }),
    })
    expect(response.status).toBe(404)
  })

  it('runs merchant-scoped product search against Postgres', async () => {
    const app = new Hono()
    app.use('/v1/*', authMiddleware)
    app.route('/v1/search', searchRouter)
    const response = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'X-CAP-Key': validKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'shoe', sort: 'relevance', filters: { currency: 'EUR', shipping_country: 'FR' } }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as {
      results: Array<{
        id: string
        variants: Array<{ id: string; price: { amount: number; currency: string } }>
      }>
    }
    expect(body.results.map((product) => product.id)).toEqual([productA])
    expect(body.results[0]?.variants).toEqual([expect.objectContaining({
      id: '101',
      price: { amount: 29, currency: 'EUR' },
    })])
    expect(embeddingsCreateMock).toHaveBeenCalled()
  })

  it('falls back to lexical search when embeddings are unavailable', async () => {
    embeddingsCreateMock.mockRejectedValueOnce(new Error('OpenAI unavailable'))
    const app = new Hono()
    app.use('/v1/*', authMiddleware)
    app.route('/v1/search', searchRouter)
    const response = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'X-CAP-Key': validKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Tenant A Shoe' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { results: Array<{ id: string }> }
    expect(body.results.map((product) => product.id)).toContain(productA)
  })

  it('treats continue-selling variants as purchasable at zero stock', async () => {
    await prisma.productRaw.updateMany({
      where: { merchantId: merchantA },
      data: {
        variants: [{
          id: 101,
          inventory_item_id: 9001,
          inventory_quantity: 0,
          inventory_management: 'shopify',
          inventory_policy: 'CONTINUE',
          price: '29.00',
          title: 'Default',
        }],
      },
    })
    const app = new Hono()
    app.use('/v1/*', authMiddleware)
    app.route('/v1/search', searchRouter)
    const response = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'X-CAP-Key': validKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'shoe', filters: { in_stock: true } }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as {
      results: Array<{ id: string; availability: { in_stock: boolean } }>
    }
    expect(body.results).toContainEqual(expect.objectContaining({
      id: productA,
      availability: expect.objectContaining({ in_stock: true }),
    }))
  })

  it('completes the Shopify OAuth lifecycle and blocks callback replay', async () => {
    process.env.SHOPIFY_API_KEY = 'integration-client-id'
    process.env.SHOPIFY_SCOPES = 'read_products,read_inventory,read_orders'
    process.env.SHOPIFY_APP_URL = 'https://api.integration.test'
    process.env.DASHBOARD_URL = 'https://dashboard.integration.test'

    const install = await oauthRouter.request(`/install?shop=${oauthDomain}`)
    expect(install.status).toBe(302)
    const authorizationUrl = new URL(install.headers.get('location')!)
    const state = authorizationUrl.searchParams.get('state')!
    expect(authorizationUrl.hostname).toBe(oauthDomain)
    expect(authorizationUrl.searchParams.get('scope')).toBe(process.env.SHOPIFY_SCOPES)

    const createdTopics: string[] = []
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/admin/oauth/access_token')) {
        const body = init?.body as URLSearchParams
        expect(body.get('expiring')).toBe('1')
        return new Response(JSON.stringify({
          access_token: 'shpat_oauth_access',
          refresh_token: 'shprt_oauth_refresh',
          expires_in: 3600,
          refresh_token_expires_in: 7_776_000,
          scope: process.env.SHOPIFY_SCOPES,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      const request = JSON.parse(String(init?.body)) as {
        query: string
        variables?: { topic?: string }
      }
      expect(init?.headers).toMatchObject({ 'X-Shopify-Access-Token': 'shpat_oauth_access' })
      if (request.query.includes('CapShopConfiguration')) {
        return new Response(JSON.stringify({
          data: {
            shop: {
              name: 'CAP OAuth Store',
              currencyCode: 'EUR',
              shipsToCountries: ['FR', 'BE'],
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (request.query.includes('CapStorefrontTokens')) {
        return new Response(JSON.stringify({
          data: {
            shop: {
              storefrontAccessTokens: {
                nodes: [{ accessToken: 'storefront-oauth', title: 'CAP' }],
              },
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (request.query.includes('CapWebhookSubscriptions')) {
        return new Response(JSON.stringify({
          data: { webhookSubscriptions: { nodes: [] } },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (request.query.includes('CapWebhookCreate')) {
        createdTopics.push(request.variables?.topic ?? '')
        return new Response(JSON.stringify({
          data: {
            webhookSubscriptionCreate: {
              webhookSubscription: { id: `gid://shopify/WebhookSubscription/${createdTopics.length}` },
              userErrors: [],
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error(`Unexpected Shopify request: ${request.query}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const callbackParams = {
      code: 'oauth-code',
      shop: oauthDomain,
      state,
      timestamp: String(Math.floor(Date.now() / 1000)),
    }
    const message = Object.entries(callbackParams)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&')
    const hmac = crypto
      .createHmac('sha256', 'integration-shopify-secret')
      .update(message)
      .digest('hex')
    const callbackQuery = new URLSearchParams({ ...callbackParams, hmac }).toString()

    try {
      const callback = await oauthRouter.request(`/callback?${callbackQuery}`)
      expect(callback.status).toBe(302)
      expect(new URL(callback.headers.get('location')!).origin).toBe('https://dashboard.integration.test')
      expect(createdTopics).toEqual([...CAP_WEBHOOK_TOPICS])

      const merchant = await prisma.merchant.findUniqueOrThrow({
        where: { shopifyDomain: oauthDomain },
        include: { members: true, dashboardLoginTokens: true },
      })
      expect(decryptToken(merchant.shopifyToken!)).toBe('shpat_oauth_access')
      expect(decryptToken(merchant.shopifyRefreshToken!)).toBe('shprt_oauth_refresh')
      expect(decryptToken(merchant.storefrontToken!)).toBe('storefront-oauth')
      expect(merchant.grantedScopes).toEqual(['read_products', 'read_inventory', 'read_orders'])
      expect(merchant.settings).toMatchObject({ supportedShippingCountries: ['FR', 'BE'] })
      expect(merchant.members).toHaveLength(1)
      expect(merchant.members[0]).toMatchObject({ role: 'OWNER', revokedAt: null })
      expect(merchant.dashboardLoginTokens).toHaveLength(1)

      const jobs = await catalogSyncQueue.getJobs(['waiting', 'delayed', 'prioritized'])
      expect(jobs.some((job) => job.data.merchantId === merchant.id)).toBe(true)

      const replay = await oauthRouter.request(`/callback?${callbackQuery}`)
      expect(replay.status).toBe(400)
    } finally {
      vi.unstubAllGlobals()
      const merchant = await prisma.merchant.findUnique({ where: { shopifyDomain: oauthDomain } })
      if (merchant) {
        const jobs = await catalogSyncQueue.getJobs(['waiting', 'delayed', 'prioritized'])
        await Promise.all(jobs.filter((job) => job.data.merchantId === merchant.id).map((job) => job.remove()))
        await prisma.merchant.delete({ where: { id: merchant.id } })
      }
    }
  })

  it('reports uninstalled or erased shops as inactive installs', async () => {
    const { InactiveInstallError } = await import('../lib/shopify-token.js')
    await expect(getValidShopifyAdminToken(crypto.randomUUID())).rejects.toBeInstanceOf(InactiveInstallError)
  })

  it('rotates expiring offline credentials and disables an install that loses scopes', async () => {
    process.env.SHOPIFY_API_KEY = 'integration-client-id'
    process.env.SHOPIFY_SCOPES = 'read_products,read_inventory,read_orders'
    const merchant = await prisma.merchant.create({
      data: {
        shopifyDomain: refreshDomain,
        shopifyToken: encryptToken('shpat_expired'),
        shopifyRefreshToken: encryptToken('shprt_first'),
        accessTokenExpiresAt: new Date(Date.now() - 60_000),
        refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
        grantedScopes: ['read_products', 'read_inventory', 'read_orders'],
      },
    })
    const responses = [
      {
        access_token: 'shpat_rotated',
        refresh_token: 'shprt_rotated',
        expires_in: 3600,
        refresh_token_expires_in: 7_776_000,
        scope: 'read_products,read_inventory,read_orders',
      },
      {
        access_token: 'shpat_scope_loss',
        refresh_token: 'shprt_scope_loss',
        expires_in: 3600,
        refresh_token_expires_in: 7_776_000,
        scope: 'read_products,read_inventory',
      },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    try {
      expect(await getValidShopifyAdminToken(merchant.id)).toBe('shpat_rotated')
      const rotated = await prisma.merchant.findUniqueOrThrow({ where: { id: merchant.id } })
      expect(decryptToken(rotated.shopifyToken!)).toBe('shpat_rotated')
      expect(decryptToken(rotated.shopifyRefreshToken!)).toBe('shprt_rotated')

      await prisma.merchant.update({
        where: { id: merchant.id },
        data: { accessTokenExpiresAt: new Date(Date.now() - 60_000) },
      })
      await expect(getValidShopifyAdminToken(merchant.id)).rejects.toThrow(/lost required scopes/)
      const disabled = await prisma.merchant.findUniqueOrThrow({ where: { id: merchant.id } })
      expect(disabled.shopifyToken).toBeNull()
      expect(disabled.shopifyRefreshToken).toBeNull()
      expect(disabled.grantedScopes).toEqual(['read_products', 'read_inventory'])
    } finally {
      vi.unstubAllGlobals()
      await prisma.merchant.delete({ where: { id: merchant.id } })
    }
  })

  it('processes an inventory webhook once and persists stock', async () => {
    await prisma.productRaw.updateMany({
      where: { merchantId: merchantA },
      data: {
        variants: [{
          id: 101,
          inventory_item_id: 9001,
          inventory_quantity: 4,
          inventory_management: 'shopify',
          inventory_policy: 'DENY',
          inventory_levels: [
            { location_id: 10, location_name: 'Paris', available: 2 },
            { location_id: 20, location_name: 'Lyon', available: 2 },
          ],
          price: '29.00',
          title: 'Default',
        }],
      },
    })
    const payload = JSON.stringify({ inventory_item_id: 9001, location_id: 10, available: 0 })
    const hmac = crypto.createHmac('sha256', 'integration-shopify-secret').update(payload).digest('base64')
    const request = () => webhookRouter.request('/shopify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Hmac-Sha256': hmac,
        'X-Shopify-Topic': 'inventory_levels/update',
        'X-Shopify-Shop-Domain': domains[0]!,
        'X-Shopify-Webhook-Id': `inventory-${suffix}`,
      },
      body: payload,
    })
    expect((await request()).status).toBe(200)
    expect(await (await request()).json()).toMatchObject({ duplicate: true })
    const raw = await prisma.productRaw.findFirstOrThrow({ where: { merchantId: merchantA } })
    expect((raw.variants as Array<{ inventory_quantity: number }>)[0]?.inventory_quantity).toBe(2)
  })

  it('creates checkout state with deterministic Shopify tracking', async () => {
    await prisma.productRaw.updateMany({
      where: { merchantId: merchantA },
      data: { variants: [{ id: 101, inventory_item_id: 9001, price: '29.00', inventory_quantity: 4, title: 'Default' }] },
    })
    const app = new Hono()
    app.use('/v1/*', authMiddleware)
    app.route('/v1/checkout', checkoutRouter)
    const response = await app.request('/v1/checkout/initiate', {
      method: 'POST',
      headers: { 'X-CAP-Key': validKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productA, quantity: 1, shipping_country: 'FR' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { agent_checkout_id: string }
    const checkout = await prisma.agentCheckout.findUniqueOrThrow({ where: { id: body.agent_checkout_id } })
    expect(checkout.trackingToken).toMatch(/^[a-f0-9]{64}$/)
    expect(createShopifyCartMock).toHaveBeenCalledWith(
      domains[0],
      'storefront',
      expect.objectContaining({ trackingToken: checkout.trackingToken, shippingCountry: 'FR' }),
    )
  })

  it('rejects checkout for a country outside Shopify shipping destinations', async () => {
    const app = new Hono()
    app.use('/v1/*', authMiddleware)
    app.route('/v1/checkout', checkoutRouter)
    const response = await app.request('/v1/checkout/initiate', {
      method: 'POST',
      headers: { 'X-CAP-Key': validKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productA, quantity: 1, shipping_country: 'US' }),
    })
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'SHIPPING_COUNTRY_UNAVAILABLE' },
    })
  })

  it('replays an idempotent checkout instead of creating a second cart', async () => {
    createShopifyCartMock.mockClear()
    const app = new Hono()
    app.use('/v1/*', authMiddleware)
    app.route('/v1/checkout', checkoutRouter)
    const send = (body: unknown, idempotencyKey = `idem-${suffix}`) => app.request('/v1/checkout/initiate', {
      method: 'POST',
      headers: {
        'X-CAP-Key': validKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    })
    const body = { product_id: productA, quantity: 1, shipping_country: 'FR' }

    const first = await send(body)
    expect(first.status).toBe(200)
    const firstBody = await first.json()
    const replay = await send(body)
    expect(replay.status).toBe(200)
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true')
    expect(await replay.json()).toEqual(firstBody)
    expect(createShopifyCartMock).toHaveBeenCalledTimes(1)

    const reused = await send({ ...body, quantity: 2 })
    expect(reused.status).toBe(422)
    await expect(reused.json()).resolves.toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } })
    expect((await send(body, 'not a valid key')).status).toBe(400)
  })

  it('reports in-progress and unknown outcomes for an unfinished idempotent checkout', async () => {
    const app = new Hono()
    app.use('/v1/*', authMiddleware)
    app.route('/v1/checkout', checkoutRouter)
    const body = { product_id: productA, quantity: 1, shipping_country: 'FR' }
    const requestHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')
    const send = (idempotencyKey: string) => app.request('/v1/checkout/initiate', {
      method: 'POST',
      headers: { 'X-CAP-Key': validKey, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    })
    const seed = (idempotencyKey: string, createdAt: Date) => prisma.agentCheckout.create({
      data: {
        merchantId: merchantA,
        productId: productA,
        trackingToken: crypto.randomBytes(32).toString('hex'),
        status: 'creating',
        idempotencyKey,
        requestHash,
        createdAt,
      },
    })
    await seed(`running-${suffix}`, new Date())
    await seed(`stuck-${suffix}`, new Date(Date.now() - 10 * 60_000))

    const running = await send(`running-${suffix}`)
    expect(running.status).toBe(409)
    await expect(running.json()).resolves.toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_IN_PROGRESS' } })
    const stuck = await send(`stuck-${suffix}`)
    expect(stuck.status).toBe(409)
    await expect(stuck.json()).resolves.toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_OUTCOME_UNKNOWN' } })
  })

  it('replays an upstream failure instead of retrying under the same key', async () => {
    createShopifyCartMock.mockClear()
    createShopifyCartMock.mockRejectedValueOnce(new Error('Shopify timeout'))
    const app = new Hono()
    app.use('/v1/*', authMiddleware)
    app.route('/v1/checkout', checkoutRouter)
    const send = () => app.request('/v1/checkout/initiate', {
      method: 'POST',
      headers: { 'X-CAP-Key': validKey, 'Content-Type': 'application/json', 'Idempotency-Key': `failed-${suffix}` },
      body: JSON.stringify({ product_id: productA, quantity: 1, shipping_country: 'FR' }),
    })
    expect((await send()).status).toBe(502)
    const replay = await send()
    expect(replay.status).toBe(502)
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true')
    expect(createShopifyCartMock).toHaveBeenCalledTimes(1)
  })

  it('hides draft products from search, compare and checkout', async () => {
    // A second, active product so compare has something valid to pair with.
    const otherRaw = await prisma.productRaw.create({
      data: {
        merchantId: merchantA,
        shopifyId: BigInt(`3${Date.now()}`),
        title: 'Tenant A Sandal',
        status: 'active',
        variants: [{ id: 103, price: '19.00', inventory_quantity: 3, title: 'Default' }],
        images: [],
      },
    })
    const other = await prisma.productEnriched.create({
      data: {
        productRawId: otherRaw.id, merchantId: merchantA, specs: {}, useCases: [],
        targetAudience: [], certifications: [], comparisonTags: [], priceMin: 19,
        priceMax: 19, currency: 'EUR',
      },
    })
    await prisma.productRaw.updateMany({ where: { id: { not: otherRaw.id }, merchantId: merchantA }, data: { status: 'draft' } })
    try {
      const app = new Hono()
      app.use('/v1/*', authMiddleware)
      app.route('/v1/search', searchRouter)
      app.route('/v1/compare', compareRouter)
      app.route('/v1/checkout', checkoutRouter)
      const compare = await app.request('/v1/compare', {
        method: 'POST',
        headers: { 'X-CAP-Key': validKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: [productA, other.id] }),
      })
      expect(compare.status).toBe(404)

      const search = await app.request('/v1/search', {
        method: 'POST',
        headers: { 'X-CAP-Key': validKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'draft visibility check' }),
      })
      expect(search.status).toBe(200)
      const body = await search.json() as { results: Array<{ id: string }> }
      expect(body.results.map((product) => product.id)).not.toContain(productA)

      const checkout = await app.request('/v1/checkout/initiate', {
        method: 'POST',
        headers: { 'X-CAP-Key': validKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productA, quantity: 1, shipping_country: 'FR' }),
      })
      expect(checkout.status).toBe(404)
      await expect(checkout.json()).resolves.toMatchObject({ error: { code: 'PRODUCT_NOT_FOUND' } })
    } finally {
      await prisma.productRaw.delete({ where: { id: otherRaw.id } })
      await prisma.productRaw.updateMany({ where: { merchantId: merchantA }, data: { status: 'active' } })
    }
  })

  it('rate limits a key after its plan quota', async () => {
    const key = await createKey(merchantA, 'integration-rate-limit')
    const app = protectedApp()
    let response: Response | undefined
    for (let index = 0; index < 101; index++) {
      response = await app.request('/', { headers: { 'X-CAP-Key': key } })
    }
    expect(response?.status).toBe(429)
    const hash = crypto.createHash('sha256').update(key).digest('hex')
    await redis.del(`apikey:${hash}`, `rl:${hash}`)
  })

  it('revokes credentials when Shopify uninstalls the app', async () => {
    const inviter = await prisma.user.create({ data: { externalId: `inviter-${suffix}` } })
    const invitation = await prisma.merchantInvitation.create({
      data: {
        merchantId: merchantB,
        email: `invitee-${suffix}@example.test`,
        tokenHash: crypto.randomBytes(32).toString('hex'),
        invitedByUserId: inviter.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    })
    const payload = '{}'
    const hmac = crypto.createHmac('sha256', 'integration-shopify-secret').update(payload).digest('base64')
    const response = await webhookRouter.request('/shopify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Hmac-Sha256': hmac,
        'X-Shopify-Topic': 'app/uninstalled',
        'X-Shopify-Shop-Domain': domains[1]!,
        'X-Shopify-Webhook-Id': `uninstall-${suffix}`,
      },
      body: payload,
    })
    expect(response.status).toBe(200)
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { id: merchantB } })
    expect(merchant.shopifyToken).toBeNull()
    expect(merchant.storefrontToken).toBeNull()
    expect(merchant.uninstalledAt).toBeInstanceOf(Date)
    const revoked = await prisma.merchantInvitation.findUniqueOrThrow({ where: { id: invitation.id } })
    expect(revoked.revokedAt).toBeInstanceOf(Date)
    await prisma.user.delete({ where: { id: inviter.id } })
  })

  it('handles the Shopify GDPR compliance webhooks', async () => {
    const checkout = await prisma.agentCheckout.create({
      data: {
        merchantId: merchantA,
        productId: productA,
        trackingToken: crypto.randomBytes(32).toString('hex'),
        status: 'completed',
        shopifyOrderId: '555001',
      },
    })
    expect((await signedWebhook('customers/redact', domains[0]!, `redact-${suffix}`, {
      orders_to_redact: [555001],
    })).status).toBe(200)
    expect((await prisma.agentCheckout.findUniqueOrThrow({ where: { id: checkout.id } })).shopifyOrderId).toBeNull()

    expect((await signedWebhook('customers/data_request', domains[0]!, `data-request-${suffix}`)).status).toBe(200)

    // An installed shop is never erased. The webhook fails (durable failed
    // event) so Shopify redelivers once the uninstall is recorded.
    expect((await signedWebhook('shop/redact', domains[0]!, `shop-redact-a-${suffix}`)).status).toBe(500)
    expect(await prisma.merchant.findUnique({ where: { id: merchantA } })).not.toBeNull()
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { webhookId: `shop-redact-a-${suffix}` } })).status)
      .toBe('failed')

    // Shopify only sends shop/redact after an uninstall: record it here so the
    // test does not depend on the uninstall test above (idempotent if it ran).
    expect((await signedWebhook('app/uninstalled', domains[1]!, `gdpr-uninstall-${suffix}`)).status).toBe(200)
    // Everything of the uninstalled shop is erased, including cached API key lookups.
    await prisma.agentQuery.create({
      data: { merchantId: merchantB, agentId: 'gdpr', queryText: `gift idea ${suffix}` },
    })
    const keyB = await createKey(merchantB, 'gdpr-cached-key')
    const keyBHash = crypto.createHash('sha256').update(keyB).digest('hex')
    await redis.set(`apikey:${keyBHash}`, JSON.stringify({ merchantId: merchantB }))
    expect((await signedWebhook('shop/redact', domains[1]!, `shop-redact-b-${suffix}`)).status).toBe(200)
    expect(JSON.parse(await redis.get(`apikey:${keyBHash}`) ?? 'null')).toBe('invalidated')
    expect(await prisma.merchant.findUnique({ where: { id: merchantB } })).toBeNull()
    expect(await prisma.productEnriched.findUnique({ where: { id: productB } })).toBeNull()
    expect(await prisma.agentQuery.count({ where: { queryText: `gift idea ${suffix}` } })).toBe(0)
  })

  it('purges agent queries past their retention period', async () => {
    const old = await prisma.agentQuery.create({
      data: {
        merchantId: merchantA,
        agentId: 'retention',
        queryText: 'old query',
        createdAt: new Date(Date.now() - 400 * 86_400_000),
      },
    })
    const fresh = await prisma.agentQuery.create({
      data: { merchantId: merchantA, agentId: 'retention', queryText: 'fresh query' },
    })
    const orphan = await prisma.agentQuery.create({
      data: { merchantId: null, agentId: 'retention', queryText: 'orphan query' },
    })
    const originalRetention = process.env.AGENT_QUERY_RETENTION_DAYS
    process.env.AGENT_QUERY_RETENTION_DAYS = '180'
    let result: Awaited<ReturnType<typeof runRetention>>
    try {
      result = await runRetention()
    } finally {
      if (originalRetention === undefined) delete process.env.AGENT_QUERY_RETENTION_DAYS
      else process.env.AGENT_QUERY_RETENTION_DAYS = originalRetention
    }
    expect(result.agentQueries).toBeGreaterThanOrEqual(2)
    expect(await prisma.agentQuery.findUnique({ where: { id: orphan.id } })).toBeNull()
    expect(await prisma.agentQuery.findUnique({ where: { id: old.id } })).toBeNull()
    expect(await prisma.agentQuery.findUnique({ where: { id: fresh.id } })).not.toBeNull()
  })

  it('invalidates a merchant search cache in one step', async () => {
    const request = { query: 'shoe', limit: 5 }
    const before = await searchCacheKey(merchantA, request)
    expect(before).toBe(await searchCacheKey(merchantA, request))
    await invalidateMerchantSearchCache(merchantA)
    const after = await searchCacheKey(merchantA, request)
    expect(after).not.toBeNull()
    expect(after).not.toBe(before)
  })

  it('reports dependency readiness and protects operational metrics', async () => {
    process.env.CAP_OPERATIONS_TOKEN = 'integration-operations-secret-at-least-32-chars'
    try {
      await expect(checkReadiness()).resolves.toMatchObject({
        ready: true,
        checks: { postgres: 'ok', redis: 'ok' },
      })
      expect((await operationsRouter.request('/queues')).status).toBe(401)
      const metrics = await operationsRouter.request('/metrics', {
        headers: { Authorization: `Bearer ${process.env.CAP_OPERATIONS_TOKEN}` },
      })
      expect(metrics.status).toBe(200)
      expect(metrics.headers.get('content-type')).toContain('text/plain')
      const body = await metrics.text()
      expect(body).toContain('cap_merchants_active')
      expect(body).toContain('cap_queue_jobs{queue="enrichment"')
      expect(body).toContain('cap_webhook_events_total')
    } finally {
      delete process.env.CAP_OPERATIONS_TOKEN
    }
  })

  it('queues a full catalog sync for every active install on confirmation', async () => {
    process.env.CAP_OPERATIONS_TOKEN = 'integration-operations-secret-at-least-32-chars'
    const startedAt = Date.now()
    try {
      const request = (body: unknown) => operationsRouter.request('/catalog-sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.CAP_OPERATIONS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      expect((await request({})).status).toBe(400)
      const response = await request({ confirm: true })
      expect(response.status).toBe(200)
      const { queued } = await response.json() as { queued: number }
      expect(queued).toBeGreaterThanOrEqual(1)
      const jobs = await catalogSyncQueue.getJobs(['waiting', 'prioritized', 'delayed'])
      expect(jobs.some((job) => job.id?.startsWith(`operations-resync-${merchantA}-`))).toBe(true)

      // A second confirmation while those jobs wait does not queue them twice.
      expect((await request({ confirm: true })).status).toBe(200)
      const afterRetry = await catalogSyncQueue.getJobs(['waiting', 'prioritized', 'delayed'])
      expect(afterRetry.filter((job) => job.id?.startsWith(`operations-resync-${merchantA}-`))).toHaveLength(1)
    } finally {
      delete process.env.CAP_OPERATIONS_TOKEN
      // The fake stores must never reach a running catalog worker.
      const queued = await catalogSyncQueue.getJobs(['waiting', 'prioritized', 'delayed'])
      await Promise.all(queued
        .filter((job) => job.id?.startsWith('operations-resync-') && job.timestamp >= startedAt)
        .map((job) => job.remove()))
    }
  })

  it('queues one re-enrichment per shop after an enrichment version change', async () => {
    const startedAt = Date.now()
    const jobId = `enrichment-version-${ENRICHMENT_VERSION}-${merchantA}`
    const queuedFor = async () => (await catalogSyncQueue.getJobs(['delayed', 'waiting', 'prioritized']))
      .filter((job) => job.id === jobId)
    try {
      await prisma.$executeRaw`
        UPDATE merchants SET settings = settings || '{"enrichmentVersion":"2000-01-01"}'::jsonb
        WHERE id = ${merchantA}::uuid
      `
      expect(await queueOutdatedEnrichmentResyncs()).toBeGreaterThanOrEqual(1)
      // A restart (or a second worker) does not queue the same shop twice.
      await queueOutdatedEnrichmentResyncs()
      expect(await queuedFor()).toHaveLength(1)

      // Once a full sync ran under the current version, nothing is queued.
      await Promise.all((await queuedFor()).map((job) => job.remove()))
      await prisma.$executeRaw`
        UPDATE merchants SET settings = settings || ${JSON.stringify({ enrichmentVersion: ENRICHMENT_VERSION })}::jsonb
        WHERE id = ${merchantA}::uuid
      `
      await queueOutdatedEnrichmentResyncs()
      expect(await queuedFor()).toHaveLength(0)
    } finally {
      const queued = await catalogSyncQueue.getJobs(['delayed', 'waiting', 'prioritized'])
      await Promise.all(queued
        .filter((job) => job.id?.startsWith('enrichment-version-') && job.timestamp >= startedAt)
        .map((job) => job.remove()))
    }
  })

  it('requires confirmation and replays a dead-letter job once', async () => {
    process.env.CAP_OPERATIONS_TOKEN = 'integration-operations-secret-at-least-32-chars'
    const deadLetter = await deadLetterQueue.add(`integration-dlq-${suffix}`, {
      sourceQueue: 'enrichment',
      sourceJobId: `source-${suffix}`,
      data: {
        shopDomain: domains[0],
        shopifyProductId: '123',
        merchantId: merchantA,
        action: 'update',
      },
      attemptsMade: 3,
      failedReason: 'Integration failure',
      failedAt: new Date().toISOString(),
    })
    let replayJobId: string | undefined
    const headers = {
      Authorization: `Bearer ${process.env.CAP_OPERATIONS_TOKEN}`,
      'Content-Type': 'application/json',
    }
    try {
      const withoutConfirmation = await operationsRouter.request(
        `/dead-letter/${deadLetter.id}/replay`,
        { method: 'POST', headers, body: '{}' },
      )
      expect(withoutConfirmation.status).toBe(400)

      const replay = await operationsRouter.request(
        `/dead-letter/${deadLetter.id}/replay`,
        { method: 'POST', headers, body: JSON.stringify({ confirm: true }) },
      )
      expect(replay.status).toBe(200)
      const replayBody = await replay.json() as { replay_job_id: string }
      replayJobId = replayBody.replay_job_id
      expect(await deadLetterQueue.getJob(deadLetter.id!)).toBeUndefined()
      expect(await enrichmentQueue.getJob(replayJobId)).toBeDefined()

      const secondReplay = await operationsRouter.request(
        `/dead-letter/${deadLetter.id}/replay`,
        { method: 'POST', headers, body: JSON.stringify({ confirm: true }) },
      )
      expect(secondReplay.status).toBe(404)
    } finally {
      if (replayJobId) await (await enrichmentQueue.getJob(replayJobId))?.remove()
      await (await deadLetterQueue.getJob(deadLetter.id!))?.remove()
      delete process.env.CAP_OPERATIONS_TOKEN
    }
  })
})

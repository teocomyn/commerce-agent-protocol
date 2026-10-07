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
import { redis } from '../lib/redis.js'
import { catalogSyncQueue, deadLetterQueue, enrichmentQueue } from '../lib/queue.js'
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
    await Promise.all([enrichmentQueue.close(), catalogSyncQueue.close(), deadLetterQueue.close()])
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
    await redis.del(`apikey:${hash}`, `rl:${hash}`)
    expect((await protectedApp().request('/', { headers: { 'X-CAP-Key': key } })).status).toBe(401)
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

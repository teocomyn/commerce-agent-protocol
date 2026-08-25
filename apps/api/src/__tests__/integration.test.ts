import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { prisma } from '@cap/db'
import { authMiddleware } from '../middleware/auth.js'
import { compareRouter } from '../routes/compare.js'
import { searchRouter } from '../routes/search.js'
import { webhookRouter } from '../routes/webhooks.js'
import { checkoutRouter } from '../routes/checkout.js'
import { encryptToken } from '../lib/shopify.js'
import { redis } from '../lib/redis.js'
import { catalogSyncQueue, deadLetterQueue, enrichmentQueue } from '../lib/queue.js'

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
        variants: [{ id: 101, inventory_item_id: 9001, price: '29.00', inventory_quantity: 4, title: 'Default' }],
        images: [],
      },
    })
    const rawB = await prisma.productRaw.create({
      data: {
        merchantId: merchantB,
        shopifyId: BigInt(`2${Date.now()}`),
        title: 'Tenant B Shoe',
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
    const body = await response.json() as { results: Array<{ id: string }> }
    expect(body.results.map((product) => product.id)).toEqual([productA])
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

  it('processes an inventory webhook once and persists stock', async () => {
    const payload = JSON.stringify({ inventory_item_id: 9001, available: 0 })
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
    expect((raw.variants as Array<{ inventory_quantity: number }>)[0]?.inventory_quantity).toBe(0)
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
})

import crypto from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@cap/db'
import type { ShopifyProduct } from '../lib/shopify.js'

const chatCreateMock = vi.hoisted(() => vi.fn(async () => ({
  choices: [{
    message: {
      content: JSON.stringify({
        category: 'Footwear > Sneakers',
        subcategory: 'Sneakers',
        specs: [{ name: 'material', value: 'leather' }, { name: 'weight_g', value: 310 }],
        use_cases: ['city'],
        target_audience: ['adults'],
        care_info: null,
        size_guide: null,
        summary: 'A white leather sneaker.',
      }),
    },
  }],
})))
const embeddingsCreateMock = vi.hoisted(() => vi.fn(async () => ({
  data: [{ embedding: Array.from({ length: 1536 }, () => 0.01) }],
})))
const fetchShopifyProductMock = vi.hoisted(() => vi.fn())

vi.mock('openai', () => ({
  default: class OpenAITestDouble {
    chat = { completions: { create: chatCreateMock } }
    embeddings = { create: embeddingsCreateMock }
  },
}))
vi.mock('../lib/shopify.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/shopify.js')>(),
  fetchShopifyProduct: fetchShopifyProductMock,
}))
const getValidShopifyAdminTokenMock = vi.hoisted(() => vi.fn(async (_merchantId: string) => 'admin-token'))
vi.mock('../lib/shopify-token.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/shopify-token.js')>(),
  getValidShopifyAdminToken: getValidShopifyAdminTokenMock,
}))

const { runEnrichmentJob } = await import('../lib/enrichment-pipeline.js')
const { catalogSyncQueue, deadLetterQueue, enrichmentQueue, maintenanceQueue } = await import('../lib/queue.js')
const { redis } = await import('../lib/redis.js')

const shopDomain = `cap-pipeline-${crypto.randomBytes(5).toString('hex')}.myshopify.com`
const shopifyProductId = '7001'
let merchantId: string

function product(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: Number(shopifyProductId),
    title: 'Leather sneaker',
    body_html: '<p>White leather sneaker.</p>',
    vendor: 'Brand',
    product_type: 'Shoes',
    tags: 'white, leather',
    status: 'active',
    variants: [{
      id: 70011,
      inventory_item_id: 80011,
      title: 'Default',
      price: '110.00',
      sku: null,
      inventory_quantity: 5,
      inventory_management: 'shopify',
      inventory_policy: 'DENY',
      inventory_levels: [],
      option1: null,
      option2: null,
      option3: null,
      weight: 0,
      weight_unit: 'kg',
    }],
    images: [{ id: 1, src: 'https://cdn.example/1.jpg', alt: 'White sneaker', width: 100, height: 100 }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    currency: 'EUR',
    metafields: [{ namespace: 'cap', key: 'certifications', type: 'list.single_line_text_field', value: '["LWG Gold"]' }],
    shop_policies: [],
    shipping_countries: ['FR'],
    ...overrides,
  }
}

const job = { id: 'test-job', updateProgress: async () => undefined }

// Each test starts from a known state: no product, or the product enriched
// once from product(). Mock call counts are reset after seeding.
async function seedEnrichedProduct() {
  fetchShopifyProductMock.mockResolvedValueOnce(product())
  await runEnrichmentJob({ shopDomain, shopifyProductId, merchantId, action: 'create' }, job)
  chatCreateMock.mockClear()
  embeddingsCreateMock.mockClear()
}

async function enrichedRow() {
  const raw = await prisma.productRaw.findUniqueOrThrow({
    where: { merchantId_shopifyId: { merchantId, shopifyId: BigInt(shopifyProductId) } },
    include: { productEnriched: true },
  })
  return raw
}

describe.sequential('enrichment pipeline', () => {
  beforeAll(async () => {
    const merchant = await prisma.merchant.create({
      data: { shopifyDomain: shopDomain, shopifyToken: 'v2:not-decrypted-in-this-test' },
    })
    merchantId = merchant.id
  })

  beforeEach(async () => {
    chatCreateMock.mockClear()
    embeddingsCreateMock.mockClear()
    // Drop call history and any product queued by a test that failed early.
    fetchShopifyProductMock.mockReset()
    await prisma.productRaw.deleteMany({ where: { merchantId } })
    await prisma.merchant.update({ where: { id: merchantId }, data: { uninstalledAt: null } })
  })

  afterAll(async () => {
    // Snapshot jobs scheduled by these runs must not reach a real worker.
    const jobs = await catalogSyncQueue.getJobs(['waiting', 'prioritized', 'delayed'])
    await Promise.all(jobs
      .filter((queued) => queued.id?.startsWith(`inventory-snapshot-${merchantId}-`))
      .map((queued) => queued.remove()))
    await prisma.merchant.deleteMany({ where: { shopifyDomain: shopDomain } })
    await prisma.$disconnect()
    await Promise.all([
      enrichmentQueue.close(),
      catalogSyncQueue.close(),
      maintenanceQueue.close(),
      deadLetterQueue.close(),
    ])
    await redis.quit()
  })

  it('enriches a new product once and stores merchant-declared claims', async () => {
    fetchShopifyProductMock.mockResolvedValueOnce(product())
    const result = await runEnrichmentJob({ shopDomain, shopifyProductId, merchantId, action: 'create' }, job)
    expect(result).toMatchObject({ llm: true })
    expect(chatCreateMock).toHaveBeenCalledTimes(1)
    expect(embeddingsCreateMock).toHaveBeenCalledTimes(1)
    const raw = await enrichedRow()
    expect(raw.productEnriched?.certifications).toEqual(['LWG Gold'])
    expect(raw.productEnriched?.specs).toEqual({ material: 'leather', weight_g: 310 })
    expect(Number(raw.productEnriched?.priceMin)).toBe(110)
  })

  it('refreshes prices without calling the LLM when the content is unchanged', async () => {
    await seedEnrichedProduct()
    fetchShopifyProductMock.mockResolvedValueOnce(product({
      variants: [{ ...product().variants[0]!, price: '95.00' }],
    }))
    const result = await runEnrichmentJob({ shopDomain, shopifyProductId, merchantId, action: 'update' }, job)
    expect(result).toMatchObject({ llm: false })
    expect(chatCreateMock).not.toHaveBeenCalled()
    expect(embeddingsCreateMock).not.toHaveBeenCalled()
    const raw = await enrichedRow()
    expect(Number(raw.productEnriched?.priceMin)).toBe(95)
    expect(raw.productEnriched?.specs).toEqual({ material: 'leather', weight_g: 310 })
  })

  it('keeps known inventory levels across a product re-sync', async () => {
    await seedEnrichedProduct()
    const levels = [{ location_id: 10, location_name: 'Paris', available: 5 }]
    await prisma.productRaw.update({
      where: { merchantId_shopifyId: { merchantId, shopifyId: BigInt(shopifyProductId) } },
      data: { variants: [{ ...product().variants[0]!, inventory_levels: levels }] },
    })
    fetchShopifyProductMock.mockResolvedValueOnce(product())
    await runEnrichmentJob({ shopDomain, shopifyProductId, merchantId, action: 'update' }, job)
    const raw = await enrichedRow()
    expect((raw.variants as Array<{ inventory_levels: unknown }>)[0]?.inventory_levels).toEqual(levels)
  })

  it('never overwrites a newer stored revision with an older Shopify response', async () => {
    await seedEnrichedProduct()
    const before = await enrichedRow()
    fetchShopifyProductMock.mockResolvedValueOnce(product({
      title: 'Outdated title',
      updated_at: new Date(Date.now() - 86_400_000).toISOString(),
    }))
    const result = await runEnrichmentJob({ shopDomain, shopifyProductId, merchantId, action: 'update' }, job)
    expect(result).toMatchObject({ skipped: 'stale' })
    expect((await enrichedRow()).title).toBe(before.title)
  })

  it('lets only the newest of two overlapping responses land', async () => {
    await seedEnrichedProduct()
    const newer = new Date(Date.now() + 60_000).toISOString()
    const older = new Date(Date.now() + 30_000).toISOString()
    fetchShopifyProductMock
      .mockResolvedValueOnce(product({ title: 'Newest title', updated_at: newer }))
      .mockResolvedValueOnce(product({ title: 'Older title', updated_at: older }))
    const results = await Promise.all([
      runEnrichmentJob({ shopDomain, shopifyProductId, merchantId, action: 'update' }, job),
      runEnrichmentJob({ shopDomain, shopifyProductId, merchantId, action: 'update' }, job),
    ])
    expect((await enrichedRow()).title).toBe('Newest title')
    expect(results.filter((result) => 'skipped' in result && result.skipped === 'stale').length).toBeLessThanOrEqual(1)
  })

  it('enriches again when the description changes', async () => {
    await seedEnrichedProduct()
    fetchShopifyProductMock.mockResolvedValueOnce(product({ body_html: '<p>Black leather sneaker.</p>' }))
    const result = await runEnrichmentJob({ shopDomain, shopifyProductId, merchantId, action: 'update' }, job)
    expect(result).toMatchObject({ llm: true })
    expect(chatCreateMock).toHaveBeenCalledTimes(1)
  })

  it('skips jobs once the shop has uninstalled the app', async () => {
    await prisma.merchant.update({ where: { id: merchantId }, data: { uninstalledAt: new Date() } })
    // The real token helper raises this for an uninstalled or erased shop.
    const { InactiveInstallError } = await import('../lib/shopify-token.js')
    getValidShopifyAdminTokenMock.mockRejectedValueOnce(new InactiveInstallError(merchantId))
    const result = await runEnrichmentJob({ shopDomain, shopifyProductId, merchantId, action: 'update' }, job)
    expect(result).toEqual({ skipped: 'merchant-inactive' })
    expect(fetchShopifyProductMock).not.toHaveBeenCalled()
  })

  it('hides a product moved to draft without calling the LLM', async () => {
    await seedEnrichedProduct()
    fetchShopifyProductMock.mockResolvedValueOnce(product({ status: 'draft', body_html: '<p>Changed.</p>' }))
    const result = await runEnrichmentJob({ shopDomain, shopifyProductId, merchantId, action: 'update' }, job)
    expect(result).toMatchObject({ skipped: 'inactive' })
    expect(chatCreateMock).not.toHaveBeenCalled()
    expect((await enrichedRow()).status).toBe('draft')
  })
})

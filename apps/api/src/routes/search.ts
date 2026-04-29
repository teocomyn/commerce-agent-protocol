import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { prisma } from '@cap/db'
import { SearchRequestSchema, type SearchResponse, type CAPError } from '@cap/shared'
import { cacheGet, cacheSet } from '../lib/redis.js'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const searchRouter = new Hono()

// POST /v1/search
searchRouter.post('/', zValidator('json', SearchRequestSchema), async (c) => {
  const startTime = Date.now()
  const body = c.req.valid('json')
  const { query, filters, limit, sort } = body

  const searchId = `srch_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`

  // Check cache for identical queries
  const cacheKey = `search:${JSON.stringify({ query, filters, limit, sort })}`
  const cached = await cacheGet<SearchResponse>(cacheKey)
  if (cached) {
    cached.latency_ms = Date.now() - startTime
    return c.json(cached)
  }

  // Generate query embedding
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
    dimensions: 1536,
  })
  const queryEmbedding = embeddingResponse.data[0]?.embedding ?? []

  // Build SQL filters
  const conditions: string[] = ['pe.deleted_at IS NULL']
  const params: (string | number | boolean | string[])[] = []
  let paramIdx = 1

  if (filters?.price_max != null) {
    conditions.push(`pe.price_min <= $${paramIdx}`)
    params.push(filters.price_max)
    paramIdx++
  }
  if (filters?.price_min != null) {
    conditions.push(`pe.price_max >= $${paramIdx}`)
    params.push(filters.price_min)
    paramIdx++
  }
  if (filters?.certifications && filters.certifications.length > 0) {
    conditions.push(`pe.certifications @> $${paramIdx}::text[]`)
    params.push(filters.certifications)
    paramIdx++
  }
  if (filters?.category) {
    conditions.push(`pe.category ILIKE $${paramIdx}`)
    params.push(`%${filters.category}%`)
    paramIdx++
  }

  // Hybrid search: vector + SQL filters
  const embeddingStr = `[${queryEmbedding.join(',')}]`
  const orderBy = sort === 'price_asc' ? 'pe.price_min ASC'
    : sort === 'price_desc' ? 'pe.price_min DESC'
    : sort === 'geo_score' ? 'pe.geo_score DESC'
    : `1 - (pe.embedding <=> '${embeddingStr}'::vector) DESC` // relevance = cosine similarity

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  interface RawProductRow {
    id: string
    title: string
    category: string | null
    subcategory: string | null
    specs: Record<string, string | number | boolean>
    use_cases: string[]
    target_audience: string[]
    certifications: string[]
    comparison_tags: string[]
    price_min: string | null
    price_max: string | null
    currency: string
    geo_score: number
    shipping_info: { free?: boolean; estimate?: string } | null
    return_policy: { days?: number } | null
    merchant_id: string
    shopify_domain: string
    merchant_plan: string
    raw_title: string
    raw_images: Array<{ src: string; alt?: string }> | null
    raw_variants: Array<{ price: string; inventory_quantity: number; title: string }> | null
    similarity: number
    total_count: string
  }

  const rawResults = await prisma.$queryRawUnsafe<RawProductRow[]>(
    `SELECT
       pe.id, pe.category, pe.subcategory, pe.specs, pe.use_cases,
       pe.target_audience, pe.certifications, pe.comparison_tags,
       pe.price_min, pe.price_max, pe.currency, pe.geo_score,
       pe.shipping_info, pe.return_policy,
       m.id as merchant_id, m.shopify_domain, m.plan as merchant_plan,
       pr.title as raw_title, pr.images as raw_images, pr.variants as raw_variants,
       1 - (pe.embedding <=> '${embeddingStr}'::vector) AS similarity,
       COUNT(*) OVER() as total_count
     FROM products_enriched pe
     JOIN products_raw pr ON pr.id = pe.product_raw_id
     JOIN merchants m ON m.id = pe.merchant_id
     ${whereClause}
     ORDER BY ${orderBy}
     LIMIT ${limit} OFFSET 0`,
    ...params
  )

  const total = rawResults.length > 0 ? parseInt(rawResults[0]?.total_count ?? '0') : 0

  // Format results
  const results = rawResults.map(row => {
    const firstVariant = Array.isArray(row.raw_variants) ? row.raw_variants[0] : null
    const priceAmount = firstVariant ? parseFloat(firstVariant.price) : (row.price_min ? parseFloat(row.price_min) : 0)
    const images = Array.isArray(row.raw_images) ? row.raw_images.map(img => img.src) : []

    return {
      id: row.id,
      title: row.raw_title,
      merchant: {
        name: row.shopify_domain.replace('.myshopify.com', '').replace(/-/g, ' '),
        domain: row.shopify_domain,
        trust_score: Math.min(100, row.geo_score + 10),
      },
      price: {
        amount: priceAmount,
        currency: row.currency ?? 'EUR',
      },
      specs: row.specs ?? {},
      certifications: row.certifications ?? [],
      availability: {
        in_stock: Array.isArray(row.raw_variants) && row.raw_variants.some(v => v.inventory_quantity > 0),
        shipping_estimate: row.shipping_info?.estimate,
        free_shipping: row.shipping_info?.free ?? false,
        return_days: row.return_policy?.days,
      },
      images,
      geo_score: row.geo_score,
      checkout_url: `${process.env.SHOPIFY_APP_URL ?? 'https://api.commerceagent.io'}/v1/checkout/initiate`,
      use_cases: row.use_cases ?? [],
      target_audience: row.target_audience ?? [],
      comparison: {
        similar_to: row.comparison_tags ?? [],
        differentiators: row.certifications ?? [],
      },
    }
  })

  const response: SearchResponse = {
    results,
    total,
    search_id: searchId,
    latency_ms: Date.now() - startTime,
  }

  // Cache for 2 minutes
  await cacheSet(cacheKey, response, 120)

  return c.json(response)
})

export { searchRouter }

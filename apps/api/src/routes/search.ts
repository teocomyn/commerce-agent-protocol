import { Hono } from 'hono'
import { prisma } from '@cap/db'
import { SearchRequestSchema, type SearchResponse } from '@cap/shared'
import { cacheGet, cacheSet } from '../lib/redis.js'
import OpenAI from 'openai'
import { capJsonValidator } from '../lib/validation.js'
import { isVariantPurchasable } from '../lib/inventory.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 10_000,
  maxRetries: 2,
})
const searchRouter = new Hono()

function detectAgentType(userAgent: string): string {
  const ua = userAgent.toLowerCase()
  if (ua.includes('claude') || ua.includes('anthropic')) return 'claude'
  if (ua.includes('chatgpt') || ua.includes('gptbot') || ua.includes('openai')) return 'chatgpt'
  if (ua.includes('perplexity')) return 'perplexity'
  if (ua.includes('gemini') || ua.includes('google-extended')) return 'gemini'
  return 'custom'
}

interface PersistAgentQueryArgs {
  merchantId: string
  agentId: string
  agentType: string
  query: string
  filters: unknown
  results: number
  latencyMs: number
}

async function persistAgentQuery(args: PersistAgentQueryArgs): Promise<string | null> {
  try {
    const row = await prisma.agentQuery.create({
      data: {
        merchantId: args.merchantId,
        agentId: args.agentId,
        agentType: args.agentType,
        queryText: args.query,
        filters: args.filters as object,
        resultsCount: args.results,
        latencyMs: args.latencyMs,
      },
      select: { id: true },
    })
    return row.id
  } catch (err) {
    console.warn('[Search] Failed to persist agent query:', err instanceof Error ? err.message : err)
    return null
  }
}

// POST /v1/search
searchRouter.post('/', capJsonValidator(SearchRequestSchema), async (c) => {
  const startTime = Date.now()
  const auth = c.get('auth')
  const body = c.req.valid('json')
  const { query, filters, limit, sort } = body

  // Detect agent type from User-Agent for analytics
  const userAgent = c.req.header('User-Agent') ?? ''
  const agentType = detectAgentType(userAgent)
  const agentId = c.req.header('X-Agent-ID') ?? auth.apiKeyId

  const searchId = `srch_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`

  // Cache is scoped per-merchant to honor the multi-tenant filter
  const cacheKey = `search:${auth.merchantId}:${JSON.stringify({ query, filters, limit, sort })}`
  const cached = await cacheGet<SearchResponse>(cacheKey)
  if (cached) {
    const latency = Date.now() - startTime
    const agentQueryId = await persistAgentQuery({
      merchantId: auth.merchantId,
      agentId,
      agentType,
      query,
      filters,
      results: cached.results.length,
      latencyMs: latency,
    })

    const { agent_query_id: _cachedAgentQueryId, ...cachedWithoutSession } = cached

    return c.json({
      ...cachedWithoutSession,
      search_id: searchId,
      ...(agentQueryId && { agent_query_id: agentQueryId }),
      latency_ms: latency,
    })
  }

  // Relevance uses embeddings when available, with a lexical fallback so an
  // OpenAI outage does not take product discovery offline.
  let embeddingStr: string | null = null
  if (sort === 'relevance') {
    try {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
        dimensions: 1536,
      })
      const queryEmbedding = embeddingResponse.data[0]?.embedding ?? []
      if (queryEmbedding.length === 1536) embeddingStr = `[${queryEmbedding.join(',')}]`
    } catch (error) {
      console.warn('[Search] Embedding unavailable, using lexical fallback:', error instanceof Error ? error.message : error)
    }
  }

  // Build SQL filters with bound parameters (no string concat for user input)
  // Only active, non-deleted Shopify products are visible to agents.
  const conditions: string[] = ['pe.deleted_at IS NULL', 'pr.deleted_at IS NULL', "pr.status = 'active'"]
  const params: (string | number | boolean | string[])[] = []
  let paramIdx = 1

  // Multi-tenant guard: only return products belonging to the calling merchant
  conditions.push(`pe.merchant_id = $${paramIdx}::uuid`)
  params.push(auth.merchantId)
  paramIdx++

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
  if (filters?.currency) {
    conditions.push(`pe.currency = $${paramIdx}`)
    params.push(filters.currency)
    paramIdx++
  }
  if (filters?.shipping_country) {
    conditions.push(`(
      pe.shipping_info IS NULL OR
      pe.shipping_info->'countries' IS NULL OR
      pe.shipping_info->'countries' ? $${paramIdx}
    )`)
    params.push(filters.shipping_country.toUpperCase())
    paramIdx++
  }

  if (filters?.in_stock === true) {
    conditions.push(`
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(pr.variants::jsonb) v
        WHERE (
          (v ? 'inventory_management' AND v->>'inventory_management' IS NULL) OR
          UPPER(COALESCE(v->>'inventory_policy', 'DENY')) = 'CONTINUE' OR
          COALESCE((v->>'inventory_quantity')::int, 0) > 0
        )
      )`)
  }
  if (filters?.in_stock === false) {
    conditions.push(`
      NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(pr.variants::jsonb) v
        WHERE (
          (v ? 'inventory_management' AND v->>'inventory_management' IS NULL) OR
          UPPER(COALESCE(v->>'inventory_policy', 'DENY')) = 'CONTINUE' OR
          COALESCE((v->>'inventory_quantity')::int, 0) > 0
        )
      )`)
  }

  // Embedding is bound as a parameter rather than concatenated, so we never
  // build SQL from the cosine vector string directly.
  let embeddingParamIdx: number | null = null
  if (embeddingStr) {
    embeddingParamIdx = paramIdx
    params.push(embeddingStr)
    paramIdx++
  } else if (sort === 'relevance') {
    conditions.push(`(
      pr.title ILIKE $${paramIdx} OR
      COALESCE(pr.description, '') ILIKE $${paramIdx} OR
      COALESCE(pe.category, '') ILIKE $${paramIdx}
    )`)
    params.push(`%${query.trim()}%`)
    paramIdx++
  }

  const orderBy =
    sort === 'price_asc' ? 'pe.price_min ASC'
    : sort === 'price_desc' ? 'pe.price_min DESC'
    : sort === 'geo_score' ? 'pe.geo_score DESC'
    : embeddingParamIdx
      ? `1 - (pe.embedding <=> $${embeddingParamIdx}::vector) DESC`
      : 'pe.geo_score DESC, pe.enriched_at DESC'

  const limitParamIdx = paramIdx
  params.push(limit)
  paramIdx++

  const whereClause = `WHERE ${conditions.join(' AND ')}`

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
    shipping_info: { free?: boolean; estimate?: string; url?: string; countries?: string[] } | null
    return_policy: { days?: number; url?: string } | null
    merchant_id: string
    shopify_domain: string
    merchant_plan: string
    raw_title: string
    raw_images: Array<{ src: string; alt?: string }> | null
    raw_variants: Array<{
      id: number
      price: string
      inventory_quantity: number
      inventory_management?: string | null
      inventory_policy?: string | null
      title: string
    }> | null
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
       ${embeddingParamIdx ? `1 - (pe.embedding <=> $${embeddingParamIdx}::vector)` : '0::double precision'} AS similarity,
       COUNT(*) OVER() as total_count
     FROM products_enriched pe
     JOIN products_raw pr ON pr.id = pe.product_raw_id
     JOIN merchants m ON m.id = pe.merchant_id
     ${whereClause}
     ORDER BY ${orderBy}
     LIMIT $${limitParamIdx} OFFSET 0`,
    ...params
  )

  const total = rawResults.length > 0 ? parseInt(rawResults[0]?.total_count ?? '0') : 0
  const checkoutBase = process.env.SHOPIFY_APP_URL ?? 'https://api.cap-protocol.org'

  // Format results
  const results = rawResults.map(row => {
    const rawVariants = Array.isArray(row.raw_variants) ? row.raw_variants : []
    const displayVariant = rawVariants.find((variant) => isVariantPurchasable(variant)) ?? rawVariants[0]
    const parsedPrice = displayVariant
      ? Number.parseFloat(displayVariant.price)
      : row.price_min ? Number.parseFloat(row.price_min) : 0
    const priceAmount = Number.isFinite(parsedPrice) ? parsedPrice : 0
    const images = Array.isArray(row.raw_images) ? row.raw_images.map(img => img.src) : []

    return {
      id: row.id,
      title: row.raw_title,
      merchant: {
        name: row.shopify_domain.replace('.myshopify.com', '').replace(/-/g, ' '),
        domain: row.shopify_domain,
      },
      price: {
        amount: priceAmount,
        currency: row.currency ?? 'EUR',
      },
      variants: rawVariants.map((variant) => {
        const amount = Number.parseFloat(variant.price)
        return {
          id: String(variant.id),
          title: variant.title,
          price: {
            amount: Number.isFinite(amount) ? amount : 0,
            currency: row.currency ?? 'EUR',
          },
          available_quantity: variant.inventory_quantity ?? 0,
          in_stock: isVariantPurchasable(variant),
        }
      }),
      specs: row.specs ?? {},
      certifications: row.certifications ?? [],
      availability: {
        in_stock: Array.isArray(row.raw_variants) && row.raw_variants.some((variant) => isVariantPurchasable(variant)),
        shipping_estimate: row.shipping_info?.estimate,
        free_shipping: row.shipping_info?.free ?? false,
        return_days: row.return_policy?.days,
        shipping_policy_url: row.shipping_info?.url,
        return_policy_url: row.return_policy?.url,
        shipping_countries: row.shipping_info?.countries,
      },
      images,
      geo_score: row.geo_score,
      checkout_url: `${checkoutBase}/v1/checkout/initiate`,
      use_cases: row.use_cases ?? [],
      target_audience: row.target_audience ?? [],
      comparison: {
        similar_to: row.comparison_tags ?? [],
        differentiators: row.certifications ?? [],
      },
    }
  })

  const latency = Date.now() - startTime
  const agentQueryId = await persistAgentQuery({
    merchantId: auth.merchantId,
    agentId,
    agentType,
    query,
    filters,
    results: results.length,
    latencyMs: latency,
  })

  const response: SearchResponse = {
    results,
    total,
    search_id: searchId,
    ...(agentQueryId && { agent_query_id: agentQueryId }),
    latency_ms: latency,
  }

  await cacheSet(cacheKey, response, 120)
  return c.json(response)
})

export { searchRouter }

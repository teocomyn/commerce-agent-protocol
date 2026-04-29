import OpenAI from 'openai'
import { Worker } from 'bullmq'
import { prisma } from '@cap/db'
import {
  computeGeoScore,
  stripHtml,
  truncateForEmbedding,
  type EnrichmentOutput,
  EnrichmentOutputSchema,
} from '@cap/shared'
import { bullmqConnection, type EnrichmentJobData } from '../lib/queue.js'
import { fetchShopifyProduct, decryptToken } from '../lib/shopify.js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ============================================================
// LLM ENRICHMENT
// ============================================================

async function enrichProduct(
  title: string,
  description: string,
  vendor: string,
  productType: string,
  tags: string[],
  images: Array<{ src: string; alt: string | null }>
): Promise<EnrichmentOutput> {
  const imageDescriptions = images
    .slice(0, 3)
    .map((img, i) => `Image ${i + 1}: ${img.alt ?? img.src}`)
    .join('\n')

  const prompt = `You are an AI assistant specialized in e-commerce product data enrichment for AI shopping agents.

Analyze this product and return a structured JSON response following the schema exactly.

Product Information:
- Title: ${title}
- Brand/Vendor: ${vendor}
- Product Type: ${productType}
- Tags: ${tags.join(', ')}
- Description: ${description.slice(0, 1500)}
${images.length > 0 ? `- Images: ${imageDescriptions}` : ''}

IMPORTANT:
- For specs, use quantitative values when possible (e.g., "weight_g": 310 not "light")
- For comparison_tags, list 2-4 well-known comparable products (brand + model name)
- For category, use format "MainCategory > SubCategory" (e.g., "Footwear > Sneakers")
- Be specific and factual. Only include certifications you're confident about from the data.
- summary should be ONE sentence, under 100 words, optimized for AI agent understanding`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'product_enrichment',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            subcategory: { type: 'string' },
            specs: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] } },
            use_cases: { type: 'array', items: { type: 'string' } },
            target_audience: { type: 'array', items: { type: 'string' } },
            certifications: { type: 'array', items: { type: 'string' } },
            care_info: { type: 'string' },
            size_guide: { type: 'object', additionalProperties: true },
            comparison_tags: { type: 'array', items: { type: 'string' } },
            summary: { type: 'string' },
          },
          required: ['category', 'subcategory', 'specs', 'use_cases', 'target_audience', 'certifications', 'comparison_tags', 'summary'],
          additionalProperties: false,
        },
      },
    },
    temperature: 0.1,
    max_tokens: 1000,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Empty LLM response')

  const parsed = EnrichmentOutputSchema.parse(JSON.parse(content))
  return parsed
}

// ============================================================
// EMBEDDING GENERATION
// ============================================================

async function generateEmbedding(text: string): Promise<number[]> {
  const truncated = truncateForEmbedding(text, 6000)
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: truncated,
    dimensions: 1536,
  })
  return response.data[0]?.embedding ?? []
}

// ============================================================
// PIPELINE STEPS
// ============================================================

async function step1_normalize(product: {
  title: string
  body_html: string | null
  vendor: string
  product_type: string
  tags: string
  variants: Array<{ price: string; inventory_quantity: number; weight: number; weight_unit: string }>
  images: Array<{ src: string; alt: string | null }>
}) {
  const description = stripHtml(product.body_html ?? '')
  const tags = product.tags.split(',').map(t => t.trim()).filter(Boolean)

  const prices = product.variants.map(v => parseFloat(v.price)).filter(p => !isNaN(p))
  const priceMin = Math.min(...prices)
  const priceMax = Math.max(...prices)
  const totalStock = product.variants.reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0)

  return {
    description,
    tags,
    priceMin: isFinite(priceMin) ? priceMin : null,
    priceMax: isFinite(priceMax) ? priceMax : null,
    totalStock,
    images: product.images,
  }
}

async function step4_geoScore(enriched: EnrichmentOutput, opts: {
  numberOfImages: number
  totalStock: number
  daysSinceUpdate?: number
}) {
  const specs = enriched.specs
  const numberOfSpecs = Object.keys(specs).length
  const hasQuantitativeSpecs = Object.values(specs).some(v => typeof v === 'number')

  return computeGeoScore({
    hasSpecs: numberOfSpecs > 0,
    hasUseCases: enriched.use_cases.length > 0,
    hasCertifications: enriched.certifications.length > 0,
    hasSizeGuide: enriched.size_guide != null && Object.keys(enriched.size_guide).length > 0,
    hasShippingInfo: false, // Will be updated when shipping data available
    numberOfSpecs,
    hasQuantitativeSpecs,
    hasComparisons: enriched.comparison_tags.length > 0,
    hasReviews: false,
    averageRating: 0,
    numberOfReviews: 0,
    numberOfImages: opts.numberOfImages,
    daysSinceUpdate: opts.daysSinceUpdate ?? 0,
  })
}

// ============================================================
// WORKER
// ============================================================

export const enrichmentWorker = new Worker<EnrichmentJobData>(
  'enrichment',
  async (job) => {
    const { shopDomain, shopifyProductId, merchantId } = job.data

    console.log(`[Worker] Processing product ${shopifyProductId} for ${shopDomain}`)

    // Get merchant token
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } })
    const token = decryptToken(merchant.shopifyToken)

    // Fetch latest product from Shopify
    const shopifyProduct = await fetchShopifyProduct(shopDomain, token, shopifyProductId)

    await job.updateProgress(10)

    // Step 1: Normalize
    const normalized = await step1_normalize(shopifyProduct)
    await job.updateProgress(20)

    // Upsert raw product
    const rawProduct = await prisma.productRaw.upsert({
      where: {
        merchantId_shopifyId: {
          merchantId,
          shopifyId: BigInt(shopifyProductId),
        },
      },
      create: {
        merchantId,
        shopifyId: BigInt(shopifyProductId),
        title: shopifyProduct.title,
        description: normalized.description,
        vendor: shopifyProduct.vendor,
        productType: shopifyProduct.product_type,
        tags: normalized.tags,
        variants: shopifyProduct.variants as object[],
        images: shopifyProduct.images as object[],
        status: shopifyProduct.status,
      },
      update: {
        title: shopifyProduct.title,
        description: normalized.description,
        vendor: shopifyProduct.vendor,
        productType: shopifyProduct.product_type,
        tags: normalized.tags,
        variants: shopifyProduct.variants as object[],
        images: shopifyProduct.images as object[],
        status: shopifyProduct.status,
        syncedAt: new Date(),
      },
    })

    await job.updateProgress(30)

    // Step 2: LLM Enrichment
    const enrichedData = await enrichProduct(
      shopifyProduct.title,
      normalized.description,
      shopifyProduct.vendor,
      shopifyProduct.product_type,
      normalized.tags,
      normalized.images,
    )
    await job.updateProgress(60)

    // Step 3: Generate embedding
    const embeddingText = truncateForEmbedding(
      `${shopifyProduct.title}. ${enrichedData.summary}. ${enrichedData.use_cases.join(', ')}. ${Object.entries(enrichedData.specs).map(([k, v]) => `${k}: ${v}`).join(', ')}`
    )
    const embedding = await generateEmbedding(embeddingText)
    await job.updateProgress(80)

    // Step 4: GEO Score
    const updatedAt = new Date(shopifyProduct.updated_at)
    const daysSinceUpdate = Math.floor((Date.now() - updatedAt.getTime()) / 86_400_000)
    const geoScore = await step4_geoScore(enrichedData, {
      numberOfImages: normalized.images.length,
      totalStock: normalized.totalStock,
      daysSinceUpdate,
    })

    // Upsert enriched product
    const [categoryPart, subcategoryPart] = (enrichedData.category ?? '').split(' > ')

    await prisma.$executeRaw`
      INSERT INTO products_enriched (
        id, product_raw_id, merchant_id,
        category, subcategory, specs, use_cases, target_audience,
        certifications, care_info, size_guide, comparison_tags,
        price_min, price_max, currency,
        geo_score, completeness, embedding,
        enriched_at, version
      ) VALUES (
        gen_random_uuid(), ${rawProduct.id}::uuid, ${merchantId}::uuid,
        ${categoryPart ?? null}, ${subcategoryPart ?? null},
        ${JSON.stringify(enrichedData.specs)}::jsonb,
        ${enrichedData.use_cases}::text[],
        ${enrichedData.target_audience}::text[],
        ${enrichedData.certifications}::text[],
        ${enrichedData.care_info ?? null},
        ${enrichedData.size_guide ? JSON.stringify(enrichedData.size_guide) : null}::jsonb,
        ${enrichedData.comparison_tags}::text[],
        ${normalized.priceMin}, ${normalized.priceMax}, 'EUR',
        ${geoScore}, ${Math.min(100, Object.keys(enrichedData.specs).length * 10)},
        ${JSON.stringify(embedding)}::vector,
        NOW(), 1
      )
      ON CONFLICT (product_raw_id)
      DO UPDATE SET
        category = EXCLUDED.category,
        subcategory = EXCLUDED.subcategory,
        specs = EXCLUDED.specs,
        use_cases = EXCLUDED.use_cases,
        target_audience = EXCLUDED.target_audience,
        certifications = EXCLUDED.certifications,
        care_info = EXCLUDED.care_info,
        size_guide = EXCLUDED.size_guide,
        comparison_tags = EXCLUDED.comparison_tags,
        price_min = EXCLUDED.price_min,
        price_max = EXCLUDED.price_max,
        geo_score = EXCLUDED.geo_score,
        completeness = EXCLUDED.completeness,
        embedding = EXCLUDED.embedding,
        enriched_at = NOW(),
        version = products_enriched.version + 1
    `

    await job.updateProgress(100)
    console.log(`[Worker] ✓ Product ${shopifyProductId} enriched. GEO score: ${geoScore}`)

    return { productId: rawProduct.id, geoScore }
  },
  {
    connection: bullmqConnection,
    concurrency: 3, // Process up to 3 products simultaneously
  }
)

enrichmentWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err)
})

enrichmentWorker.on('completed', (job, result) => {
  console.log(`[Worker] Job ${job.id} completed. GEO score: ${(result as { geoScore: number }).geoScore}`)
})

console.log('[Worker] Enrichment worker started')

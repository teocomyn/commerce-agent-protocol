import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { prisma } from '@cap/db'
import { CompareRequestSchema, type CompareResponse, type CAPError } from '@cap/shared'

const compareRouter = new Hono()

// POST /v1/compare
compareRouter.post('/', zValidator('json', CompareRequestSchema), async (c) => {
  const { product_ids, criteria } = c.req.valid('json')

  // Fetch all products
  interface EnrichedProductRow {
    id: string
    price_min: string | null
    price_max: string | null
    currency: string
    certifications: string[]
    comparison_tags: string[]
    specs: Record<string, string | number | boolean>
    geo_score: number
    return_policy: { days?: number } | null
    shipping_info: { estimate?: string; free?: boolean; days?: number } | null
    raw_title: string
  }

  const products = await prisma.$queryRawUnsafe<EnrichedProductRow[]>(
    `SELECT
       pe.id, pe.price_min, pe.price_max, pe.currency,
       pe.certifications, pe.comparison_tags, pe.specs,
       pe.geo_score, pe.return_policy, pe.shipping_info,
       pr.title as raw_title
     FROM products_enriched pe
     JOIN products_raw pr ON pr.id = pe.product_raw_id
     WHERE pe.id = ANY($1::uuid[]) AND pe.deleted_at IS NULL`,
    product_ids
  )

  if (products.length < 2) {
    return c.json<CAPError>({
      error: { code: 'NOT_FOUND', message: 'At least 2 valid product IDs are required' },
    }, 404)
  }

  // Build comparison matrix
  const matrix: Record<string, Record<string, unknown>> = {}

  if (criteria.includes('price')) {
    matrix['price'] = {}
    for (const p of products) {
      matrix['price']![p.id] = p.price_min ? parseFloat(p.price_min) : null
    }
  }

  if (criteria.includes('certifications')) {
    matrix['certifications'] = {}
    for (const p of products) {
      matrix['certifications']![p.id] = p.certifications ?? []
    }
  }

  if (criteria.includes('shipping')) {
    matrix['shipping_estimate'] = {}
    matrix['free_shipping'] = {}
    for (const p of products) {
      matrix['shipping_estimate']![p.id] = p.shipping_info?.estimate ?? 'unknown'
      matrix['free_shipping']![p.id] = p.shipping_info?.free ?? false
    }
  }

  if (criteria.includes('specs')) {
    // Get all spec keys across products
    const allSpecKeys = new Set<string>()
    for (const p of products) {
      if (p.specs) Object.keys(p.specs).forEach(k => allSpecKeys.add(k))
    }

    for (const key of allSpecKeys) {
      matrix[`spec_${key}`] = {}
      for (const p of products) {
        matrix[`spec_${key}`]![p.id] = p.specs?.[key] ?? null
      }
    }
  }

  if (criteria.includes('return_policy')) {
    matrix['return_days'] = {}
    for (const p of products) {
      matrix['return_days']![p.id] = p.return_policy?.days ?? null
    }
  }

  // Determine winners
  const priceRow = matrix['price']
  const winnerByPrice = priceRow
    ? products.reduce((min, p) => {
        const price = priceRow[p.id] as number | null
        const minPrice = priceRow[min.id] as number | null
        if (price == null) return min
        if (minPrice == null) return p
        return price < minPrice ? p : min
      }).id
    : undefined

  const certRow = matrix['certifications']
  const winnerByEco = certRow
    ? products.reduce((best, p) => {
        const count = (certRow[p.id] as string[])?.length ?? 0
        const bestCount = (certRow[best.id] as string[])?.length ?? 0
        return count > bestCount ? p : best
      }).id
    : undefined

  const response: CompareResponse = {
    comparison: {
      winner_by_price: winnerByPrice,
      winner_by_eco: winnerByEco,
      matrix,
    },
  }

  return c.json(response)
})

export { compareRouter }

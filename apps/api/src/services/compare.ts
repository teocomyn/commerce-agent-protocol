import { prisma } from '@cap/db'
import type { CompareRequest, CompareResponse } from '@cap/shared'
import { type CapOutcome, failure, ok } from './outcome.js'

/**
 * Side-by-side comparison of active products of one merchant, shared by
 * POST /v1/compare and the commerce_compare MCP tool.
 */
export async function compareProducts(
  request: CompareRequest,
  context: { merchantId: string },
): Promise<CapOutcome<CompareResponse>> {
  const { product_ids, criteria } = request

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
    return_policy: { days?: number; url?: string } | null
    shipping_info: {
      estimate?: string
      free?: boolean
      days?: number
      url?: string
      countries?: string[]
    } | null
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
     WHERE pe.id = ANY($1::uuid[])
       AND pe.merchant_id = $2::uuid
       AND pe.deleted_at IS NULL
       AND pr.deleted_at IS NULL
       AND pr.status = 'active'`,
    product_ids,
    context.merchantId,
  )

  if (products.length < 2) {
    return failure(404, 'NOT_FOUND', 'At least 2 valid product IDs are required')
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
    matrix['shipping_policy_url'] = {}
    matrix['shipping_countries'] = {}
    for (const p of products) {
      matrix['shipping_estimate']![p.id] = p.shipping_info?.estimate ?? 'unknown'
      matrix['free_shipping']![p.id] = p.shipping_info?.free ?? false
      matrix['shipping_policy_url']![p.id] = p.shipping_info?.url ?? null
      matrix['shipping_countries']![p.id] = p.shipping_info?.countries ?? []
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
    matrix['return_policy_url'] = {}
    for (const p of products) {
      matrix['return_days']![p.id] = p.return_policy?.days ?? null
      matrix['return_policy_url']![p.id] = p.return_policy?.url ?? null
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

  // Counts merchant-declared certifications only; not an environmental rating.
  const certRow = matrix['certifications']
  const winnerByCertifications = certRow
    ? products.reduce((best, p) => {
        const count = (certRow[p.id] as string[])?.length ?? 0
        const bestCount = (certRow[best.id] as string[])?.length ?? 0
        return count > bestCount ? p : best
      }).id
    : undefined

  const response: CompareResponse = {
    comparison: {
      winner_by_price: winnerByPrice,
      winner_by_certifications: winnerByCertifications,
      products: products.map((p) => ({ id: p.id, title: p.raw_title })),
      matrix,
    },
  }

  return ok(response)
}

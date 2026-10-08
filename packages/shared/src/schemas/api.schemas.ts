import { z } from 'zod'

// ============================================================
// SEARCH API
// ============================================================
// Field descriptions are published in the MCP tool schemas: agents read them.
export const SearchFiltersSchema = z.object({
  price_min: z.number().min(0).optional().describe('Minimum price, in the product currency'),
  price_max: z.number().min(0).optional().describe('Maximum price, in the product currency'),
  currency: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).optional()
    .describe('ISO 4217 currency code the prices must be in, e.g. "EUR"'),
  certifications: z.array(z.string()).optional()
    .describe('Certifications the merchant declared for the product; all must match'),
  in_stock: z.boolean().optional().describe('true: only purchasable products; false: only unavailable ones'),
  shipping_country: z.string().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()).optional()
    .describe('ISO 3166-1 alpha-2 country the merchant must ship to, e.g. "FR"'),
  category: z.string().optional().describe('Text the product category must contain, e.g. "Sneakers"'),
})

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500).describe('Natural-language description of what the shopper wants'),
  filters: SearchFiltersSchema.optional().default({}),
  limit: z.number().int().min(1).max(50).optional().default(5).describe('Number of results, 1-50'),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'geo_score']).optional().default('relevance'),
})

export type SearchRequest = z.infer<typeof SearchRequestSchema>
export type SearchFilters = z.infer<typeof SearchFiltersSchema>

// ============================================================
// COMPARE API
// ============================================================
export const CompareRequestSchema = z.object({
  product_ids: z.array(z.string().uuid()).min(2).max(10).describe('2-10 product ids returned by a search'),
  criteria: z.array(z.enum(['price', 'certifications', 'shipping', 'specs', 'return_policy'])).optional().default(['price', 'certifications', 'shipping', 'specs']),
})

export type CompareRequest = z.infer<typeof CompareRequestSchema>

// ============================================================
// CHECKOUT API
// ============================================================
export const CheckoutInitiateSchema = z.object({
  product_id: z.string().uuid().describe('Product id returned by a search'),
  variant_id: z.string().optional().describe('Variant id (size, color…) from the search result; default: first purchasable variant'),
  quantity: z.number().int().min(1).max(99).default(1),
  shipping_country: z.string().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()).optional().default('FR')
    .describe('ISO 3166-1 alpha-2 country to ship to'),
  /** UUID returned as `agent_query_id` from POST /v1/search — links checkout analytics to the search */
  agent_session_id: z.string().uuid().optional()
    .describe('agent_query_id returned by the search that led to this checkout'),
})

export type CheckoutInitiateRequest = z.infer<typeof CheckoutInitiateSchema>

// ============================================================
// RESPONSE TYPES
// ============================================================
export interface ProductResult {
  id: string
  title: string
  merchant: {
    name: string
    domain: string
  }
  price: {
    amount: number
    currency: string
    was?: number
  }
  variants: Array<{
    id: string
    title: string
    price: { amount: number; currency: string }
    available_quantity: number
    in_stock: boolean
  }>
  specs: Record<string, string | number | boolean>
  certifications: string[]
  availability: {
    in_stock: boolean
    sizes?: string[] | undefined
    shipping_estimate?: string | undefined
    free_shipping?: boolean | undefined
    return_days?: number | undefined
    shipping_policy_url?: string | undefined
    return_policy_url?: string | undefined
    shipping_countries?: string[] | undefined
  }
  images: string[]
  geo_score: number
  checkout_url: string
  use_cases: string[]
  target_audience: string[]
  comparison: {
    similar_to: string[]
    differentiators: string[]
  }
}

export interface SearchResponse {
  results: ProductResult[]
  total: number
  search_id: string
  /** DB row id — pass as `agent_session_id` on POST /v1/checkout/initiate when applicable */
  agent_query_id?: string | undefined
  latency_ms: number
}

export interface CompareResponse {
  comparison: {
    winner_by_price?: string | undefined
    /** Product with the most merchant-declared certifications */
    winner_by_certifications?: string | undefined
    /** The compared products, so the matrix columns can be labelled */
    products: Array<{ id: string; title: string }>
    matrix: Record<string, Record<string, unknown>>
  }
}

// ============================================================
// LLM ENRICHMENT OUTPUT (normalized)
// ============================================================
// Certifications and comparable products are factual claims: they come from
// the merchant's `cap.*` metafields, never from the model.
export const EnrichmentOutputSchema = z.object({
  category: z.string().describe('Product category in format "MainCategory > SubCategory"'),
  subcategory: z.string().describe('Specific subcategory'),
  specs: z.record(z.union([z.string(), z.number(), z.boolean()])).describe('Structured product specifications'),
  use_cases: z.array(z.string()).describe('List of use cases for this product'),
  target_audience: z.array(z.string()).describe('Target audience descriptors (gender, age, lifestyle)'),
  care_info: z.string().optional().describe('Care instructions'),
  size_guide: z.record(z.string()).optional().describe('Size guide if applicable'),
  summary: z.string().describe('One sentence agent-optimized product summary'),
})

export type EnrichmentOutput = z.infer<typeof EnrichmentOutputSchema>

// ============================================================
// GEO SCORE FACTORS
// ============================================================
export interface GeoScoreFactors {
  completeness: {
    hasSpecs: boolean
    hasUseCases: boolean
    hasCertifications: boolean
    hasSizeGuide: boolean
    hasShippingInfo: boolean
    score: number // 0-30
  }
  specsDepth: {
    numberOfSpecs: number
    hasQuantitativeSpecs: boolean
    hasComparisons: boolean
    score: number // 0-25
  }
  qualitySignal: {
    hasReviews: boolean
    averageRating: number
    numberOfReviews: number
    score: number // 0-15
  }
  imageQuality: {
    numberOfImages: number
    hasAltText: boolean
    score: number // 0-15
  }
  freshness: {
    daysSinceUpdate: number
    priceChangedRecently: boolean
    score: number // 0-15
  }
  total: number // 0-100
}

// ============================================================
// API KEY
// ============================================================
export interface ApiKeyResponse {
  id: string
  key: string // Only shown once on creation
  prefix: string
  label?: string
  created_at: string
}

// ============================================================
// ERROR RESPONSE
// ============================================================
export interface CAPError {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

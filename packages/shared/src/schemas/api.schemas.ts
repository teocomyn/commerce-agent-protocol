import { z } from 'zod'

// ============================================================
// SEARCH API
// ============================================================
export const SearchFiltersSchema = z.object({
  price_min: z.number().min(0).optional(),
  price_max: z.number().min(0).optional(),
  currency: z.enum(['EUR', 'USD', 'GBP']).optional().default('EUR'),
  certifications: z.array(z.string()).optional(),
  in_stock: z.boolean().optional(),
  shipping_country: z.string().length(2).optional(), // ISO 3166-1 alpha-2
  category: z.string().optional(),
  merchant_ids: z.array(z.string().uuid()).optional(),
})

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  filters: SearchFiltersSchema.optional().default({}),
  limit: z.number().int().min(1).max(50).optional().default(5),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'geo_score']).optional().default('relevance'),
})

export type SearchRequest = z.infer<typeof SearchRequestSchema>
export type SearchFilters = z.infer<typeof SearchFiltersSchema>

// ============================================================
// COMPARE API
// ============================================================
export const CompareRequestSchema = z.object({
  product_ids: z.array(z.string()).min(2).max(10),
  criteria: z.array(z.enum(['price', 'certifications', 'shipping', 'specs', 'reviews', 'return_policy'])).optional().default(['price', 'certifications', 'shipping', 'specs']),
})

export type CompareRequest = z.infer<typeof CompareRequestSchema>

// ============================================================
// CHECKOUT API
// ============================================================
export const CheckoutInitiateSchema = z.object({
  product_id: z.string(),
  variant_id: z.string().optional(),
  quantity: z.number().int().min(1).max(99).default(1),
  shipping_country: z.string().length(2).optional().default('FR'),
  agent_session_id: z.string().optional(),
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
    trust_score: number
  }
  price: {
    amount: number
    currency: string
    was?: number
  }
  specs: Record<string, string | number | boolean>
  certifications: string[]
  availability: {
    in_stock: boolean
    sizes?: string[]
    shipping_estimate?: string
    free_shipping?: boolean
    return_days?: number
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
  latency_ms: number
}

export interface CompareResponse {
  comparison: {
    winner_by_price?: string
    winner_by_eco?: string
    matrix: Record<string, Record<string, unknown>>
  }
}

// ============================================================
// LLM ENRICHMENT OUTPUT (Structured Output schema)
// ============================================================
export const EnrichmentOutputSchema = z.object({
  category: z.string().describe('Product category in format "MainCategory > SubCategory"'),
  subcategory: z.string().describe('Specific subcategory'),
  specs: z.record(z.union([z.string(), z.number(), z.boolean()])).describe('Structured product specifications'),
  use_cases: z.array(z.string()).describe('List of use cases for this product'),
  target_audience: z.array(z.string()).describe('Target audience descriptors (gender, age, lifestyle)'),
  certifications: z.array(z.string()).describe('Product certifications (OEKO-TEX, GOTS, B-Corp, etc.)'),
  care_info: z.string().optional().describe('Care instructions'),
  size_guide: z.record(z.unknown()).optional().describe('Size guide if applicable'),
  comparison_tags: z.array(z.string()).describe('Well-known comparable products (brand + model)'),
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

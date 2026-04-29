export * from './schemas/api.schemas'

// Utility: compute GEO score from factors
export function computeGeoScore(factors: {
  hasSpecs: boolean
  hasUseCases: boolean
  hasCertifications: boolean
  hasSizeGuide: boolean
  hasShippingInfo: boolean
  numberOfSpecs: number
  hasQuantitativeSpecs: boolean
  hasComparisons: boolean
  hasReviews: boolean
  averageRating: number
  numberOfReviews: number
  numberOfImages: number
  daysSinceUpdate: number
}): number {
  // Completeness (30 pts max)
  let completeness = 0
  if (factors.hasSpecs) completeness += 10
  if (factors.hasUseCases) completeness += 5
  if (factors.hasCertifications) completeness += 5
  if (factors.hasSizeGuide) completeness += 5
  if (factors.hasShippingInfo) completeness += 5

  // Specs depth (25 pts max)
  let specsDepth = 0
  const specCountScore = Math.min(factors.numberOfSpecs * 2, 15)
  specsDepth += specCountScore
  if (factors.hasQuantitativeSpecs) specsDepth += 5
  if (factors.hasComparisons) specsDepth += 5

  // Quality signal (15 pts max)
  let qualitySignal = 0
  if (factors.hasReviews) {
    qualitySignal += 5
    const ratingScore = Math.min((factors.averageRating / 5) * 5, 5)
    const reviewCountScore = Math.min(Math.log10(factors.numberOfReviews + 1) * 2, 5)
    qualitySignal += ratingScore + reviewCountScore
  }

  // Image quality (15 pts max)
  const imageScore = Math.min(factors.numberOfImages * 3, 15)

  // Freshness (15 pts max)
  let freshness = 15
  if (factors.daysSinceUpdate > 7) freshness -= 3
  if (factors.daysSinceUpdate > 30) freshness -= 5
  if (factors.daysSinceUpdate > 90) freshness -= 7
  freshness = Math.max(freshness, 0)

  const total = completeness + specsDepth + qualitySignal + imageScore + freshness
  return Math.round(Math.min(total, 100))
}

// Utility: generate a CAP API key
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  // Format: cap_live_<32 random hex chars>
  const randomBytes = crypto.getRandomValues(new Uint8Array(20))
  const randomHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')
  const key = `cap_live_${randomHex}`
  const prefix = key.slice(0, 16)
  // Note: actual SHA-256 hashing done server-side with Node crypto
  return { key, prefix, hash: '' }
}

// Utility: strip HTML tags from product descriptions
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Utility: truncate text for embedding
export function truncateForEmbedding(text: string, maxTokensApprox = 6000): string {
  // Rough approximation: 1 token ≈ 4 chars
  const maxChars = maxTokensApprox * 4
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '...'
}

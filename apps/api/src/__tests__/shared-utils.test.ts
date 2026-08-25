import { describe, expect, it } from 'vitest'
import {
  CheckoutInitiateSchema,
  CompareRequestSchema,
  SearchRequestSchema,
  computeGeoScore,
  stripHtml,
  truncateForEmbedding,
} from '@cap/shared'

describe('shared CAP schemas and utilities', () => {
  it('applies search defaults and validates query shape', () => {
    const parsed = SearchRequestSchema.parse({
      query: 'white sneakers',
    })

    expect(parsed.limit).toBe(5)
    expect(parsed.sort).toBe('relevance')
    expect(parsed.filters.currency).toBeUndefined()
  })

  it('applies checkout defaults', () => {
    const parsed = CheckoutInitiateSchema.parse({
      product_id: '00000000-0000-0000-0000-000000000001',
    })

    expect(parsed.quantity).toBe(1)
    expect(parsed.shipping_country).toBe('FR')
  })

  it('computes a bounded GEO score from product quality signals', () => {
    const score = computeGeoScore({
      hasSpecs: true,
      hasUseCases: true,
      hasCertifications: true,
      hasSizeGuide: false,
      hasShippingInfo: true,
      numberOfSpecs: 6,
      hasQuantitativeSpecs: true,
      hasComparisons: true,
      hasReviews: true,
      averageRating: 4.5,
      numberOfReviews: 120,
      numberOfImages: 4,
      daysSinceUpdate: 3,
    })

    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('normalizes product copy for embeddings', () => {
    expect(stripHtml('<p>Organic&nbsp;cotton &amp; linen</p>')).toBe('Organic cotton & linen')
    expect(truncateForEmbedding('abcd', 1)).toBe('abcd')
    expect(truncateForEmbedding('abcdef', 1)).toBe('abcd...')
  })

  it.each([
    ['', false],
    ['a', true],
    ['x'.repeat(500), true],
    ['x'.repeat(501), false],
  ])('validates search query length %#', (query, valid) => {
    expect(SearchRequestSchema.safeParse({ query }).success).toBe(valid)
  })

  it.each([0, 1, 50, 51])('enforces search limits (%s)', (limit) => {
    expect(SearchRequestSchema.safeParse({ query: 'x', limit }).success)
      .toBe(limit >= 1 && limit <= 50)
  })

  it.each(['relevance', 'price_asc', 'price_desc', 'geo_score'])('accepts sort %s', (sort) => {
    expect(SearchRequestSchema.safeParse({ query: 'x', sort }).success).toBe(true)
  })

  it('normalizes ISO currency codes beyond the initial EUR/USD/GBP set', () => {
    expect(SearchRequestSchema.parse({ query: 'x', filters: { currency: 'cad' } }).filters.currency).toBe('CAD')
    expect(SearchRequestSchema.safeParse({ query: 'x', filters: { currency: 'EURO' } }).success).toBe(false)
  })

  it('normalizes checkout defaults without mutating the input', () => {
    const input = { product_id: '00000000-0000-0000-0000-000000000001' }
    const parsed = CheckoutInitiateSchema.parse(input)
    expect(parsed).toMatchObject({ quantity: 1, shipping_country: 'FR' })
    expect(input).not.toHaveProperty('quantity')
  })

  it.each([0, 1, 99, 100])('enforces checkout quantities (%s)', (quantity) => {
    expect(CheckoutInitiateSchema.safeParse({
      product_id: '00000000-0000-0000-0000-000000000001',
      quantity,
    }).success).toBe(quantity >= 1 && quantity <= 99)
  })

  it('requires two products for comparison', () => {
    expect(CompareRequestSchema.safeParse({
      product_ids: ['00000000-0000-0000-0000-000000000001'],
    }).success).toBe(false)
  })

  it('caps comparison at ten products', () => {
    const product_ids = Array.from({ length: 11 }, (_, index) =>
      `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`)
    expect(CompareRequestSchema.safeParse({ product_ids }).success).toBe(false)
  })

  it('returns zero-ish GEO score for an empty stale product', () => {
    const score = computeGeoScore({
      hasSpecs: false,
      hasUseCases: false,
      hasCertifications: false,
      hasSizeGuide: false,
      hasShippingInfo: false,
      numberOfSpecs: 0,
      hasQuantitativeSpecs: false,
      hasComparisons: false,
      hasReviews: false,
      averageRating: 0,
      numberOfReviews: 0,
      numberOfImages: 0,
      daysSinceUpdate: 365,
    })
    expect(score).toBe(0)
  })

  it('decodes common HTML entities and whitespace', () => {
    expect(stripHtml(' <b>A</b> &lt; B &gt; C&nbsp;&nbsp; ')).toBe('A < B > C')
  })
})

import { describe, expect, it } from 'vitest'
import { extractCommercePolicies, supportsShippingCountry } from '../lib/commerce-policies.js'
import { extractCheckoutTrackingToken } from '../lib/webhook-utils.js'

describe('commerce metadata normalization', () => {
  it('parses structured shipping and return policies', () => {
    expect(extractCommercePolicies([
      { key: 'shipping_info', value: '{"days":3,"countries":["FR"]}' },
      { key: 'return_policy', value: '{"days":30}' },
    ])).toEqual({
      shippingInfo: { days: 3, countries: ['FR'] },
      returnPolicy: { days: 30 },
    })
  })

  it('builds policies from individual metafields', () => {
    expect(extractCommercePolicies([
      { key: 'shipping_days', value: '4' },
      { key: 'free_shipping', value: 'true' },
      { key: 'shipping_countries', value: 'fr, US' },
      { key: 'return_days', value: '14' },
    ])).toEqual({
      shippingInfo: { days: 4, free: true, countries: ['FR', 'US'] },
      returnPolicy: { days: 14 },
    })
  })

  it('returns null for missing policies', () => {
    expect(extractCommercePolicies([])).toEqual({ shippingInfo: null, returnPolicy: null })
  })

  it('falls back to the official Shopify shipping and refund policies', () => {
    expect(extractCommercePolicies([], [
      { type: 'SHIPPING_POLICY', title: 'Shipping', body: 'Ships in Europe.', url: 'https://store/policies/shipping' },
      { type: 'REFUND_POLICY', title: 'Refunds', body: 'Returns accepted.', url: 'https://store/policies/refund' },
    ])).toEqual({
      shippingInfo: {
        type: 'SHIPPING_POLICY', title: 'Shipping', body: 'Ships in Europe.',
        url: 'https://store/policies/shipping', source: 'shopify_policy',
      },
      returnPolicy: {
        type: 'REFUND_POLICY', title: 'Refunds', body: 'Returns accepted.',
        url: 'https://store/policies/refund', source: 'shopify_policy',
      },
    })
  })

  it('prefers explicit CAP metafields over shop-wide policy documents', () => {
    expect(extractCommercePolicies(
      [{ key: 'return_days', value: '30' }],
      [{ type: 'REFUND_POLICY', title: 'Refunds', body: 'Policy', url: 'https://store/refund' }],
    ).returnPolicy).toEqual({ days: 30 })
  })

  it('uses Shopify shipping destinations as the authoritative country list', () => {
    expect(extractCommercePolicies(
      [{ key: 'shipping_countries', value: 'US' }],
      [],
      ['fr', 'BE', 'FR', 'invalid'],
    ).shippingInfo).toEqual({ countries: ['FR', 'BE'] })
  })

  it('checks shipping destinations without blocking unknown legacy policies', () => {
    expect(supportsShippingCountry({ countries: ['FR', 'BE'] }, 'fr')).toBe(true)
    expect(supportsShippingCountry({ countries: ['FR', 'BE'] }, 'US')).toBe(false)
    expect(supportsShippingCountry(null, 'US')).toBe(true)
  })

  it('ignores invalid JSON policy objects', () => {
    expect(extractCommercePolicies([{ key: 'shipping_info', value: 'invalid' }]).shippingInfo).toBeNull()
  })

  it('extracts checkout token from note attributes', () => {
    expect(extractCheckoutTrackingToken({
      note_attributes: [{ name: 'cap_checkout_id', value: 'track-1' }],
    })).toBe('track-1')
  })

  it('extracts checkout token from line item properties', () => {
    expect(extractCheckoutTrackingToken({
      line_items: [{ properties: [{ name: '_cap_checkout_id', value: 'track-2' }] }],
    })).toBe('track-2')
  })

  it('does not fall back to amount or cart token', () => {
    expect(extractCheckoutTrackingToken({ total_price: '10.00', cart_token: 'legacy' })).toBeNull()
  })
})

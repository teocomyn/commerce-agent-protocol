function safeJsonObject(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

export function extractCommercePolicies(
  metafields: Array<{ key: string; value: string }>,
  shopPolicies: Array<{ type: string; title: string; body: string; url: string }> = [],
  shopShippingCountries: string[] = [],
): { shippingInfo: Record<string, unknown> | null; returnPolicy: Record<string, unknown> | null } {
  const byKey = Object.fromEntries(metafields.map((field) => [field.key, field.value]))
  const shippingInfo = safeJsonObject(byKey['shipping_info']) ?? {
    ...(byKey['shipping_days'] && { days: Number(byKey['shipping_days']) }),
    ...(byKey['free_shipping'] && { free: byKey['free_shipping'] === 'true' }),
    ...(byKey['shipping_countries'] && {
      countries: byKey['shipping_countries'].split(',').map((country) => country.trim().toUpperCase()).filter(Boolean),
    }),
  }
  const returnPolicy = safeJsonObject(byKey['return_policy']) ?? {
    ...(byKey['return_days'] && { days: Number(byKey['return_days']) }),
  }
  const shopShippingPolicy = shopPolicies.find((policy) => policy.type === 'SHIPPING_POLICY')
  const shopReturnPolicy = shopPolicies.find((policy) => policy.type === 'REFUND_POLICY')
  const countries = [...new Set(shopShippingCountries
    .map((country) => country.toUpperCase())
    .filter((country) => /^[A-Z]{2}$/.test(country)))]
  const resolvedShippingInfo = Object.keys(shippingInfo).length > 0
    ? shippingInfo
    : shopShippingPolicy ? { ...shopShippingPolicy, source: 'shopify_policy' } : null
  return {
    shippingInfo: countries.length > 0
      ? { ...(resolvedShippingInfo ?? { source: 'shopify_shipping_zones' }), countries }
      : resolvedShippingInfo,
    returnPolicy: Object.keys(returnPolicy).length > 0
      ? returnPolicy
      : shopReturnPolicy ? { ...shopReturnPolicy, source: 'shopify_policy' } : null,
  }
}

const MAX_MERCHANT_CLAIMS = 20
const MAX_MERCHANT_CLAIM_LENGTH = 100

// Accepts list metafields (JSON arrays) and comma-separated text metafields.
export function parseMetafieldList(value: string | undefined): string[] {
  if (!value) return []
  let items: unknown[] = value.split(',')
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) items = parsed
  } catch {
    // Plain comma-separated text.
  }
  return [...new Set(items
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, MAX_MERCHANT_CLAIM_LENGTH))
    .filter(Boolean))]
    .slice(0, MAX_MERCHANT_CLAIMS)
}

// Certifications and comparable products are claims shown to shoppers, so they
// come only from the merchant's own `cap.*` metafields, never from model output.
export function extractMerchantClaims(metafields: Array<{ key: string; value: string }>): {
  certifications: string[]
  comparisonTags: string[]
} {
  const byKey = Object.fromEntries(metafields.map((field) => [field.key, field.value]))
  return {
    certifications: parseMetafieldList(byKey['certifications']),
    comparisonTags: parseMetafieldList(byKey['comparison_tags']),
  }
}

export function supportsShippingCountry(shippingInfo: unknown, country: string): boolean {
  if (!shippingInfo || typeof shippingInfo !== 'object' || Array.isArray(shippingInfo)) return true
  const countries = (shippingInfo as Record<string, unknown>)['countries']
  if (!Array.isArray(countries) || countries.length === 0) return true
  return countries.some((candidate) =>
    typeof candidate === 'string' && candidate.toUpperCase() === country.toUpperCase(),
  )
}

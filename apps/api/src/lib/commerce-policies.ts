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
  return {
    shippingInfo: Object.keys(shippingInfo).length > 0 ? shippingInfo : null,
    returnPolicy: Object.keys(returnPolicy).length > 0 ? returnPolicy : null,
  }
}

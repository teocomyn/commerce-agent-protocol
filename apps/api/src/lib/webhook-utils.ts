export function extractCheckoutTrackingToken(payload: Record<string, unknown>): string | null {
  const noteAttributes = Array.isArray(payload['note_attributes'])
    ? payload['note_attributes'] as Array<Record<string, unknown>>
    : []
  const noteMatch = noteAttributes.find((attribute) =>
    attribute['name'] === 'cap_checkout_id' || attribute['name'] === '_cap_checkout_id')
  if (typeof noteMatch?.['value'] === 'string') return noteMatch['value']

  const lineItems = Array.isArray(payload['line_items'])
    ? payload['line_items'] as Array<Record<string, unknown>>
    : []
  for (const lineItem of lineItems) {
    const properties = Array.isArray(lineItem['properties'])
      ? lineItem['properties'] as Array<Record<string, unknown>>
      : []
    const property = properties.find((item) =>
      item['name'] === '_cap_checkout_id' || item['name'] === 'cap_checkout_id')
    if (typeof property?.['value'] === 'string') return property['value']
  }
  return null
}

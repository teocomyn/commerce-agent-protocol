export interface InventoryAwareVariant {
  inventory_quantity?: number
  inventory_management?: string | null
  inventory_policy?: string | null
}

export interface InventorySnapshot {
  inventory_item_id: number
  variant_id: number
  inventory_quantity: number
  inventory_management: string | null
  inventory_policy: string
  inventory_levels: Array<{
    location_id: number
    location_name: string
    available: number
  }>
}

export function isVariantPurchasable(
  variant: InventoryAwareVariant,
  quantity = 1,
): boolean {
  if (variant.inventory_management === null) return true
  if (variant.inventory_policy?.toUpperCase() === 'CONTINUE') return true
  return (variant.inventory_quantity ?? 0) >= quantity
}

function finiteQuantity(value: unknown): number {
  const quantity = Number(value)
  return Number.isFinite(quantity) ? quantity : 0
}

function storedLocationId(locationId: string): string | number {
  return /^\d+$/.test(locationId) ? Number(locationId) : locationId
}

export function applyInventoryLevelUpdate(
  variants: unknown,
  inventoryItemId: string,
  locationId: string | null,
  available: number,
): Array<Record<string, unknown>> {
  if (!Array.isArray(variants)) return []

  return variants.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {}
    const variant = candidate as Record<string, unknown>
    if (String(variant['inventory_item_id'] ?? '') !== inventoryItemId) return variant

    // Legacy payloads without a location can only update the aggregate.
    if (!locationId) return { ...variant, inventory_quantity: available }

    const existingLevels = Array.isArray(variant['inventory_levels'])
      ? variant['inventory_levels'].filter(
        (level): level is Record<string, unknown> => Boolean(level) && typeof level === 'object' && !Array.isArray(level),
      )
      : []
    if (existingLevels.length === 0) {
      return {
        ...variant,
        inventory_levels: [{ location_id: storedLocationId(locationId), available }],
        inventory_quantity: 0,
        inventory_stale: true,
      }
    }
    let matched = false
    const inventoryLevels = existingLevels.map((level) => {
      if (String(level['location_id'] ?? '') !== locationId) return level
      matched = true
      return { ...level, available }
    })
    if (!matched) {
      inventoryLevels.push({ location_id: storedLocationId(locationId), available })
    }

    return {
      ...variant,
      inventory_levels: inventoryLevels,
      inventory_quantity: inventoryLevels.reduce(
        (total, level) => total + finiteQuantity(level['available']),
        0,
      ),
    }
  })
}

export function applyInventorySnapshot(
  variants: unknown,
  snapshot: InventorySnapshot,
): Array<Record<string, unknown>> {
  if (!Array.isArray(variants)) return []
  return variants.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {}
    const variant = candidate as Record<string, unknown>
    if (String(variant['inventory_item_id'] ?? '') !== String(snapshot.inventory_item_id)) {
      return variant
    }
    const { inventory_stale: _inventoryStale, ...current } = variant
    return {
      ...current,
      id: snapshot.variant_id,
      inventory_quantity: snapshot.inventory_quantity,
      inventory_management: snapshot.inventory_management,
      inventory_policy: snapshot.inventory_policy,
      inventory_levels: snapshot.inventory_levels,
    }
  })
}

/**
 * The product query only returns the aggregate stock of each variant, so a
 * product re-sync would otherwise wipe the per-location levels that
 * inventory webhooks rely on (an empty list makes the next webhook zero the
 * stock until a snapshot lands). Known levels are carried over; inventory
 * items without levels, or whose levels no longer add up to the aggregate,
 * are returned so the caller can schedule an authoritative snapshot.
 */
export function carryOverInventoryLevels(
  incoming: Array<Record<string, unknown>>,
  existing: unknown,
): { variants: Array<Record<string, unknown>>; staleInventoryItemIds: string[] } {
  const previousLevels = new Map<string, Array<Record<string, unknown>>>()
  if (Array.isArray(existing)) {
    for (const candidate of existing) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
      const variant = candidate as Record<string, unknown>
      const levels = variant['inventory_levels']
      if (variant['inventory_item_id'] == null || !Array.isArray(levels) || levels.length === 0) continue
      previousLevels.set(String(variant['inventory_item_id']), levels as Array<Record<string, unknown>>)
    }
  }

  const staleInventoryItemIds: string[] = []
  const variants = incoming.map((variant) => {
    const inventoryItemId = variant['inventory_item_id']
    // Untracked inventory never needs location levels.
    if (inventoryItemId == null || variant['inventory_management'] === null) return variant
    const levels = previousLevels.get(String(inventoryItemId))
    if (!levels) {
      staleInventoryItemIds.push(String(inventoryItemId))
      return variant
    }
    const total = levels.reduce((sum, level) => sum + finiteQuantity(level['available']), 0)
    if (total !== finiteQuantity(variant['inventory_quantity'])) {
      staleInventoryItemIds.push(String(inventoryItemId))
    }
    return { ...variant, inventory_levels: levels }
  })
  return { variants, staleInventoryItemIds }
}

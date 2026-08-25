import { describe, expect, it } from 'vitest'
import { applyInventoryLevelUpdate, applyInventorySnapshot, isVariantPurchasable } from '../lib/inventory.js'

describe('multi-location inventory', () => {
  it('updates one location and recomputes the aggregate stock', () => {
    const variants = applyInventoryLevelUpdate([{
      id: 1,
      inventory_item_id: 9001,
      inventory_quantity: 8,
      inventory_levels: [
        { location_id: 10, location_name: 'Paris', available: 5 },
        { location_id: 20, location_name: 'Lyon', available: 3 },
      ],
    }], '9001', '10', 1)

    expect(variants[0]).toMatchObject({
      inventory_quantity: 4,
      inventory_levels: [
        { location_id: 10, location_name: 'Paris', available: 1 },
        { location_id: 20, location_name: 'Lyon', available: 3 },
      ],
    })
  })

  it('adds a newly activated location without dropping known locations', () => {
    const variants = applyInventoryLevelUpdate([{
      inventory_item_id: 9001,
      inventory_levels: [{ location_id: 10, available: 2 }],
    }], '9001', '30', 4)
    expect(variants[0]?.['inventory_quantity']).toBe(6)
    expect(variants[0]?.['inventory_levels']).toHaveLength(2)
  })

  it('replaces an optimistic update with the authoritative Shopify snapshot', () => {
    const variants = applyInventorySnapshot([{
      id: 1,
      inventory_item_id: 9001,
      inventory_quantity: 0,
      inventory_stale: true,
    }], {
      inventory_item_id: 9001,
      variant_id: 1,
      inventory_quantity: 7,
      inventory_management: 'shopify',
      inventory_policy: 'DENY',
      inventory_levels: [
        { location_id: 10, location_name: 'Paris', available: 3 },
        { location_id: 20, location_name: 'Lyon', available: 4 },
      ],
    })
    expect(variants[0]).toMatchObject({ inventory_quantity: 7, inventory_policy: 'DENY' })
    expect(variants[0]).not.toHaveProperty('inventory_stale')
  })

  it('keeps unrelated variants untouched and supports legacy aggregate events', () => {
    const input = [
      { inventory_item_id: 1, inventory_quantity: 2 },
      { inventory_item_id: 2, inventory_quantity: 7 },
    ]
    const variants = applyInventoryLevelUpdate(input, '1', null, 0)
    expect(variants).toEqual([
      { inventory_item_id: 1, inventory_quantity: 0 },
      { inventory_item_id: 2, inventory_quantity: 7 },
    ])
  })

  it('respects untracked and continue-selling variants', () => {
    expect(isVariantPurchasable({ inventory_management: null, inventory_quantity: 0 }, 5)).toBe(true)
    expect(isVariantPurchasable({ inventory_management: 'shopify', inventory_policy: 'CONTINUE', inventory_quantity: 0 }, 5)).toBe(true)
    expect(isVariantPurchasable({ inventory_management: 'shopify', inventory_policy: 'DENY', inventory_quantity: 2 }, 3)).toBe(false)
    expect(isVariantPurchasable({ inventory_quantity: 3 }, 3)).toBe(true)
  })
})

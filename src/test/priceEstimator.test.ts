/**
 * Deterministic simulated price ESTIMATOR tests:
 * common grocery items, unknown items, quantities, branded products, unit
 * handling, retailer variation, and repeatability (stable across calls).
 */
import { describe, it, expect } from 'vitest'
import { estimateUnitPrice } from '../data/priceEstimator'
import { STORES } from '../data/pricing'
import type { GroceryItem } from '../data/types'

function item(partial: Partial<GroceryItem> & { name: string }): GroceryItem {
  return {
    id: partial.id ?? partial.name,
    catalogId: null,
    quantity: 1,
    unit: 'each',
    brand: '',
    category: 'other',
    recognized: true,
    quantitySpecified: true,
    ...partial,
  }
}

describe('estimateUnitPrice — common grocery items', () => {
  it('prices ordinary items that lack a catalog entry', () => {
    const cases = [
      item({ name: 'Coffee', unit: 'bag', category: 'beverages' }),
      item({ name: 'Bottled Water', unit: 'case', category: 'beverages' }),
      item({ name: 'Chicken Thighs', unit: 'lb', category: 'meat' }),
      item({ name: 'Paper Towels', unit: 'pack', category: 'other' }),
    ]
    for (const it of cases) {
      const price = estimateUnitPrice(it, 'ralphs')
      expect(price).not.toBeNull()
      expect(price!).toBeGreaterThan(0)
    }
  })
})

describe('estimateUnitPrice — determinism / repeatability', () => {
  it('returns the same price for the same item + store across calls', () => {
    const it = item({ name: 'Coffee', unit: 'bag', category: 'beverages' })
    const a = estimateUnitPrice(it, 'ralphs')
    const b = estimateUnitPrice(it, 'ralphs')
    const c = estimateUnitPrice({ ...it, id: 'different-row-id' }, 'ralphs')
    expect(a).toBe(b)
    expect(c).toBe(a) // identity is name/catalogId, not the row id
  })

  it('prices by catalogId identity when present (stable regardless of name text)', () => {
    const a = estimateUnitPrice(item({ name: 'Oranges', catalogId: 'oranges', category: 'produce', unit: 'lb' }), 'aldi')
    const b = estimateUnitPrice(item({ name: 'oranges!!', catalogId: 'oranges', category: 'produce', unit: 'lb' }), 'aldi')
    expect(a).toBe(b)
  })
})

describe('estimateUnitPrice — retailer variation', () => {
  it('is cheapest at Aldi and priciest at Whole Foods for the same item', () => {
    const it = item({ name: 'Chicken Thighs', unit: 'lb', category: 'meat' })
    const byStore = Object.fromEntries(STORES.map((s) => [s.id, estimateUnitPrice(it, s.id)!]))
    const cheapest = Math.min(...Object.values(byStore))
    const priciest = Math.max(...Object.values(byStore))
    expect(byStore['aldi']).toBe(cheapest)
    expect(byStore['whole-foods']).toBe(priciest)
  })
})

describe('estimateUnitPrice — units & categories', () => {
  it('prices in the requested unit (a bunch is estimated as a bunch)', () => {
    const bunch = estimateUnitPrice(item({ name: 'Bananas', category: 'produce', unit: 'bunch' }), 'ralphs')
    const perLb = estimateUnitPrice(item({ name: 'Bananas', category: 'produce', unit: 'lb' }), 'ralphs')
    expect(bunch).not.toBeNull()
    expect(perLb).not.toBeNull()
    // Different unit classes yield different per-unit estimates.
    expect(bunch).not.toBe(perLb)
  })

  it('different categories get different base estimates', () => {
    const produce = estimateUnitPrice(item({ name: 'X', category: 'produce', unit: 'each' }), 'ralphs')
    const meat = estimateUnitPrice(item({ name: 'X', category: 'meat', unit: 'each' }), 'ralphs')
    expect(meat!).toBeGreaterThan(produce!)
  })
})

describe('estimateUnitPrice — branded & unknown items', () => {
  it('prices a branded product (no catalogId) by its category', () => {
    const price = estimateUnitPrice(
      item({ name: 'Diet Coke', category: 'beverages', unit: 'each' }),
      'ralphs'
    )
    expect(price).not.toBeNull()
    expect(price!).toBeGreaterThan(0)
  })

  it('falls back to the "other" category for an unknown item', () => {
    const price = estimateUnitPrice(item({ name: 'Mystery Thing', category: 'other', unit: 'each' }), 'vons')
    expect(price).not.toBeNull()
    expect(price!).toBeGreaterThan(0)
  })

  it('returns null only for an empty/uninterpretable item', () => {
    expect(estimateUnitPrice(item({ name: '   ', catalogId: null }), 'ralphs')).toBeNull()
  })
})

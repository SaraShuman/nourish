import { describe, it, expect } from 'vitest'
import { priceBasket, comparePrices, comparableItems, itemsNeedingClarification } from '../lib/priceBasket'
import { getSimulatedPrice, pricingUnit } from '../data/pricing'
import type { GroceryItem } from '../data/types'

/**
 * Build a priceable catalog item (quantity specified). Defaults the unit to
 * the product's PRICING unit (as the real parser does), so fixtures are
 * price-compatible unless a test deliberately overrides the unit.
 */
function item(partial: Partial<GroceryItem> & { catalogId: string }): GroceryItem {
  return {
    id: partial.catalogId,
    name: partial.catalogId,
    quantity: 1,
    unit: pricingUnit(partial.catalogId) ?? 'each',
    brand: '',
    category: 'produce',
    recognized: true,
    quantitySpecified: true,
    ...partial,
  }
}

describe('priceBasket — totals from real quantities', () => {
  it('multiplies unit price by quantity and sums available lines', () => {
    const items = [
      item({ catalogId: 'bananas', quantity: 2, unit: 'lb' }), // 0.59 * 2
      item({ catalogId: 'eggs', quantity: 1, unit: 'dozen' }), // 3.99
    ]
    const b = priceBasket(items, 'ralphs')
    expect(b.total).toBe(round(getSimulatedPrice('bananas', 'ralphs')! * 2 + getSimulatedPrice('eggs', 'ralphs')!))
    expect(b.coveredCount).toBe(2)
    expect(b.totalCount).toBe(2)
    expect(b.complete).toBe(true)
  })

  it('reports missing products honestly without inventing availability', () => {
    // "rice" exists at all three; invent a non-priced item to be missing:
    const items = [
      item({ catalogId: 'bananas', quantity: 1 }),
      item({ catalogId: 'nonexistent-item', quantity: 1 }),
    ]
    const b = priceBasket(items, 'ralphs')
    expect(b.totalCount).toBe(2)
    expect(b.coveredCount).toBe(1) // only bananas priced
    expect(b.complete).toBe(false)
    const missing = b.lines.find((l) => l.itemId === 'nonexistent-item')!
    expect(missing.available).toBe(false)
    expect(missing.lineTotal).toBeUndefined()
  })
})

describe('priceBasket — unit compatibility (no misleading cross-unit math)', () => {
  it('prices a line only when the unit matches the product pricing unit', () => {
    const items = [
      item({ catalogId: 'bananas', quantity: 3, unit: 'lb' }), // per lb → priced
      item({ catalogId: 'bananas', quantity: 2, unit: 'bunch', id: 'b2' }), // per lb ≠ bunch
    ]
    const b = priceBasket(items, 'ralphs')
    const perLb = b.lines.find((l) => l.unit === 'lb')!
    const perBunch = b.lines.find((l) => l.unit === 'bunch')!
    expect(perLb.available).toBe(true)
    expect(perLb.lineTotal).toBe(round(getSimulatedPrice('bananas', 'ralphs')! * 3))
    // Incompatible unit → NOT multiplied, left unpriced (never a bogus total).
    expect(perBunch.available).toBe(false)
    expect(perBunch.lineTotal).toBeUndefined()
  })

  it('leaves eggs unpriced when requested per "each" (price is per dozen)', () => {
    const b = priceBasket([item({ catalogId: 'eggs', quantity: 6, unit: 'each' })], 'ralphs')
    expect(b.coveredCount).toBe(0)
    expect(b.lines[0].available).toBe(false)
  })

  it('prices an "each"-priced product requested in "each" (avocados)', () => {
    const b = priceBasket([item({ catalogId: 'avocados', quantity: 4, unit: 'each' })], 'ralphs')
    expect(b.lines[0].available).toBe(true)
    expect(b.lines[0].lineTotal).toBe(round(getSimulatedPrice('avocados', 'ralphs')! * 4))
  })

  it('treats "lbs" as "lb" (normalized) so it still prices', () => {
    const b = priceBasket([item({ catalogId: 'chicken-breast', quantity: 2, unit: 'lbs' })], 'ralphs')
    expect(b.lines[0].available).toBe(true)
  })

  it('an incompatible-unit item is reported as unpriced across all stores', () => {
    // pasta is priced per box; requesting it per lb should price nowhere.
    const r = comparePrices([item({ catalogId: 'pasta', quantity: 1, unit: 'lb' })])
    expect(r.anyComplete).toBe(false)
    expect(r.unpricedItemNames).toContain('pasta')
  })
})

describe('basket counts the full resolved list (missing items shown, not dropped)', () => {
  it('includes resolved items a store cannot price, counting them in the denominator', () => {
    const items = [
      item({ catalogId: 'bananas', quantity: 2, unit: 'lb' }), // priced
      item({ catalogId: 'eggs', quantity: 1, unit: 'dozen' }), // priced
      // Resolved branded item with no catalogId & no simulated price → counted
      // as a line, shown unavailable, NOT silently dropped.
      {
        ...item({ catalogId: 'x' }),
        id: 'diet-coke',
        catalogId: null,
        name: 'Diet Coke',
        unit: 'each',
        recognized: true,
        quantitySpecified: true,
      } as GroceryItem,
      // A catalog item that simply isn't in the demo price table.
      item({ catalogId: 'garlic', name: 'Garlic', quantity: 1, unit: 'each' }),
    ]
    const b = priceBasket(items, 'ralphs')
    // All four resolved items are counted…
    expect(b.totalCount).toBe(4)
    // …but only the two with a simulated price are available.
    expect(b.coveredCount).toBe(2)
    expect(b.complete).toBe(false)
    const dietCoke = b.lines.find((l) => l.itemId === 'diet-coke')!
    expect(dietCoke.available).toBe(false)
  })

  it('does NOT count items still awaiting clarification', () => {
    const items = [
      item({ catalogId: 'bananas', quantity: 1, unit: 'lb' }),
      item({ catalogId: 'chicken-breast', unit: 'lb', quantitySpecified: false }), // weight unspecified
    ]
    const b = priceBasket(items, 'ralphs')
    expect(b.totalCount).toBe(1) // chicken excluded until weight is given
  })
})

describe('comparableItems — exclusions', () => {
  it('excludes items needing weight/package clarification and non-catalog rows', () => {
    const items = [
      item({ catalogId: 'bananas' }),
      item({ catalogId: 'chicken-breast', unit: 'lb', quantitySpecified: false }), // weight unspecified
      { ...item({ catalogId: 'x' }), catalogId: null, recognized: false } as GroceryItem,
    ]
    const comparable = comparableItems(items)
    expect(comparable.map((i) => i.catalogId)).toEqual(['bananas'])
    expect(itemsNeedingClarification(items).some((i) => i.name === 'chicken-breast')).toBe(true)
  })
})

describe('comparePrices — single lowest-complete ranking', () => {
  const items = [
    item({ catalogId: 'bananas', quantity: 2, unit: 'lb' }),
    item({ catalogId: 'eggs', quantity: 1, unit: 'dozen' }),
    item({ catalogId: 'chicken-breast', quantity: 2, unit: 'lb' }),
  ]

  it('recommends the cheapest store that covers the full list', () => {
    const r = comparePrices(items)
    const rec = r.baskets.find((b) => b.storeId === r.recommendedId)!
    expect(rec.complete).toBe(true)
    // Among complete baskets it is the cheapest.
    const cheapestComplete = r.baskets
      .filter((b) => b.complete)
      .reduce((lo, b) => (b.total < lo.total ? b : lo))
    expect(rec.storeId).toBe(cheapestComplete.storeId)
    expect(r.anyComplete).toBe(true)
    expect(r.tradeoffNote).toBeNull() // no distances provided
  })

  it('restricts comparison to the provided nearby store ids', () => {
    // Only Ralphs & Whole Foods "found nearby" → others excluded.
    const r = comparePrices(items, ['ralphs', 'whole-foods'])
    expect(r.baskets.map((b) => b.storeId).sort()).toEqual(['ralphs', 'whole-foods'])
    expect(r.recommendedId).toBe('ralphs') // cheaper of the two
  })

  it('when no store covers the full list, recommends widest coverage and flags partial', () => {
    // "oranges" has no price at any store → every basket is incomplete.
    const partialList = [
      item({ catalogId: 'bananas', quantity: 2, unit: 'lb' }),
      item({ catalogId: 'oranges', quantity: 1, unit: 'lb' }),
    ]
    const r = comparePrices(partialList, ['ralphs', 'aldi'])
    expect(r.anyComplete).toBe(false)
    const rec = r.baskets.find((b) => b.storeId === r.recommendedId)!
    expect(rec.complete).toBe(false)
    // Among the partial (bananas-only) baskets, the cheapest is recommended —
    // never presented as a complete basket.
    expect(r.unpricedItemNames).toContain('oranges')
  })

  it('surfaces a closer-store tradeoff when one is slightly pricier but much nearer', () => {
    // Aldi ($12.55) is cheapest; Walmart ($13.80) is $1.25 more (within 15%).
    // Make Walmart much closer than Aldi → factual tradeoff note appears.
    const r = comparePrices(items, ['aldi', 'walmart'], { aldi: 8.0, walmart: 0.5 })
    expect(r.recommendedId).toBe('aldi') // still the cheapest pick
    expect(r.tradeoffNote).toMatch(/walmart is about .* closer for only \$1\.25 more/i)
    expect(r.tradeoffNote).toMatch(/straight-line distance, not drive time/i)
  })

  it('no tradeoff note when the nearer store is a lot pricier', () => {
    // Whole Foods ($23.45) is far pricier than Aldi — exceeds the "slight" cap.
    const r = comparePrices(items, ['aldi', 'whole-foods'], { aldi: 9.0, 'whole-foods': 0.3 })
    expect(r.recommendedId).toBe('aldi')
    expect(r.tradeoffNote).toBeNull()
  })

  it('no tradeoff note when the cheaper pick is also the closest', () => {
    const r = comparePrices(items, ['aldi', 'walmart'], { aldi: 0.4, walmart: 6.0 })
    expect(r.recommendedId).toBe('aldi')
    expect(r.tradeoffNote).toBeNull()
  })

  it('returns no recommendation when there are no comparable items', () => {
    const r = comparePrices([])
    expect(r.recommendedId).toBeNull()
  })
})

describe('brand substitutions OFF', () => {
  it('still prices a store that carries the catalog item (brand preserved on the item)', () => {
    const items = [item({ catalogId: 'chicken-breast', quantity: 1, unit: 'lb', brand: 'Perdue' })]
    const b = priceBasket(items, 'ralphs')
    expect(b.coveredCount).toBe(1)
    // The shopper's brand preference remains on the item (not altered by pricing).
    expect(items[0].brand).toBe('Perdue')
  })
})

function round(n: number): number {
  return Math.round(n * 100) / 100
}

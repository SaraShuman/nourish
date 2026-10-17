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

  it('estimates items not in the catalog (no $0.00, no false "missing")', () => {
    const items = [
      item({ catalogId: 'bananas', quantity: 1 }), // catalog price
      item({ catalogId: 'quinoa-xyz', name: 'Quinoa', quantity: 1, unit: 'bag', category: 'pantry' }),
    ]
    const b = priceBasket(items, 'ralphs')
    expect(b.totalCount).toBe(2)
    expect(b.coveredCount).toBe(2) // both priced — the second by estimate
    expect(b.complete).toBe(true)
    const bananas = b.lines.find((l) => l.name.toLowerCase().includes('banana'))!
    const quinoa = b.lines.find((l) => l.name === 'Quinoa')!
    expect(bananas.estimated).toBe(false) // from the curated catalog table
    expect(quinoa.estimated).toBe(true) // from the category estimator
    expect(quinoa.lineTotal).toBeGreaterThan(0)
  })
})

describe('priceBasket — catalog price vs. estimate by unit', () => {
  it('uses the exact catalog price when the unit matches the pricing unit', () => {
    const b = priceBasket([item({ catalogId: 'bananas', quantity: 3, unit: 'lb' })], 'ralphs')
    const line = b.lines[0]
    expect(line.estimated).toBe(false)
    expect(line.lineTotal).toBe(round(getSimulatedPrice('bananas', 'ralphs')! * 3))
  })

  it('estimates (in the requested unit) when the unit differs from the catalog unit', () => {
    // bananas is priced per lb; a "bunch" is estimated as a bunch, not per lb.
    const b = priceBasket([item({ catalogId: 'bananas', quantity: 1, unit: 'bunch' })], 'ralphs')
    const line = b.lines[0]
    expect(line.available).toBe(true)
    expect(line.estimated).toBe(true) // fell back to the estimator
    expect(line.lineTotal).toBeGreaterThan(0)
  })

  it('estimates eggs-by-each rather than leaving it unpriced', () => {
    const b = priceBasket([item({ catalogId: 'eggs', quantity: 6, unit: 'each' })], 'ralphs')
    expect(b.coveredCount).toBe(1)
    expect(b.lines[0].available).toBe(true)
    expect(b.lines[0].estimated).toBe(true)
  })

  it('still uses the exact catalog price for an each-priced product (avocados)', () => {
    const b = priceBasket([item({ catalogId: 'avocados', quantity: 4, unit: 'each' })], 'ralphs')
    expect(b.lines[0].estimated).toBe(false)
    expect(b.lines[0].lineTotal).toBe(round(getSimulatedPrice('avocados', 'ralphs')! * 4))
  })

  it('treats "lbs" as "lb" (normalized) so it uses the catalog price', () => {
    const b = priceBasket([item({ catalogId: 'chicken-breast', quantity: 2, unit: 'lbs' })], 'ralphs')
    expect(b.lines[0].estimated).toBe(false)
  })

  it('a cross-unit catalog item is still priced (by estimate) across all stores', () => {
    // pasta is priced per box; requesting it per lb now estimates rather than
    // leaving a gap — the basket stays complete.
    const r = comparePrices([item({ catalogId: 'pasta', quantity: 1, unit: 'lb' })])
    expect(r.anyComplete).toBe(true)
    expect(r.unpricedItemNames).toHaveLength(0)
  })
})

describe('basket counts the full resolved list (missing items shown, not dropped)', () => {
  it('prices every resolved item — catalog where available, estimate otherwise', () => {
    const items = [
      item({ catalogId: 'bananas', quantity: 2, unit: 'lb' }), // catalog
      item({ catalogId: 'eggs', quantity: 1, unit: 'dozen' }), // catalog
      // Resolved branded item with no catalogId & no catalog price → ESTIMATED,
      // not left as a $0 gap.
      {
        ...item({ catalogId: 'x' }),
        id: 'diet-coke',
        catalogId: null,
        name: 'Diet Coke',
        category: 'beverages',
        unit: 'each',
        recognized: true,
        quantitySpecified: true,
      } as GroceryItem,
      // A catalog item that simply isn't in the demo price table → ESTIMATED.
      item({ catalogId: 'garlic', name: 'Garlic', quantity: 1, unit: 'each', category: 'produce' }),
    ]
    const b = priceBasket(items, 'ralphs')
    // All four counted AND priced → complete basket, no gaps.
    expect(b.totalCount).toBe(4)
    expect(b.coveredCount).toBe(4)
    expect(b.complete).toBe(true)
    const dietCoke = b.lines.find((l) => l.itemId === 'diet-coke')!
    expect(dietCoke.available).toBe(true)
    expect(dietCoke.estimated).toBe(true)
  })

  it('prices an unspecified-weight item on its suggested default (not excluded)', () => {
    const items = [
      item({ catalogId: 'bananas', quantity: 1, unit: 'lb' }),
      item({ catalogId: 'chicken-breast', unit: 'lb', quantitySpecified: false }), // suggested 1 lb
    ]
    const b = priceBasket(items, 'ralphs')
    // The suggested-weight item is now counted AND priced (no $0.00 gap).
    expect(b.totalCount).toBe(2)
    expect(b.coveredCount).toBe(2)
    expect(b.complete).toBe(true)
  })

  it('still excludes a genuinely ambiguous item (needs a product choice)', () => {
    const items = [
      item({ catalogId: 'bananas', quantity: 1, unit: 'lb' }),
      { ...item({ catalogId: 'x' }), catalogId: null, name: 'Chicken', ambiguous: true } as GroceryItem,
    ]
    const b = priceBasket(items, 'ralphs')
    expect(b.totalCount).toBe(1) // ambiguous "chicken" excluded until clarified
  })
})

describe('comparableItems — exclusions', () => {
  it('includes suggested-weight catalog items; still excludes ambiguous rows', () => {
    const items = [
      item({ catalogId: 'bananas' }),
      item({ catalogId: 'chicken-breast', unit: 'lb', quantitySpecified: false }), // suggested → priceable
      { ...item({ catalogId: 'x' }), catalogId: null, name: 'Chicken', ambiguous: true } as GroceryItem,
    ]
    const comparable = comparableItems(items)
    // Both catalog items are comparable now (suggested weight no longer blocks).
    expect(comparable.map((i) => i.catalogId).sort()).toEqual(['bananas', 'chicken-breast'])
    // The ambiguous row still needs clarification before pricing.
    expect(itemsNeedingClarification(items).length).toBe(0) // ambiguous handled separately
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

  it('a catalog item missing from the price table is now estimated → complete basket', () => {
    // "oranges" has no catalog price, but is interpretable → estimated, so the
    // basket is complete (no partial warning, no gap).
    const list = [
      item({ catalogId: 'bananas', quantity: 2, unit: 'lb' }),
      item({ catalogId: 'oranges', name: 'Oranges', quantity: 1, unit: 'lb', category: 'produce' }),
    ]
    const r = comparePrices(list, ['ralphs', 'aldi'])
    expect(r.anyComplete).toBe(true)
    expect(r.unpricedItemNames).toHaveLength(0)
    const rec = r.baskets.find((b) => b.storeId === r.recommendedId)!
    expect(rec.complete).toBe(true)
  })

  it('an ordinary list of varied/unknown items prices completely (no gaps)', () => {
    // The kinds of items that used to produce $0.00 / partial warnings.
    const list = [
      item({ catalogId: 'chicken-thighs', name: 'Chicken Thighs', quantity: 2, unit: 'lb', category: 'meat' }),
      item({ catalogId: 'coffee', name: 'Coffee', quantity: 1, unit: 'bag', category: 'beverages' }),
      item({ catalogId: 'water', name: 'Bottled Water', quantity: 1, unit: 'case', category: 'beverages' }),
      item({ catalogId: 'bananas', name: 'Bananas', quantity: 1, unit: 'bunch', category: 'produce' }),
    ]
    const r = comparePrices(list, ['ralphs', 'aldi', 'whole-foods'])
    expect(r.anyComplete).toBe(true)
    expect(r.unpricedItemNames).toHaveLength(0)
    for (const b of r.baskets) {
      expect(b.complete).toBe(true)
      expect(b.total).toBeGreaterThan(0) // never a $0.00 "valid" total
    }
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

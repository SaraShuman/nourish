/**
 * Deterministic SIMULATED price ESTIMATOR for the demo.
 *
 * The hand-tuned PRICE_TABLE only covers ~17 products. Rather than leave common
 * grocery items ("coffee", "bottled water", "chicken thighs by the bag")
 * unpriced — which produced $0.00 totals, partial warnings, and red boxes —
 * this estimator produces a reasonable, STABLE per-unit price for any
 * interpretable item, using its grocery category and chosen unit.
 *
 * Properties (by design):
 *  - Deterministic: identical item identity + store always yields the same
 *    number. No per-render randomness, no Date/Math.random.
 *  - Retailer-consistent: the same per-store factor ordering as the real demo
 *    table (Aldi/Walmart cheapest … Whole Foods priciest), so comparisons are
 *    meaningful across the list.
 *  - Honest: these are clearly labeled ESTIMATES, never implied to be verified
 *    store prices. We estimate the price of exactly what the shopper asked for
 *    (their unit/quantity), never silently substituting a product or size.
 *
 * This is still demo data. A real pricing provider would replace it.
 */
import type { GroceryCategory, GroceryItem } from './types'
import type { StoreId } from './pricing'

/**
 * Stable per-store multipliers. Mirrors the PRICE_TABLE spread so estimated
 * items sort alongside catalog items believably (Aldi cheapest, WF priciest).
 */
const STORE_FACTOR: Record<StoreId, number> = {
  aldi: 0.9,
  walmart: 0.93,
  'trader-joes': 0.97,
  ralphs: 1.0,
  vons: 1.04,
  'whole-foods': 1.25,
}

/**
 * Base per-UNIT price by category, keyed by a coarse unit class. Values are
 * believable U.S. grocery ballparks for a demo — not real prices. "each" is
 * the per-single-item price; "weight" is per lb; "volume" is per gal/qt-ish
 * container; "pack" is per package/box/bag/case.
 */
type UnitClass = 'weight' | 'each' | 'pack' | 'volume'

const CATEGORY_BASE: Record<GroceryCategory, Record<UnitClass, number>> = {
  produce: { weight: 1.6, each: 0.8, pack: 3.5, volume: 3.0 },
  dairy: { weight: 4.5, each: 1.5, pack: 4.5, volume: 3.6 },
  meat: { weight: 5.5, each: 6.0, pack: 7.5, volume: 6.0 },
  seafood: { weight: 9.0, each: 7.0, pack: 10.0, volume: 8.0 },
  bakery: { weight: 4.0, each: 1.2, pack: 3.5, volume: 3.5 },
  pantry: { weight: 2.2, each: 2.5, pack: 3.2, volume: 4.0 },
  frozen: { weight: 4.0, each: 4.5, pack: 5.0, volume: 5.5 },
  beverages: { weight: 2.5, each: 1.8, pack: 5.5, volume: 3.0 },
  snacks: { weight: 4.0, each: 2.5, pack: 3.8, volume: 4.0 },
  other: { weight: 3.0, each: 3.5, pack: 5.0, volume: 4.5 },
}

/** Classify a shopper's unit into a coarse pricing class. */
function unitClass(unit: string): UnitClass {
  const u = unit.trim().toLowerCase()
  if (['lb', 'lbs', 'oz', 'kg', 'g', 'pound', 'pounds', 'ounce', 'ounces'].includes(u)) {
    return 'weight'
  }
  if (
    ['gal', 'gallon', 'half gal', 'qt', 'quart', 'pint', 'liter', 'l', 'ml', 'fl oz'].includes(u)
  ) {
    return 'volume'
  }
  if (
    [
      'pack', 'package', 'box', 'bag', 'case', 'carton', 'dozen', 'half dozen', '18-pack',
      'loaf', 'container', 'jar', 'can', 'bottle', 'bunch', 'count', '6-pack', '12-pack',
    ].includes(u)
  ) {
    return 'pack'
  }
  // "each", "head", "stick", "bulb", or anything unknown → treat as a single item.
  return 'each'
}

/**
 * Small deterministic multiplier in ~[0.85, 1.15] derived from the item's
 * identity, so two different items in the same category/unit don't share an
 * identical price, while the SAME item is always stable. Pure string hash —
 * no randomness.
 */
function identityJitter(seed: string): number {
  let h = 2166136261 >>> 0 // FNV-1a
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  // Map to [-0.15, +0.15].
  const frac = (h % 1000) / 1000 // [0,1)
  return 1 + (frac * 0.3 - 0.15)
}

/** The identity key an estimate is stable against (catalog id or cleaned name). */
function identityKey(item: GroceryItem): string {
  return (item.catalogId ?? item.name ?? '').trim().toLowerCase()
}

/** Round to cents. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Estimate a per-unit simulated price for an item at a store. Deterministic.
 * Returns a positive number for any item with a usable name/category — only
 * truly empty items (no name) yield null.
 */
export function estimateUnitPrice(item: GroceryItem, store: StoreId): number | null {
  const key = identityKey(item)
  if (!key) return null
  const category: GroceryCategory = item.category ?? 'other'
  const cls = unitClass(item.unit)
  const base = CATEGORY_BASE[category]?.[cls] ?? CATEGORY_BASE.other[cls]
  const price = base * identityJitter(key) * STORE_FACTOR[store]
  // Keep demo prices sane: never below $0.25.
  return round2(Math.max(0.25, price))
}

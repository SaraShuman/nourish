/**
 * SIMULATED pricing dataset for the MVP — deterministic, fixture-only.
 *
 * IMPORTANT: These are NOT real retailer prices. They are stable demo numbers
 * so comparison math is consistent. Pricing lives here (data) and in
 * priceBasket.ts (logic), kept SEPARATE from real store-location data (which
 * comes from Google Places). A real pricing provider (Kroger API, etc.) can
 * replace this later.
 *
 * Price is per the catalog item's default unit (per lb, per dozen, per each).
 * A MISSING entry means that store doesn't carry the item — never invented.
 */

export type StoreId =
  | 'ralphs'
  | 'trader-joes'
  | 'whole-foods'
  | 'vons' // Vons / Safeway banner family
  | 'walmart'
  | 'aldi'

export interface StoreInfo {
  id: StoreId
  name: string
  /** CSS color token name for the styled retailer label. */
  colorVar: string
}

export const STORES: StoreInfo[] = [
  { id: 'ralphs', name: 'Ralphs', colorVar: '--color-ralphs' },
  { id: 'trader-joes', name: "Trader Joe's", colorVar: '--color-traderjoes' },
  { id: 'whole-foods', name: 'Whole Foods Market', colorVar: '--color-wholefoods' },
  { id: 'vons', name: 'Vons', colorVar: '--color-vons' },
  { id: 'walmart', name: 'Walmart', colorVar: '--color-walmart' },
  { id: 'aldi', name: 'Aldi', colorVar: '--color-aldi' },
]

export const STORE_BY_ID: Record<StoreId, StoreInfo> = Object.fromEntries(
  STORES.map((s) => [s.id, s])
) as Record<StoreId, StoreInfo>

/**
 * Match a discovered store name (from Google Places) to one of our priced
 * retailers, or null when we have no pricing for it.
 *
 * Banner-accurate: Vons and Safeway are the same operating banner here, so
 * both map to `vons`. But we do NOT merge different banners that merely share
 * a parent company (e.g. Ralphs and Vons are both large chains but are kept
 * distinct; Trader Joe's and Aldi share ownership history but are separate).
 */
const RETAILER_MATCHERS: { id: StoreId; test: RegExp }[] = [
  { id: 'trader-joes', test: /\btrader\s*joe'?s\b/i },
  { id: 'whole-foods', test: /\bwhole\s*foods\b/i },
  { id: 'ralphs', test: /\bralphs\b/i },
  // Vons banner family (Vons, Pavilions, Safeway all run on this banner's pricing here).
  { id: 'vons', test: /\b(vons|pavilions|safeway)\b/i },
  { id: 'walmart', test: /\bwalmart\b/i },
  { id: 'aldi', test: /\baldi\b/i },
]

export function matchRetailer(osmName: string | undefined): StoreId | null {
  if (!osmName) return null
  for (const m of RETAILER_MATCHERS) {
    if (m.test.test(osmName)) return m.id
  }
  return null
}

/**
 * Per-unit simulated prices: PRICE_TABLE[catalogId][storeId].
 * Tuned so Aldi/Walmart trend cheapest, Whole Foods priciest — purely for a
 * believable demo. Omit a store from an item to simulate "not carried".
 */
export const PRICE_TABLE: Record<string, Partial<Record<StoreId, number>>> = {
  // Produce
  bananas: { ralphs: 0.59, 'trader-joes': 0.69, 'whole-foods': 0.99, vons: 0.64, walmart: 0.54, aldi: 0.49 },
  apples: { ralphs: 1.49, 'trader-joes': 1.69, 'whole-foods': 2.29, vons: 1.59, walmart: 1.39, aldi: 1.29 },
  avocados: { ralphs: 1.0, 'trader-joes': 0.99, 'whole-foods': 1.79, vons: 1.19, walmart: 0.98, aldi: 0.89 },
  spinach: { ralphs: 2.49, 'trader-joes': 2.29, 'whole-foods': 3.49, vons: 2.69, walmart: 2.19, aldi: 1.99 },
  tomatoes: { ralphs: 1.99, 'trader-joes': 2.29, 'whole-foods': 2.99, vons: 2.09, walmart: 1.89, aldi: 1.69 },
  strawberries: { ralphs: 3.49, 'trader-joes': 3.29, 'whole-foods': 4.99, vons: 3.69, walmart: 3.19, aldi: 2.99 },

  // Dairy & eggs
  'whole-milk': { ralphs: 3.49, 'trader-joes': 3.69, 'whole-foods': 4.49, vons: 3.59, walmart: 3.29, aldi: 3.09 },
  eggs: { ralphs: 3.99, 'trader-joes': 3.49, 'whole-foods': 5.49, vons: 3.89, walmart: 3.44, aldi: 2.99 },
  butter: { ralphs: 4.49, 'trader-joes': 3.99, 'whole-foods': 5.99, vons: 4.59, walmart: 3.98, aldi: 3.49 },
  'cheddar-cheese': { ralphs: 4.99, 'trader-joes': 4.49, 'whole-foods': 6.49, vons: 5.09, walmart: 4.44, aldi: 3.99 },
  'greek-yogurt': { ralphs: 5.49, 'trader-joes': 4.99, 'whole-foods': 6.99, vons: 5.59, walmart: 4.98, aldi: 4.49 },

  // Meat (per lb)
  'chicken-breast': { ralphs: 4.99, 'trader-joes': 5.49, 'whole-foods': 7.99, vons: 5.29, walmart: 4.64, aldi: 4.29 },
  'chicken-thighs': { ralphs: 3.49, 'trader-joes': 3.99, 'whole-foods': 5.49, vons: 3.69, walmart: 3.19, aldi: 2.99 },
  'ground-beef': { ralphs: 5.99, 'trader-joes': 6.49, 'whole-foods': 7.99, vons: 6.19, walmart: 5.64, aldi: 5.29 },

  // Bakery & pantry
  bread: { ralphs: 2.99, 'trader-joes': 2.49, 'whole-foods': 3.99, vons: 3.09, walmart: 2.44, aldi: 1.99 },
  pasta: { ralphs: 1.49, 'trader-joes': 0.99, 'whole-foods': 2.29, vons: 1.59, walmart: 1.19, aldi: 0.89 },
  rice: { ralphs: 3.99, 'trader-joes': 3.49, 'whole-foods': 4.99, vons: 4.09, walmart: 3.44, aldi: 3.19 },
}

/** Look up a simulated per-unit price, or undefined if the store lacks it. */
export function getSimulatedPrice(catalogId: string | null, store: StoreId): number | undefined {
  if (!catalogId) return undefined
  return PRICE_TABLE[catalogId]?.[store]
}

/**
 * The UNIT each product's demo price is expressed in (audited against the
 * catalog's natural selling unit). A basket line can only be priced when the
 * shopper's chosen unit is compatible with this — multiplying a per-lb price
 * by a "bag" or "each" quantity would be misleading, so those are left
 * unpriced instead (see isPricingUnitCompatible).
 *
 * Keep this in lockstep with PRICE_TABLE: every priced product has an entry.
 */
export const PRICING_UNITS: Record<string, string> = {
  // Produce
  bananas: 'lb',
  apples: 'lb',
  avocados: 'each',
  spinach: 'bunch',
  tomatoes: 'lb',
  strawberries: 'lb',
  // Dairy & eggs
  'whole-milk': 'gal',
  eggs: 'dozen',
  butter: 'lb',
  'cheddar-cheese': 'oz',
  'greek-yogurt': '32 oz',
  // Meat (per lb)
  'chicken-breast': 'lb',
  'chicken-thighs': 'lb',
  'ground-beef': 'lb',
  // Bakery & pantry
  bread: 'loaf',
  pasta: 'box',
  rice: 'lb',
}

/** The unit a product's demo price assumes, or undefined if not priced. */
export function pricingUnit(catalogId: string | null): string | undefined {
  if (!catalogId) return undefined
  return PRICING_UNITS[catalogId]
}

/** Normalize a unit for comparison (lowercase, trim, singularize "lbs"). */
function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase()
  return u === 'lbs' ? 'lb' : u
}

/**
 * Whether the shopper's chosen unit is compatible with the product's demo
 * pricing unit, so quantity × price is meaningful. We only price exact-unit
 * matches — we never convert between incomparable units (lb vs bag vs each).
 * Returns false when the product isn't priced at all.
 */
export function isPricingUnitCompatible(catalogId: string | null, unit: string): boolean {
  const pu = pricingUnit(catalogId)
  if (!pu) return false
  return normalizeUnit(unit) === normalizeUnit(pu)
}

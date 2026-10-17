/**
 * Basket pricing + store comparison — pure, UI-free logic over the SIMULATED
 * price table. Totals are computed from real list quantities and matched
 * products; missing items are reported honestly (never assumed available).
 */
import type { GroceryItem } from '../data/types'
import { STORES, getSimulatedPrice, isPricingUnitCompatible, type StoreId } from '../data/pricing'
import { estimateUnitPrice } from '../data/priceEstimator'
import { isPriceable } from './pricingReadiness'

export interface BasketLine {
  itemId: string
  name: string
  quantity: number
  /** The shopper's chosen unit (e.g. "lb", "dozen", "each"). */
  unit: string
  /** Per-unit simulated price, or undefined when the item couldn't be priced. */
  unitPrice?: number
  /** quantity × unitPrice, or undefined when unavailable. */
  lineTotal?: number
  available: boolean
  /**
   * True when the price came from the category/unit ESTIMATOR rather than the
   * hand-tuned catalog table. Used only to keep disclosures honest — never to
   * imply a verified price.
   */
  estimated: boolean
}

export interface StoreBasket {
  storeId: StoreId
  storeName: string
  colorVar: string
  lines: BasketLine[]
  /** Sum of available line totals. */
  total: number
  /** How many list items this store can fulfill. */
  coveredCount: number
  /** Total list items considered. */
  totalCount: number
  /** True when the store covers every item. */
  complete: boolean
}

export interface ComparisonResult {
  baskets: StoreBasket[]
  /** Store id recommended (cheapest complete basket), or null if none. */
  recommendedId: StoreId | null
  /**
   * A short, factual tradeoff note when a non-recommended store is only
   * slightly pricier but substantially closer (straight-line). Null when no
   * such store exists or distances aren't available. Never implies driving
   * time or fuel cost.
   */
  tradeoffNote: string | null
  /** Number of list items considered (same across stores). */
  itemCount: number
  /**
   * True when at least one store can fulfill EVERY considered item, so a
   * full-basket "Best Value" + savings claim is fair. When false, savings are
   * only over the matched subset and must be labeled partial.
   */
  anyComplete: boolean
  /** Names of items no store could price/match (for an honest explanation). */
  unpricedItemNames: string[]
}

/**
 * Only items that are priceable right now count toward the comparison. An
 * item that still needs a package size / weight is EXCLUDED until clarified —
 * the caller gates the definitive total on there being no such items.
 */
export function comparableItems(items: GroceryItem[]): GroceryItem[] {
  // Must be a recognized catalog item with a catalogId to price it.
  return items.filter((it) => isPriceable(it) && Boolean(it.catalogId))
}

/**
 * The list items that COUNT toward a store basket: every real row that is NOT
 * still waiting on clarification. This includes items a given store can't
 * price — they appear as unpriced rather than silently disappearing, so
 * "X of Y items priced" reflects the shopper's actual list.
 */
export function basketItems(items: GroceryItem[]): GroceryItem[] {
  return items.filter(
    (it) => it.ambiguous !== true && isPriceable(it) && (it.name?.trim().length ?? 0) > 0
  )
}

/** Build one store's basket. Prices what it can; counts the rest as missing. */
export function priceBasket(items: GroceryItem[], store: StoreId): StoreBasket {
  const info = STORES.find((s) => s.id === store)!
  const basket = basketItems(items)
  let total = 0
  let covered = 0

  const lines: BasketLine[] = basket.map((it) => {
    // 1) Prefer the hand-tuned catalog price when it exists AND the shopper's
    //    unit matches the unit that price assumes (no misleading cross-unit
    //    math). This preserves the curated demo values exactly.
    const catalogPrice = getSimulatedPrice(it.catalogId, store)
    const catalogUsable = catalogPrice !== undefined && isPricingUnitCompatible(it.catalogId, it.unit)

    // 2) Otherwise fall back to a deterministic category/unit ESTIMATE, priced
    //    in the shopper's requested unit (e.g. a "bunch" of bananas as a bunch).
    //    Only a truly empty/uninterpretable item yields no estimate.
    const estimate = catalogUsable ? null : estimateUnitPrice(it, store)

    const unitPrice = catalogUsable ? catalogPrice : (estimate ?? undefined)
    const available = unitPrice !== undefined
    const estimated = available && !catalogUsable
    const lineTotal = available ? round2(unitPrice! * it.quantity) : undefined
    if (available) {
      total = round2(total + lineTotal!)
      covered += 1
    }
    return {
      itemId: it.id,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice,
      lineTotal,
      available,
      estimated,
    }
  })

  return {
    storeId: store,
    storeName: info.name,
    colorVar: info.colorVar,
    lines,
    total,
    coveredCount: covered,
    totalCount: basket.length,
    complete: basket.length > 0 && covered === basket.length,
  }
}

/** Round to cents to avoid float drift in displayed totals. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Compare stores and pick the single most practical recommendation — no
 * user-chosen strategy. The rule is intentionally simple and explainable:
 *
 *  1. If any store covers the WHOLE list, recommend the cheapest COMPLETE
 *     basket. (We never present a partial basket as the cheapest complete
 *     option.)
 *  2. If no store covers the whole list, recommend the widest coverage, and
 *     among those the cheapest — clearly a PARTIAL result (anyComplete=false).
 *
 * Separately, when a different store is only SLIGHTLY pricier but
 * SUBSTANTIALLY closer (verified straight-line distance), we surface a short,
 * factual tradeoff note. It never implies driving time or fuel cost.
 */
export function comparePrices(
  items: GroceryItem[],
  /**
   * Which retailers to compare. When provided (from real nearby-store
   * discovery), ONLY these appear — so the comparison reflects stores actually
   * found near the shopper. Defaults to all retailers when omitted.
   */
  storeIds?: StoreId[],
  /**
   * Verified straight-line distance (miles) per store id, from real discovery.
   * Used only for the closer-alternative tradeoff note. Omit (or leave entries
   * undefined) when a store's distance isn't verified — we never invent one.
   */
  distancesById?: Partial<Record<StoreId, number>>
): ComparisonResult {
  const pool = storeIds && storeIds.length ? STORES.filter((s) => storeIds.includes(s.id)) : STORES
  const baskets = pool.map((s) => priceBasket(items, s.id))
  const itemCount = baskets[0]?.totalCount ?? 0
  const anyComplete = baskets.some((b) => b.complete)

  // Items no store could price (available: false in EVERY basket).
  const unpricedItemNames = (baskets[0]?.lines ?? [])
    .filter((line) => baskets.every((b) => !b.lines.find((l) => l.itemId === line.itemId)?.available))
    .map((line) => line.name)

  // With no items considered, there's nothing to recommend.
  const hasAny = baskets.some((b) => b.totalCount > 0)
  if (!hasAny) {
    return { baskets, recommendedId: null, tradeoffNote: null, itemCount, anyComplete, unpricedItemNames }
  }

  const priced = baskets.filter((b) => b.coveredCount > 0)
  const complete = baskets.filter((b) => b.complete)

  // Rank by completeness first, then price: a complete basket always beats a
  // partial one; among the chosen tier, cheapest total wins.
  const maxCoverage = Math.max(...priced.map((b) => b.coveredCount))
  const candidates = complete.length > 0 ? complete : priced.filter((b) => b.coveredCount === maxCoverage)
  const recommended = candidates.reduce<StoreBasket | null>((best, b) => {
    if (!best) return b
    return b.total < best.total ? b : best
  }, null)

  const tradeoffNote = recommended
    ? closerAlternativeNote(recommended, candidates, distancesById)
    : null

  return {
    baskets,
    recommendedId: recommended ? recommended.storeId : null,
    tradeoffNote,
    itemCount,
    anyComplete,
    unpricedItemNames,
  }
}

/**
 * When a store in the SAME tier as the recommendation is only slightly pricier
 * but meaningfully closer (verified straight-line distance), describe that
 * tradeoff factually. Returns null when no such store qualifies, or when
 * distances aren't available. Explicitly straight-line — not drive time/fuel.
 *
 * Thresholds (simple + explainable):
 *  - "slightly pricier": at most $5 and at most 15% more than the pick.
 *  - "substantially closer": at least 1.5 mi closer AND no more than 60% of
 *    the recommended store's distance.
 */
function closerAlternativeNote(
  recommended: StoreBasket,
  candidates: StoreBasket[],
  distancesById?: Partial<Record<StoreId, number>>
): string | null {
  if (!distancesById) return null
  const recDist = distancesById[recommended.storeId]
  if (typeof recDist !== 'number') return null

  const MAX_EXTRA_DOLLARS = 5
  const MAX_EXTRA_FRACTION = 0.15
  const MIN_CLOSER_MILES = 1.5
  const MAX_DISTANCE_FRACTION = 0.6

  let best: { store: StoreBasket; dist: number; extra: number; closer: number } | null = null
  for (const b of candidates) {
    if (b.storeId === recommended.storeId) continue
    const d = distancesById[b.storeId]
    if (typeof d !== 'number') continue
    const extra = round2(b.total - recommended.total)
    const closer = round2(recDist - d)
    const slightlyPricier =
      extra > 0 && extra <= MAX_EXTRA_DOLLARS && extra <= recommended.total * MAX_EXTRA_FRACTION
    const substantiallyCloser = closer >= MIN_CLOSER_MILES && d <= recDist * MAX_DISTANCE_FRACTION
    if (slightlyPricier && substantiallyCloser) {
      // Prefer the closest qualifying alternative.
      if (!best || d < best.dist) best = { store: b, dist: d, extra, closer }
    }
  }
  if (!best) return null

  const dollars = `$${best.extra.toFixed(2)}`
  const miles = `${best.closer.toFixed(1)} mi`
  return `${best.store.storeName} is about ${miles} closer for only ${dollars} more (straight-line distance, not drive time).`
}

/** Items that still need clarification before a definitive total can show. */
export function itemsNeedingClarification(items: GroceryItem[]): GroceryItem[] {
  // Reuse the readiness notion: anything not priceable but still a real row.
  return items.filter((it) => !isPriceable(it) && !it.ambiguous)
}

/**
 * On-demand enrichment of grocery items with Open Food Facts data.
 *
 * Rules (match the integration requirements):
 *  - Local catalog is primary. We only enrich items that are UNRECOGNIZED or
 *    explicitly flagged for lookup; recognized catalog items are left intact
 *    (OFF may fill a missing package size/barcode but never overrides name,
 *    category, brand, quantity, or unit).
 *  - Variants stay distinct. We never collapse a specific request to a
 *    generic product.
 *  - Ambiguity is preserved. When a request maps to multiple candidate
 *    products, we flag the item `ambiguous` and attach candidates for the
 *    user to choose — we never silently pick one.
 *  - Explicit brands are preserved. A brand named in the request is kept and
 *    takes precedence over any OFF brand.
 *  - OFF data is reference-only: no price, no store availability.
 */
import type { GroceryItem, ProductCandidate } from '../data/types'
import type { NormalizedOffProduct } from './offNormalize'
import {
  lookupByBarcode,
  searchByCategoryBrand,
  searchByText,
  type OffClientOptions,
} from './openFoodFacts'
import { matchAmbiguousTerm, candidatesFor } from './ambiguousTerms'

/** Max clarification choices to present (requirement: at most 4). */
const MAX_CANDIDATES = 4

/**
 * Development-only logger so we can verify in the browser console WHEN a
 * lookup happens, WHETHER it succeeds, and WHETHER it changed the item.
 * Compiled out of production builds (import.meta.env.DEV is false there).
 * Guarded so it also works in the test/node environment.
 */
const META_ENV =
  typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env?: { DEV?: boolean; MODE?: string } }).env
    : undefined
// Log in dev, but stay quiet during test runs to keep output clean.
const DEV = META_ENV?.DEV === true && META_ENV?.MODE !== 'test'

function devLog(...args: unknown[]): void {
  if (DEV) {
    // eslint-disable-next-line no-console
    console.log('[OFF enrich]', ...args)
  }
}

/** Summarize the OFF-relevant fields of an item for concise logging. */
function summarize(item: GroceryItem) {
  return {
    name: item.name,
    catalogId: item.catalogId,
    brand: item.brand,
    quantity: item.quantity,
    unit: item.unit,
    barcode: item.barcode,
    packageSize: item.packageSize,
    ambiguous: item.ambiguous,
  }
}

/**
 * Thin wrapper over the shared ambiguity rule. Returns the variant words when
 * `fragment` is only a general category (e.g. "chicken"), else null. The
 * parser is the primary place ambiguity is applied; this remains for callers
 * that want to check a raw fragment.
 */
export function detectAmbiguity(fragment: string): string[] | null {
  const def = matchAmbiguousTerm(fragment)
  return def ? def.variantWords : null
}

/** Units that mean the item is sold BY WEIGHT (not as a fixed package). */
const WEIGHT_UNITS = new Set(['lb', 'lbs', 'oz', 'kg', 'g'])

/** Merge an OFF normalized product into a (recognized) item without clobbering. */
function fillFromOff(item: GroceryItem, off: NormalizedOffProduct): GroceryItem {
  // For weight-sold items, do NOT adopt the OFF product's retail package size
  // (e.g. a 5 lb Perdue pack) — the shopper didn't request that amount. We
  // keep the barcode/brand metadata internally but leave packageSize unset so
  // the UI shows the requested weight (or "Weight not specified"), unless the
  // shopper explicitly chose a package (item.packaging set).
  const isWeightSold = WEIGHT_UNITS.has(item.unit.toLowerCase())
  const adoptPackageSize = !isWeightSold || Boolean(item.packaging)

  return {
    ...item,
    // Only fill fields that are empty — never override local recognition.
    barcode: item.barcode ?? off.barcode,
    packageSize: adoptPackageSize ? item.packageSize ?? off.packageSize : item.packageSize,
    enriched: true,
  }
}

/**
 * When the shopper specified a package size (item.packaging), prefer OFF
 * results whose package size is compatible. We DON'T drop everything else —
 * matching products float to the top, so a 12-pack request won't be silently
 * replaced by a 2 L bottle.
 */
function prioritizeByPackaging(
  results: NormalizedOffProduct[],
  packaging?: string
): NormalizedOffProduct[] {
  if (!packaging) return results
  const want = packaging.toLowerCase()
  // Extract a comparable token: pack count or a size+unit.
  const wantPack = want.match(/(\d+)\s*-?\s*pack/)?.[1]
  const wantSize = want.match(/(\d+(?:\.\d+)?)\s*(l|ml|oz|fl oz)/)?.[0]?.replace(/\s+/g, '')

  const score = (p: NormalizedOffProduct): number => {
    const ps = (p.packageSize ?? '').toLowerCase().replace(/\s+/g, '')
    if (wantPack && ps.includes(`${wantPack}x`)) return 2 // "12 x 355 ml"
    if (wantPack && ps.includes(`${wantPack}pack`)) return 2
    if (wantSize && ps.includes(wantSize)) return 2
    return 0
  }
  // Stable sort: higher score first, original order preserved otherwise.
  return results
    .map((p, i) => ({ p, i, s: score(p) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p)
}

/**
 * Build up to MAX_CANDIDATES clarification choices from OFF results, each with
 * a short distinguisher (brand / package size) so differences are visible.
 * Input is assumed already deduped by the client.
 */
function buildCandidates(results: NormalizedOffProduct[]): ProductCandidate[] {
  return results.slice(0, MAX_CANDIDATES).map((r) => {
    const parts = [r.brand, r.packageSize].filter((x): x is string => Boolean(x && x.trim()))
    return {
      catalogId: null,
      name: r.name,
      category: r.category,
      brand: r.brand,
      barcode: r.barcode,
      packaging: r.packageSize,
      source: 'off' as const,
      distinguisher: parts.join(' · ') || undefined,
    }
  })
}

/**
 * Normalize a product name for same-product comparison: lowercased, trimmed,
 * punctuation collapsed. Used to decide whether multiple OFF matches are the
 * SAME product in different package sizes vs. genuinely different variants.
 */
function productKey(name: string): string {
  let n = name.toLowerCase()
  // Drop anything after a dash/pipe/parenthesis — OFF often appends the pack
  // there, e.g. "Diet Coke - 6pk/16.9 fl oz Bottles".
  n = n.split(/[-|(]/)[0]
  // Remove trailing package/size descriptors anywhere in the string.
  n = n.replace(
    /\b\d+(\.\d+)?\s*(x|pk|pack|ct|count|l|ml|cl|oz|fl\s*oz|liter|litre|g|kg|lb|bottle|bottles|can|cans)\b/g,
    ' '
  )
  return n.replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Pick the single most common base-product key among results (the "dominant"
 * product the shopper most likely meant), with its count.
 */
function dominantProduct(results: NormalizedOffProduct[]): { key: string; count: number } {
  const counts = new Map<string, number>()
  for (const r of results) {
    const k = productKey(r.name)
    if (!k) continue
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let best = { key: '', count: 0 }
  for (const [key, count] of counts) {
    if (count > best.count) best = { key, count }
  }
  return best
}

/**
 * Results that belong to the dominant base product (same product, differing
 * package sizes), filtering out unrelated variants like "caffeine free".
 */
function sameProductResults(results: NormalizedOffProduct[]): NormalizedOffProduct[] {
  const dom = dominantProduct(results)
  if (!dom.key) return []
  return results.filter((r) => productKey(r.name) === dom.key)
}

/**
 * True when the matches are essentially the SAME product differing mainly by
 * package size (e.g. "Diet Coke" 6-pack vs 12-pack vs 2 L). Tolerant of OFF's
 * messy data: it's enough that the dominant base product has at least two
 * entries (i.e. it genuinely appears in multiple package sizes).
 */
function differsByPackageOnly(results: NormalizedOffProduct[]): boolean {
  if (results.length < 2) return false
  return dominantProduct(results).count >= 2
}

/** Apply a chosen OFF product's identity to an item (no price/availability). */
function applyOffIdentity(item: GroceryItem, off: NormalizedOffProduct): GroceryItem {
  return {
    ...item,
    name: off.name,
    brand: item.brand || off.brand, // keep an explicit shopper brand if set
    category: off.category,
    barcode: off.barcode,
    packageSize: off.packageSize,
    recognized: true,
    ambiguous: false,
    candidates: undefined,
    enriched: true,
  }
}

export interface EnrichOneOptions extends OffClientOptions {
  /** The raw text fragment this item came from, for ambiguity detection. */
  fragment: string
}

/**
 * Enrich a single item. Pure orchestration around the OFF client; the client
 * itself handles timeouts, caching, and failures (returning null/[]), so this
 * always resolves to a valid item even when OFF is unavailable.
 */
export async function enrichItem(
  item: GroceryItem,
  opts: EnrichOneOptions
): Promise<GroceryItem> {
  const { fragment, ...clientOpts } = opts

  // 1) Already-ambiguous items (flagged by the parser) are preserved as-is —
  //    never guess a specific product. No network call.
  if (item.ambiguous) {
    devLog(`ambiguous "${fragment}" — preserved for clarification (no API call)`)
    return { ...item, enriched: true }
  }

  // Defensive: if a fragment is a bare general category but somehow wasn't
  // flagged upstream, flag it here rather than letting a specific product
  // slip through. Uses the SAME shared definition as the parser/UI.
  const ambiguousDef = matchAmbiguousTerm(fragment)
  if (ambiguousDef) {
    devLog(`ambiguous request "${fragment}" → offering choices (no API call)`)
    return {
      ...item,
      catalogId: null,
      recognized: false,
      ambiguous: true,
      candidates: candidatesFor(ambiguousDef),
      enriched: true,
    }
  }

  // 2) Decide whether an OFF lookup is worthwhile (requirement: call
  //    SELECTIVELY — for branded products or unfamiliar items). A recognized,
  //    unbranded catalog staple (e.g. "bananas") needs no OFF call.
  const hasBrand = item.brand.trim().length > 0
  const shouldLookUp = hasBrand || !item.recognized
  if (!shouldLookUp) {
    devLog(`skip "${fragment}" — recognized, unbranded staple; no lookup needed`)
    return { ...item, enriched: true }
  }

  // 3) Branded items: structured category/brand search to attach a barcode /
  //    package size WITHOUT overriding local name, brand, quantity, or unit.
  if (item.recognized && hasBrand) {
    devLog(`lookup start "${fragment}" (brand="${item.brand}")`)
    const results = await searchByCategoryBrand(
      {
        brandsTag: item.brand.toLowerCase().replace(/\s+/g, '-'),
        pageSize: 1,
      },
      clientOpts
    )
    if (results.length > 0) {
      const merged = fillFromOff(item, results[0])
      const changed =
        merged.barcode !== item.barcode || merged.packageSize !== item.packageSize
      devLog(
        `lookup success "${fragment}" — ${changed ? 'enriched' : 'no new fields'}`,
        changed ? { before: summarize(item), after: summarize(merged) } : undefined
      )
      return merged
    }
    devLog(`lookup empty "${fragment}" — kept local item unchanged`)
    return { ...item, enriched: true }
  }

  // 4) Unrecognized items (incl. branded products like "Diet Coke"):
  //    full-text search Open Food Facts (search-a-licious). The original
  //    request is ALWAYS preserved — we only ever ENRICH identity on a
  //    confident single match, or ask the user to clarify on multiple
  //    matches. We never silently substitute a different variant.
  const queryText = item.sourceText ?? fragment
  devLog(`text lookup start "${queryText}"`)
  const results = await searchByText({ query: queryText, pageSize: 20 }, clientOpts)

  if (results.length === 0) {
    // Missing from OFF or API unavailable → preserve the original request.
    devLog(`text lookup empty "${queryText}" — preserved original request`)
    return { ...item, enriched: true }
  }

  // Honor a specified package size: matching products first (never silently
  // swap a 12-pack for a 2 L bottle).
  const prioritized = prioritizeByPackaging(results, item.packaging)

  // A single distinct product → enrich identity confidently.
  if (prioritized.length === 1) {
    const resolved = applyOffIdentity(item, prioritized[0])
    devLog(`text lookup single match "${queryText}" → "${resolved.name}"`, {
      before: summarize(item),
      after: summarize(resolved),
    })
    return resolved
  }

  const candidates = buildCandidates(prioritized)

  // If the shopper SPECIFIED a package size and a match clearly satisfies it,
  // honor that preference and resolve — don't ask again.
  if (item.packaging) {
    const want = item.packaging.toLowerCase()
    const wantPack = want.match(/(\d+)\s*-?\s*pack/)?.[1]
    const wantSize = want.match(/(\d+(?:\.\d+)?)\s*(l|ml|oz|fl oz)/)?.[0]?.replace(/\s+/g, '')
    const preferred = prioritized.find((p) => {
      const ps = (p.packageSize ?? '').toLowerCase().replace(/\s+/g, '')
      return (
        (wantPack && (ps.includes(`${wantPack}x`) || ps.includes(`${wantPack}pack`))) ||
        (wantSize && ps.includes(wantSize))
      )
    })
    if (preferred) {
      const resolved = applyOffIdentity(item, preferred)
      devLog(`text lookup honored package preference "${item.packaging}" → "${resolved.name}"`)
      return resolved
    }
  }

  // Same product, differing package sizes (e.g. "Diet Coke") → DEFER the
  // package choice. Keep the shopper's wording, carry candidates in state,
  // and DON'T block continuing. The size is requested later, at pricing time.
  // Candidates are limited to the dominant base product so unrelated variants
  // (e.g. "Diet Coke caffeine free") don't pollute the size choices.
  if (differsByPackageOnly(prioritized)) {
    // Only offer entries that actually have a package size — a sizeless entry
    // would render as the bare product name, repeating it uselessly.
    const sized = sameProductResults(prioritized).filter(
      (p) => p.packageSize && p.packageSize.trim()
    )
    const sameProduct = prioritizeByPackaging(sized, item.packaging)
    const packageCandidates = buildCandidates(sameProduct)
    devLog(
      `text lookup "${queryText}" → size deferred ("Size not specified"), ${packageCandidates.length} size options kept`
    )
    return {
      ...item,
      needsPackageChoice: true,
      ambiguous: false,
      candidates: packageCandidates,
      enriched: true,
    }
  }

  // Genuinely different products/variants → ask the user to clarify now
  // (this blocks continuing, like a generic "chicken").
  devLog(
    `text lookup multiple variants "${queryText}" → ${candidates.length} choices (clarify now)`,
    candidates.map((c) => `${c.name}${c.distinguisher ? ` (${c.distinguisher})` : ''}`)
  )
  return {
    ...item,
    ambiguous: true,
    candidates,
    enriched: true,
  }
}

/** Re-export for callers that only need the barcode path. */
export { lookupByBarcode }

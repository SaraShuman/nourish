/**
 * Open Food Facts normalization — pure functions that map an OFF product
 * record into the subset of our GroceryItem structure we care about.
 *
 * IMPORTANT: This module deals ONLY with product reference data (name, brand,
 * category, package size, barcode). It never produces price or availability
 * information — those belong to the separate retailer/pricing module. An OFF
 * listing is NOT evidence that a local store carries or prices the product.
 */
import type { GroceryCategory } from '../data/types'

/**
 * Minimal shape of an OFF product we consume (fields all optional). Covers
 * both the v2 product/search shape (brands as a comma string) and the
 * search-a-licious shape (brands as a string[]).
 */
export interface OffProduct {
  code?: string
  product_name?: string
  product_name_en?: string
  brands?: string | string[]
  brands_tags?: string[]
  categories_tags?: string[]
  quantity?: string
}

/** Normalized OFF result in our own terms. */
export interface NormalizedOffProduct {
  name: string
  brand: string
  category: GroceryCategory
  barcode?: string
  /** Human-readable package size, e.g. "1.5 lb" or "907 g". */
  packageSize?: string
  /** Parsed numeric quantity from the package size, when derivable. */
  quantity?: number
  /** Parsed unit from the package size, when derivable. */
  unit?: string
}

/**
 * Map OFF `categories_tags` (e.g. "en:chicken-breasts", "en:dairies") to our
 * GroceryCategory. Order matters: the most specific signal wins. Falls back to
 * 'other' so an unmapped OFF category never corrupts an item.
 */
const CATEGORY_TAG_MAP: { match: RegExp; category: GroceryCategory }[] = [
  { match: /seafood|fish|shrimp|salmon|tuna/, category: 'seafood' },
  { match: /chicken|poultry|meat|beef|pork|turkey|sausage|bacon/, category: 'meat' },
  { match: /dairy|dairies|milk|cheese|yogurt|yoghurt|butter|egg/, category: 'dairy' },
  { match: /bread|bakery|bakeries|bagel|tortilla|muffin|croissant/, category: 'bakery' },
  { match: /frozen/, category: 'frozen' },
  { match: /beverage|drink|water|soda|juice|coffee|tea/, category: 'beverages' },
  { match: /snack|chip|cracker|cookie|popcorn|nut/, category: 'snacks' },
  { match: /fruit|vegetable|produce|legume/, category: 'produce' },
  { match: /pantry|pasta|rice|cereal|sauce|oil|condiment|canned/, category: 'pantry' },
]

export function mapOffCategory(categoriesTags?: string[]): GroceryCategory {
  if (!categoriesTags || categoriesTags.length === 0) return 'other'
  // Join all tags so a specific tag anywhere in the list can match.
  const joined = categoriesTags.join(' ').toLowerCase()
  for (const { match, category } of CATEGORY_TAG_MAP) {
    if (match.test(joined)) return category
  }
  return 'other'
}

/** Known unit tokens in OFF `quantity` strings mapped to our display units. */
const OFF_UNIT_MAP: Record<string, string> = {
  g: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  mg: 'mg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml',
  cl: 'cl',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
}

/**
 * Parse an OFF `quantity` string like "1.5 lb", "907 g", "2 x 250 g" into a
 * numeric quantity + unit when possible. Returns {} when nothing parseable.
 * The raw string is always preserved separately as packageSize.
 */
export function parsePackageSize(raw?: string): { quantity?: number; unit?: string } {
  if (!raw) return {}
  const normalized = raw.toLowerCase().trim()
  // Scan all "<number> <token>" pairs and return the FIRST whose token is a
  // known unit. This skips non-unit tokens like the "x" in "2 x 250 g".
  const re = /(\d+(?:\.\d+)?)\s*([a-zµ]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(normalized)) !== null) {
    const value = parseFloat(m[1])
    const unit = OFF_UNIT_MAP[m[2]]
    if (Number.isFinite(value) && unit) return { quantity: value, unit }
  }
  return {}
}

/** Pick the best available product name from an OFF record. */
function pickName(p: OffProduct): string {
  return (p.product_name_en || p.product_name || '').trim()
}

/**
 * OFF product names sometimes bake the package/size into the title, e.g.
 * "Diet Coke - 6pk/16.9 fl oz Bottles". Split a trailing size descriptor out
 * of the name so the displayed title stays clean and the size lives in its
 * own field. Returns the (possibly unchanged) name and the extracted size, or
 * undefined when no descriptor is found.
 */
export function splitNameAndSize(rawName: string): { name: string; size?: string } {
  const name = rawName.trim()

  // Prefer a descriptor that follows a separator (dash / pipe / comma), which
  // is how OFF typically appends it: "Diet Coke - 6pk/16.9 fl oz Bottles".
  const sepMatch = name.match(/\s*[-|,]\s*(.+)$/)
  if (sepMatch) {
    const tail = sepMatch[1].trim()
    // Only treat the tail as a size if it actually looks like one (has a
    // number followed by a pack/volume unit), so we don't strip real variant
    // words like "Caffeine Free".
    if (/\d+\s*(x|pk|pack|ct|count|l|ml|cl|fl\s*oz|oz|liter|litre|g|kg|lb)\b/i.test(tail)) {
      const base = name.slice(0, name.length - sepMatch[0].length).trim()
      if (base) return { name: base, size: tail }
    }
  }

  return { name }
}

/** Pick the first brand from OFF (brands may be a comma-string or string[]). */
function pickBrand(p: OffProduct): string {
  if (Array.isArray(p.brands)) {
    const first = p.brands.find((b) => b && b.trim())
    if (first) return first.trim()
  } else if (p.brands && p.brands.trim()) {
    return p.brands.split(',')[0].trim()
  }
  if (p.brands_tags && p.brands_tags.length) {
    // tags look like "en:perdue" — strip the lang prefix and title-case.
    const tag = p.brands_tags[0].replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')
    return tag.replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return ''
}

/**
 * Normalize a raw OFF product into our terms. Returns null when the record is
 * too sparse to be useful (no name), so callers can skip it safely.
 */
export function normalizeOffProduct(p: OffProduct): NormalizedOffProduct | null {
  const rawName = pickName(p)
  if (!rawName) return null

  // Clean a package/size descriptor out of the title (keeps "Diet Coke" clean).
  const { name, size: nameSize } = splitNameAndSize(rawName)

  // Prefer OFF's explicit quantity; otherwise fall back to a size parsed out
  // of the product name.
  const packageSize =
    (p.quantity && p.quantity.trim() ? p.quantity.trim() : undefined) ?? nameSize
  const { quantity, unit } = parsePackageSize(packageSize)

  return {
    name,
    brand: pickBrand(p),
    category: mapOffCategory(p.categories_tags),
    barcode: p.code && p.code.trim() ? p.code.trim() : undefined,
    packageSize,
    quantity,
    unit,
  }
}

/**
 * Turn a raw OFF package-size string into a shopper-friendly label.
 *
 * Examples:
 *   "500 ml"               → "500 mL bottle"
 *   "20 fl. oz (591 mL)"   → "20 fl oz bottle"
 *   "6pk/16.9 fl oz Bottles" → "6-pack · 16.9 fl oz bottles"
 *   "12 x 355 ml"          → "12-pack · 355 mL"
 *   "2 L"                  → "2 L bottle"
 *
 * Rules:
 *  - Collapse duplicated unit expressions ("20 fl. oz (591 mL)") to one unit,
 *    preferring the US (oz/fl oz) form when both are present.
 *  - Normalize unit casing: mL, L, fl oz, oz.
 *  - Infer "bottle"/"bottles"/"can(s)"/"pack" ONLY when the source text says
 *    so (or a pack count is present). Never invent a container otherwise.
 *  - Returns "" for empty input so callers can fall back to the product name.
 */
export function formatPackageLabel(raw?: string): string {
  if (!raw || !raw.trim()) return ''
  const text = raw.trim()
  const lower = text.toLowerCase()

  // Container word, only if explicitly present in the source.
  let container = ''
  if (/\bbottles?\b/.test(lower)) container = /\bbottles\b/.test(lower) ? 'bottles' : 'bottle'
  else if (/\bcans?\b/.test(lower)) container = /\bcans\b/.test(lower) ? 'cans' : 'can'

  const normalizeUnit = (u: string): string => {
    const n = u.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim()
    if (n === 'ml') return 'mL'
    if (n === 'l' || n === 'liter' || n === 'litre') return 'L'
    if (n === 'fl oz' || n === 'floz') return 'fl oz'
    if (n === 'oz' || n === 'ounce' || n === 'ounces') return 'oz'
    if (n === 'g' || n === 'gram' || n === 'grams') return 'g'
    if (n === 'kg') return 'kg'
    if (n === 'lb' || n === 'lbs' || n === 'pound' || n === 'pounds') return 'lb'
    return n
  }

  // Pack count: "6pk", "6 pack", "12 x" → "6-pack".
  const packMatch = lower.match(/(\d+)\s*(?:x\b|pk\b|pack\b|ct\b|count\b)/)
  const packLabel = packMatch ? `${packMatch[1]}-pack` : ''

  // Find a per-unit size. Prefer an oz/fl oz expression; else the first
  // number+unit pair. This collapses "20 fl. oz (591 mL)" to "20 fl oz".
  const ozMatch = lower.match(/(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz)\b/)
  const anyMatch = lower.match(/(\d+(?:\.\d+)?)\s*(ml|cl|l|liter|litre|fl\.?\s*oz|oz|g|kg|lb)\b/)
  // When a pack is present, the unit size usually follows it; skip the pack's
  // own count by searching after the pack match.
  let sizeLabel = ''
  const sizeSource = ozMatch ?? anyMatch
  if (sizeSource) {
    sizeLabel = `${sizeSource[1]} ${normalizeUnit(sizeSource[2])}`
  }

  // Assemble.
  if (packLabel && sizeLabel) {
    const tail = container ? `${sizeLabel} ${container}` : sizeLabel
    return `${packLabel} · ${tail}`
  }
  if (packLabel) return packLabel
  if (sizeLabel) return container ? `${sizeLabel} ${container}` : sizeLabel

  // No parseable size — return the cleaned original rather than inventing one.
  return text
}

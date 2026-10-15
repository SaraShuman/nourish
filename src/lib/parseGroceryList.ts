import type { GroceryItem } from '../data/types'
import { GROCERY_CATALOG } from '../data/groceryCatalog'
import { matchAmbiguousTerm, candidatesFor, brandsForAmbiguousTerm } from './ambiguousTerms'
import { matchBrandedProduct } from './brandedProducts'
import { detectPastaShape, pastaDisplayName } from './pastaType'
import { segmentFragment } from './segmentFragment'

/**
 * Deterministic parser: turns a free-text grocery request into structured
 * GroceryItem rows.
 *
 * Guarantees:
 * - Quantities and recognized brands are preserved.
 * - Unrecognized fragments are KEPT (recognized: false), never dropped.
 * - No pricing or retailer logic — recognition only.
 */

/** Known unit tokens the parser recognizes in free text. */
const UNIT_TOKENS: Record<string, string> = {
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  gal: 'gal', gallon: 'gal', gallons: 'gal',
  qt: 'qt', quart: 'qt', quarts: 'qt',
  dozen: 'dozen', doz: 'dozen',
  bunch: 'bunch', bunches: 'bunch',
  box: 'box', boxes: 'box',
  bag: 'bag', bags: 'bag',
  can: 'can', cans: 'can',
  jar: 'jar', jars: 'jar',
  bottle: 'bottle', bottles: 'bottle',
  loaf: 'loaf', loaves: 'loaf',
  pack: 'pack', packs: 'pack', package: 'pack',
  each: 'each', ea: 'each',
  head: 'head', heads: 'head',
  pint: 'pint', pints: 'pint',
  container: 'container',
  stick: 'stick', sticks: 'stick',
  bulb: 'bulb',
  carton: 'carton',
  case: 'case',
}

/** Simple id generator for list rows (unique enough for a session). */
let rowCounter = 0
function makeRowId(): string {
  rowCounter += 1
  return `row-${Date.now().toString(36)}-${rowCounter}`
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s./-]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Conversational lead-ins people say when dictating a list ("I need…",
 * "get me…", "can you add…"). These are framing, NOT grocery items, so we
 * strip a LEADING carrier phrase before parsing. Ordered longest-first so the
 * most specific phrase is removed. Only stripped from the START of a fragment
 * (never mid-item), so real products are never touched.
 */
const CARRIER_PHRASES = [
  'can you please add',
  'can you please get me',
  'can you add',
  'can you get me',
  'could you add',
  'could you get me',
  "i'd like to get",
  "i'd like to buy",
  "i'd like",
  'i would like',
  'i want to get',
  'i want to buy',
  'i need to get',
  'i need to buy',
  'i need',
  'i want',
  'please add',
  'please get',
  'get me',
  'grab me',
  'grab',
  'buy',
  'add',
].sort((a, b) => b.length - a.length)

/**
 * Remove a leading carrier phrase from a fragment, if present. Returns the
 * remainder (trimmed). Removes at most one lead-in, from the start only.
 */
function stripCarrierPhrase(fragment: string): string {
  const lead = fragment.replace(/^[\s,]+/, '')
  const lower = lead.toLowerCase()
  for (const phrase of CARRIER_PHRASES) {
    // Match the phrase only as a whole-word prefix followed by a space, so
    // "add" never clips "additional" and "buy" never clips a product word.
    if (lower.startsWith(phrase + ' ')) {
      return lead.slice(phrase.length).trim()
    }
  }
  return lead
}

/**
 * True when a fragment carries no groceryable content — only filler/stopwords
 * (e.g. a stray "I", "need", "um" left over from dictation). Such fragments
 * are dropped. A fragment with ANY non-filler word, digit, or unit is kept, so
 * real (even unrecognized) items are never discarded.
 */
const FILLER_WORDS = new Set([
  'i', 'a', 'an', 'the', 'some', 'need', 'want', 'get', 'me', 'please', 'add',
  'buy', 'grab', 'to', 'of', 'for', 'my', 'would', 'like', 'can', 'you',
  'could', 'um', 'uh', 'okay', 'ok', 'so', 'and', 'also', 'then', 'just',
])
function isFillerOnly(fragment: string): boolean {
  const norm = normalize(fragment)
  if (!norm) return true
  const tokens = norm.split(' ').filter(Boolean)
  // Any digit means there's a quantity worth keeping.
  if (tokens.some((t) => /\d/.test(t))) return false
  return tokens.every((t) => FILLER_WORDS.has(t))
}

/** Singularize a token for alias matching (bananas -> banana). */
function singularize(word: string): string {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.endsWith('es') && word.length > 3) return word.slice(0, -2)
  if (word.endsWith('s') && word.length > 2) return word.slice(0, -1)
  return word
}

/**
 * Build a flat list of (searchText -> catalog item) entries, longest first,
 * so multi-word names ("chicken breast") match before single words ("chicken").
 */
const MATCH_ENTRIES = GROCERY_CATALOG.flatMap((item) => {
  const names = [item.canonicalName.toLowerCase(), ...item.aliases.map((a) => a.toLowerCase())]
  return names.map((name) => ({ name, item }))
}).sort((a, b) => b.name.length - a.name.length)

/** Attempt to match a text fragment to a catalog item. */
function matchCatalog(fragment: string) {
  const norm = normalize(fragment)
  const normSingular = norm.split(' ').map(singularize).join(' ')

  for (const entry of MATCH_ENTRIES) {
    const nameSingular = entry.name.split(' ').map(singularize).join(' ')
    // Word-boundary containment on the singularized forms.
    if (
      norm.includes(entry.name) ||
      normSingular.includes(nameSingular)
    ) {
      return entry.item
    }
  }
  return null
}

/** Find a recognized brand mentioned in the fragment for a given item. */
function matchBrand(fragment: string, brands: string[]): string {
  const norm = normalize(fragment)
  for (const brand of brands) {
    if (norm.includes(normalize(brand))) return brand
  }
  return ''
}

/** Remove a whole word/phrase (case-insensitive) from text, tidy whitespace. */
function stripWord(text: string, word: string): string {
  const w = normalize(word)
  if (!w) return text
  return normalize(text)
    .split(' ')
    .filter((t) => !w.split(' ').includes(t))
    .join(' ')
    .trim()
}

/** Extract a leading or standalone quantity and a unit token from a fragment. */
/**
 * Extract a PACKAGE CONFIGURATION from a fragment, e.g. "12-pack",
 * "2-liter", "2 l", "6 pack", "500 ml bottle". This is distinct from the
 * purchase quantity: "12-pack" is ONE package of 12, not quantity 12.
 *
 * Returns a human-readable packaging label and the fragment with the matched
 * packaging text removed, so downstream quantity/unit/name parsing isn't
 * confused by it.
 */
function extractPackaging(fragment: string): { packaging: string | null; remainder: string } {
  let working = ` ${fragment.toLowerCase()} `
  let packaging: string | null = null

  // N-pack / N pack / N count  → "N-pack"
  const packMatch = working.match(/\b(\d+)\s*[- ]?\s*(pack|pk|count|ct)\b/)
  if (packMatch) {
    packaging = `${packMatch[1]}-pack`
    working = working.replace(packMatch[0], ' ')
  }

  // N-liter / N liter / N l / N ml / N oz bottle etc. → "N <unit>"
  const sizeMatch = working.match(/\b(\d+(?:\.\d+)?)\s*[- ]?\s*(liter|litre|l|ml|fl\s?oz|oz)\b/)
  if (sizeMatch) {
    const value = sizeMatch[1]
    const rawUnit = sizeMatch[2].replace(/\s+/g, ' ')
    const unitLabel =
      /^l|liter|litre$/.test(rawUnit) ? 'L' : rawUnit === 'ml' ? 'mL' : rawUnit.replace('fl oz', 'fl oz')
    const sizeLabel = `${value} ${unitLabel}`
    packaging = packaging ? `${packaging}, ${sizeLabel}` : sizeLabel
    working = working.replace(sizeMatch[0], ' ')
  }

  // "bottle" / "can" as a standalone container word, kept as packaging hint.
  const containerMatch = working.match(/\b(bottle|bottles|can|cans)\b/)
  if (containerMatch) {
    const container = containerMatch[1].replace(/s$/, '')
    packaging = packaging ? `${packaging} ${container}` : container
    working = working.replace(containerMatch[0], ' ')
  }

  const remainder = working.replace(/\s+/g, ' ').trim()
  return { packaging, remainder: remainder || fragment.trim() }
}

/**
 * Spoken number words → values, so dictated quantities aren't lost
 * ("two bananas" → qty 2). "a"/"an" count as 1 only when they lead the
 * fragment (so they don't swallow articles mid-phrase). Kept intentionally
 * small — single words zero through twelve plus a couple of common ones.
 */
const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
}

function extractQuantityAndUnit(fragment: string): {
  quantity: number | null
  unit: string | null
  remainder: string
} {
  const tokens = normalize(fragment).split(' ')
  let quantity: number | null = null
  let unit: string | null = null
  const remaining: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    // Numeric quantity (supports decimals like 1.5)
    if (quantity === null && /^\d+(\.\d+)?$/.test(token)) {
      quantity = parseFloat(token)
      continue
    }
    // Spoken number word ("two"). "a"/"an" only count as a quantity when they
    // lead the fragment, to avoid misreading an article mid-phrase.
    if (quantity === null && WORD_NUMBERS[token] !== undefined) {
      const isArticle = token === 'a' || token === 'an'
      if (!isArticle || i === 0) {
        quantity = WORD_NUMBERS[token]
        continue
      }
    }
    // Unit token
    if (unit === null && UNIT_TOKENS[token]) {
      unit = UNIT_TOKENS[token]
      continue
    }
    remaining.push(token)
  }

  return { quantity, unit, remainder: remaining.join(' ').trim() }
}

/**
 * Split raw input into fragments on commas, newlines, semicolons, and "and".
 * Each resulting (delimiter-free) fragment is then run through the voice
 * segmenter, which recovers item boundaries from a punctuation-free run like
 * "bananas eggs chicken breast pasta sauce". The segmenter returns the
 * fragment unchanged when it isn't a multi-item run, so typed single items and
 * comma/line-break lists behave exactly as before.
 */
function splitFragments(raw: string): string[] {
  return raw
    .split(/[,;\n]|\band\b/i)
    .map((f) => f.trim())
    .filter((f) => f.length > 0)
    // Strip a dictation lead-in ("I need …") before segmenting so it never
    // becomes an item, and drop fragments that are only filler/stopwords.
    .map((f) => stripCarrierPhrase(f))
    .filter((f) => f.length > 0 && !isFillerOnly(f))
    .flatMap((f) => segmentFragment(f))
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && !isFillerOnly(f))
}

/**
 * Parse a raw grocery request into structured items.
 * Returns [] for empty/whitespace input.
 */
export function parseGroceryList(raw: string): GroceryItem[] {
  if (!raw || !raw.trim()) return []

  const fragments = splitFragments(raw)
  const items: GroceryItem[] = []

  for (const fragment of fragments) {
    // Pull out any package configuration ("12-pack", "2-liter") FIRST so it
    // doesn't get read as a purchase quantity, and so it doesn't confuse name
    // matching. packaging is kept separate from quantity (req: config != qty).
    const { packaging, remainder: afterPackaging } = extractPackaging(fragment)
    const { quantity, unit, remainder } = extractQuantityAndUnit(afterPackaging)
    // Did the shopper actually state an amount? (Drives "Weight not specified"
    // and keeps a defaulted quantity from reading as a requested amount.)
    const quantitySpecified = quantity !== null

    // Ambiguous general category (e.g. "chicken" with no cut word): do NOT
    // silently specialize. Keep the shopper's original word as the name and
    // flag it for clarification. Quantity/unit are still captured.
    const ambiguous = matchAmbiguousTerm(fragment)
    if (ambiguous) {
      // Preserve a brand the shopper named (e.g. "Perdue chicken") even though
      // the specific cut is still unresolved. The brand carries through the
      // clarification so it isn't silently lost.
      const brand = matchBrand(afterPackaging, brandsForAmbiguousTerm(ambiguous))
      // Display name is the category word (e.g. "Chicken"); the brand lives in
      // its own field, as it does for recognized items. Strip the brand word
      // from the shown name so it doesn't duplicate the brand.
      const withoutBrand = brand ? stripWord(remainder, brand) : remainder
      const original = (withoutBrand || ambiguous.bare).trim()
      items.push({
        id: makeRowId(),
        catalogId: null,
        name: original.replace(/\b\w/g, (c) => c.toUpperCase()),
        quantity: quantity ?? 1,
        quantitySpecified,
        unit: unit ?? 'each',
        brand,
        category: ambiguous.category,
        recognized: false,
        ambiguous: true,
        candidates: candidatesFor(ambiguous),
        emoji: ambiguous.emoji,
        packaging: packaging ?? undefined,
        sourceText: fragment.trim(),
      })
      continue
    }

    // Known branded product (e.g. "Diet Coke", "Coca-Cola Zero Sugar"): keep
    // the shopper's exact words and defer identity to OFF enrichment. This
    // also prevents a short generic alias (e.g. "sugar") from mis-matching
    // inside a branded phrase.
    const branded = matchBrandedProduct(afterPackaging)
    if (branded) {
      const displayName = (remainder || afterPackaging).trim()
      items.push({
        id: makeRowId(),
        catalogId: null,
        name: displayName.replace(/\b\w/g, (c) => c.toUpperCase()),
        quantity: quantity ?? 1,
        quantitySpecified,
        unit: unit ?? 'each',
        brand: '',
        category: branded.category,
        recognized: false,
        emoji: branded.emoji,
        packaging: packaging ?? undefined,
        sourceText: fragment.trim(),
      })
      continue
    }

    const catalogItem = matchCatalog(afterPackaging)

    if (catalogItem) {
      const brand = matchBrand(afterPackaging, catalogItem.brands)
      // Use a recognized unit if present and valid for this item; otherwise default.
      const resolvedUnit =
        unit && catalogItem.units.includes(unit) ? unit : catalogItem.defaultUnit

      // Preserve a specific pasta SHAPE the shopper named (e.g. "penne",
      // "barilla spaghetti"). Generic "pasta"/"noodles" stays "Any type".
      const pastaType =
        catalogItem.id === 'pasta' ? detectPastaShape(afterPackaging) : undefined
      const displayName =
        catalogItem.id === 'pasta' ? pastaDisplayName(pastaType) : catalogItem.canonicalName

      items.push({
        id: makeRowId(),
        catalogId: catalogItem.id,
        name: displayName,
        quantity: quantity ?? 1,
        quantitySpecified,
        unit: resolvedUnit,
        brand,
        category: catalogItem.category,
        recognized: true,
        packaging: packaging ?? undefined,
        pastaType,
        sourceText: fragment.trim(),
      })
    } else {
      // Unrecognized — keep the cleaned text for user review, never drop it.
      const displayName = remainder || normalize(afterPackaging)
      if (!displayName) continue
      items.push({
        id: makeRowId(),
        catalogId: null,
        name: displayName.replace(/\b\w/g, (c) => c.toUpperCase()),
        quantity: quantity ?? 1,
        quantitySpecified,
        unit: unit ?? 'each',
        brand: '',
        category: 'other',
        recognized: false,
        packaging: packaging ?? undefined,
        sourceText: fragment.trim(),
      })
    }
  }

  return dedupeExact(items)
}

/**
 * Drop EXACT duplicate items (e.g. speech double-emitting "bananas bananas"),
 * keeping the first occurrence. Two items are "exact" only when they resolve
 * to the same product identity AND share every distinguishing detail —
 * quantity, unit, brand, packaging, and pasta shape. This never merges items
 * the shopper meaningfully differentiated (e.g. "chicken breast 2 lb" and
 * "chicken breast 1 lb", or "penne" and "rigatoni").
 */
function dedupeExact(items: GroceryItem[]): GroceryItem[] {
  const seen = new Set<string>()
  const out: GroceryItem[] = []
  for (const it of items) {
    const identity = it.catalogId ?? `name:${normalize(it.name)}`
    const key = [
      identity,
      it.brand.trim().toLowerCase(),
      it.pastaType ?? '',
      it.unit,
      it.quantity,
      it.quantitySpecified ? '1' : '0',
      it.packaging ?? '',
    ].join('|')
    if (seen.has(key)) continue // exact repeat → ignore
    seen.add(key)
    out.push(it)
  }
  return out
}

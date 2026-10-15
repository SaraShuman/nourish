/**
 * Punctuation-free item segmentation for voice transcripts.
 *
 * Speech-to-text often returns a run of items with no commas, e.g.
 * "bananas eggs chicken breast pasta sauce". The main parser splits on
 * delimiters (commas/newlines/"and"); this helper recovers item boundaries
 * from a DELIMITER-FREE run using the same recognition signals the parser
 * already trusts: known catalog products (incl. multiword names like
 * "chicken breast"), branded phrases ("coke zero"), ambiguous categories
 * ("chicken"), pasta shapes, and attached quantities/units.
 *
 * Guarantees:
 *  - Multiword products stay intact ("chicken breast", "pasta sauce").
 *  - A quantity/unit or brand word adjacent to a product travels with it
 *    ("2 lb chicken", "Perdue chicken thighs", "12-pack Diet Coke").
 *  - Nothing is discarded: tokens that match no product are preserved as their
 *    own fragment (for Review-screen clarification) rather than dropped.
 *  - Returns the ORIGINAL fragment unchanged (single-element array) unless it
 *    finds TWO OR MORE recognized products — so typed input, single items, and
 *    comma/line-break lists behave exactly as before.
 */
import { GROCERY_CATALOG } from '../data/groceryCatalog'
import { BRANDED_PRODUCT_HINTS } from './brandedProducts'
import { AMBIGUOUS_TERMS } from './ambiguousTerms'
import { PASTA_SHAPES } from './pastaType'

/** A recognizable phrase, expressed as its lowercase word tokens. */
interface Phrase {
  tokens: string[]
}

/**
 * All phrases the segmenter recognizes, built once from the same sources the
 * parser uses, sorted longest-first (by token count) so multiword names win
 * over their single-word prefixes ("chicken breast" before "chicken").
 */
const PHRASES: Phrase[] = buildPhrases()

function buildPhrases(): Phrase[] {
  const raw = new Set<string>()
  for (const item of GROCERY_CATALOG) {
    raw.add(item.canonicalName.toLowerCase())
    for (const a of item.aliases) raw.add(a.toLowerCase())
  }
  for (const h of BRANDED_PRODUCT_HINTS) raw.add(h.phrase.toLowerCase())
  for (const t of AMBIGUOUS_TERMS) raw.add(t.bare.toLowerCase())
  for (const s of PASTA_SHAPES) for (const a of s.aliases) raw.add(a.toLowerCase())

  return [...raw]
    .map((p) => ({ tokens: lowerTokens(p) }))
    .filter((p) => p.tokens.length > 0)
    .sort((a, b) => b.tokens.length - a.tokens.length)
}

/** Lowercased word tokens, used for phrase definitions. */
function lowerTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/**
 * Split the ORIGINAL fragment into whitespace tokens, preserving each token's
 * exact text (so "12-pack" and "2-liter" survive intact) alongside a lowercase
 * form for matching.
 */
function splitTokens(fragment: string): { raw: string; lc: string }[] {
  return fragment
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, lc: raw.toLowerCase() }))
}

/** Loose word match: exact, or equal after trimming a trailing plural "s". */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true
  return a.replace(/s$/, '') === b.replace(/s$/, '')
}

/** Longest phrase matching at position `i`; returns its token length or 0. */
function matchPhraseLen(tokens: { lc: string }[], i: number): number {
  for (const phrase of PHRASES) {
    const n = phrase.tokens.length
    if (i + n > tokens.length) continue
    let ok = true
    for (let k = 0; k < n; k++) {
      if (!wordsMatch(tokens[i + k].lc, phrase.tokens[k])) {
        ok = false
        break
      }
    }
    if (ok) return n
  }
  return 0
}

/** Unit words that can attach to an adjacent product. */
const UNIT_WORDS = new Set([
  'lb', 'lbs', 'pound', 'pounds', 'oz', 'ounce', 'ounces', 'gal', 'gallon', 'gallons',
  'qt', 'quart', 'quarts', 'dozen', 'doz', 'bunch', 'bunches', 'box', 'boxes', 'bag', 'bags',
  'can', 'cans', 'jar', 'jars', 'bottle', 'bottles', 'loaf', 'loaves', 'pack', 'packs',
  'package', 'each', 'ea', 'head', 'heads', 'pint', 'pints', 'container', 'stick', 'sticks',
  'bulb', 'carton', 'case',
])

/** Spoken number words that act as a quantity (mirrors the parser). */
const NUMBER_WORDS = new Set([
  'a', 'an', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
])

function isNumber(lc: string): boolean {
  return /^\d+(\.\d+)?$/.test(lc)
}
function isQtyOrUnit(lc: string): boolean {
  return isNumber(lc) || NUMBER_WORDS.has(lc) || UNIT_WORDS.has(lc)
}

/**
 * Segment a single delimiter-free fragment into item sub-fragments.
 *
 * Walks tokens left to right:
 *  - A leading run of quantity/unit tokens is held and attached to the NEXT
 *    recognized product ("2 lb chicken breast").
 *  - A recognized product (longest, multiword-aware match) starts a new item;
 *    a quantity/unit run immediately AFTER it attaches too ("milk 2 gal").
 *  - Any other unrecognized token is buffered and, at the next product boundary
 *    (or end), emitted as its OWN item so it's preserved for clarification
 *    rather than silently dropped.
 *
 * Returns the original fragment unchanged unless it finds two or more
 * recognized products, so single/typed items are never altered.
 */
export function segmentFragment(fragment: string): string[] {
  const original = fragment.trim()
  const tokens = splitTokens(original)
  if (tokens.length < 2) return [original]

  // First pass: how many recognized products are there? If fewer than two,
  // leave the fragment exactly as produced (no re-splitting).
  let productCount = 0
  for (let i = 0; i < tokens.length; ) {
    const len = matchPhraseLen(tokens, i)
    if (len > 0) {
      productCount++
      i += len
    } else {
      i++
    }
  }
  if (productCount < 2) return [original]

  const items: string[] = []
  let buffer: number[] = [] // indexes of unrecognized tokens, never dropped
  let pendingQty: number[] = [] // leading qty/unit indexes awaiting a product

  const flushBuffer = () => {
    if (buffer.length) {
      items.push(buffer.map((idx) => tokens[idx].raw).join(' '))
      buffer = []
    }
  }

  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]

    if (isQtyOrUnit(t.lc)) {
      pendingQty.push(i)
      i++
      continue
    }

    const len = matchPhraseLen(tokens, i)
    if (len > 0) {
      // New product → close any pending unrecognized run first.
      flushBuffer()
      const spanStart = i
      i += len
      // Absorb a trailing quantity/unit run ("chicken breast 2 lb"), but DON'T
      // steal a bare number that actually leads the NEXT product
      // ("apples two bananas" → "two" belongs to bananas, not apples).
      const trailing: number[] = []
      while (i < tokens.length && isQtyOrUnit(tokens[i].lc)) {
        const isBareNumber = isNumber(tokens[i].lc) || NUMBER_WORDS.has(tokens[i].lc)
        const nextStartsProduct = matchPhraseLen(tokens, i + 1) > 0
        if (isBareNumber && nextStartsProduct) break // leave it for the next item
        trailing.push(i)
        i++
      }
      const indexes = [...pendingQty, ...range(spanStart, spanStart + len), ...trailing]
      pendingQty = []
      items.push(indexes.map((idx) => tokens[idx].raw).join(' '))
      continue
    }

    // Unrecognized word: strand any pending qty into the buffer so a stray
    // number/unit is never lost, then buffer this word.
    if (pendingQty.length) {
      buffer.push(...pendingQty)
      pendingQty = []
    }
    buffer.push(i)
    i++
  }

  // Trailing leftovers: a dangling qty with no product, then any buffer.
  if (pendingQty.length) buffer.push(...pendingQty)
  flushBuffer()

  return items.map((s) => s.trim()).filter(Boolean)
}

/** [start, end) as an index array. */
function range(start: number, end: number): number[] {
  const out: number[] = []
  for (let k = start; k < end; k++) out.push(k)
  return out
}

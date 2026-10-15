/**
 * Known branded product phrases that the LOCAL parser must not resolve to a
 * generic catalog item. These are specific commercial products best looked up
 * in Open Food Facts (e.g. "Diet Coke", "Coca-Cola Zero Sugar"). Keeping them
 * out of local generic matching prevents bugs like "Coca-Cola Zero Sugar"
 * matching the generic "sugar" entry.
 *
 * This is a RECOGNITION HINT list (phrases + the food category they belong to
 * for icon/÷fallback purposes), not a product database. Actual product
 * identity still comes from OFF. Match is case-insensitive substring.
 */
import type { GroceryCategory } from '../data/types'

export interface BrandedProductHint {
  /** Lowercase phrase to detect in the fragment. */
  phrase: string
  /** Food category for icon/category fallback until OFF resolves identity. */
  category: GroceryCategory
  /** Emoji override so the icon matches the product. */
  emoji?: string
}

/**
 * Ordered longest-phrase-first so a more specific phrase ("coca-cola zero
 * sugar") is detected before a shorter one ("coke").
 */
const HINTS: BrandedProductHint[] = [
  { phrase: 'coca-cola zero sugar', category: 'beverages', emoji: '🥤' },
  { phrase: 'coca cola zero sugar', category: 'beverages', emoji: '🥤' },
  { phrase: 'coke zero sugar', category: 'beverages', emoji: '🥤' },
  { phrase: 'diet coke', category: 'beverages', emoji: '🥤' },
  { phrase: 'coke zero', category: 'beverages', emoji: '🥤' },
  { phrase: 'coca-cola zero', category: 'beverages', emoji: '🥤' },
  { phrase: 'cheerios', category: 'pantry', emoji: '🥣' },
]

export const BRANDED_PRODUCT_HINTS: BrandedProductHint[] = [...HINTS].sort(
  (a, b) => b.phrase.length - a.phrase.length
)

/** Return the branded hint for a fragment, or null. */
export function matchBrandedProduct(fragment: string): BrandedProductHint | null {
  const norm = fragment.toLowerCase()
  for (const hint of BRANDED_PRODUCT_HINTS) {
    if (norm.includes(hint.phrase)) return hint
  }
  return null
}

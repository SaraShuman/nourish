/**
 * Shared definition of ambiguous general grocery categories.
 *
 * A "general category" is a word the shopper might say that does NOT name a
 * specific product (e.g. "chicken"). When a request is only a general
 * category, Nourish must NOT silently pick a specific product — it keeps the
 * item ambiguous and asks the shopper to clarify.
 *
 * Single source of truth used by:
 *   - the parser (to flag ambiguity instead of specializing),
 *   - the enrichment layer (to avoid guessing / network calls),
 *   - the Review List card (to render inline clarification choices).
 */
import type { GroceryCategory, ProductCandidate } from '../data/types'
import { CATALOG_BY_ID } from '../data/groceryCatalog'

export interface AmbiguousTermDef {
  /** The bare term, lowercase, e.g. "chicken". */
  bare: string
  /** Grocery category the resolved choices belong to. */
  category: GroceryCategory
  /**
   * Emoji to show for the still-ambiguous item, so the icon matches the
   * requested food (e.g. 🍗 for chicken) rather than the generic category
   * emoji (🥩 for meat).
   */
  emoji: string
  /**
   * Words that, when present alongside the bare term, make the request
   * SPECIFIC (not ambiguous), e.g. "breast", "thighs", "whole".
   */
  variantWords: string[]
  /** The clarification choices offered to the shopper. */
  choices: {
    catalogId: string | null
    name: string
  }[]
}

export const AMBIGUOUS_TERMS: AmbiguousTermDef[] = [
  {
    bare: 'chicken',
    category: 'meat',
    emoji: '🍗',
    variantWords: [
      'breast',
      'thigh',
      'thighs',
      'wing',
      'wings',
      'leg',
      'legs',
      'drumstick',
      'drumsticks',
      'whole',
      'ground',
      'mince',
      'roasting',
      'roaster',
      'fryer',
    ],
    choices: [
      { catalogId: 'chicken-breast', name: 'Chicken Breast' },
      { catalogId: 'chicken-thighs', name: 'Chicken Thighs' },
      { catalogId: 'chicken-wings', name: 'Chicken Wings' },
      { catalogId: 'whole-chicken', name: 'Whole Chicken' },
      // "Other" keeps the item generic/unrecognized for the shopper to type.
      { catalogId: null, name: 'Other' },
    ],
  },
]

/**
 * If `fragment` is only a general category (bare term present, no variant
 * word), return its definition. Otherwise null (specific or unrelated).
 */
export function matchAmbiguousTerm(fragment: string): AmbiguousTermDef | null {
  const norm = fragment.toLowerCase()
  for (const def of AMBIGUOUS_TERMS) {
    if (!norm.includes(def.bare)) continue
    const isSpecific = def.variantWords.some((w) => norm.includes(w))
    if (!isSpecific) return def
  }
  return null
}

/** Build ProductCandidate rows for a given ambiguous term definition. */
export function candidatesFor(def: AmbiguousTermDef): ProductCandidate[] {
  return def.choices.map((c) => ({
    catalogId: c.catalogId,
    name: c.name,
    category: def.category,
    brand: '',
    source: 'catalog' as const,
  }))
}

/**
 * The set of brands associated with an ambiguous term's choices, so the parser
 * can preserve a brand the shopper named (e.g. "Perdue chicken") even while the
 * specific cut is still unresolved. Deduplicated, order-stable.
 */
export function brandsForAmbiguousTerm(def: AmbiguousTermDef): string[] {
  const brands = new Set<string>()
  for (const choice of def.choices) {
    if (!choice.catalogId) continue
    const item = CATALOG_BY_ID[choice.catalogId]
    if (item) for (const b of item.brands) brands.add(b)
  }
  return [...brands]
}

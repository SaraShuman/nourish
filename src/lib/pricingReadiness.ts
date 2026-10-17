/**
 * Pricing-readiness selectors.
 *
 * Nourish defers non-essential clarification until it actually matters for
 * pricing (Screen 4, Compare). These pure helpers describe what still needs
 * resolving, WITHOUT choosing anything on the shopper's behalf.
 *
 * - Generic/ambiguous items ("chicken") MUST be clarified before pricing and
 *   block continuing from the Review List.
 * - Items that merely lack a package size ("Diet Coke") are allowed through;
 *   the size is requested just-in-time on Compare using real store pricing
 *   data — never a preselected Open Food Facts result.
 */
import type { GroceryItem } from '../data/types'

/** A generic/ambiguous item still needs a product choice before pricing. */
export function isGenericAmbiguous(item: GroceryItem): boolean {
  return item.ambiguous === true
}

/** An identified product whose package size is deferred (not yet chosen). */
export function needsPackageChoice(item: GroceryItem): boolean {
  return item.needsPackageChoice === true && item.ambiguous !== true
}

/** Units that mean the item is sold by weight. */
const WEIGHT_UNITS = new Set(['lb', 'lbs', 'oz', 'kg', 'g'])

/**
 * A weight-sold item for which the shopper never stated an amount. We now
 * treat the default (1 of the item's unit) as a SUGGESTED, editable quantity
 * rather than a blocker — the item is priced on the suggestion and labeled
 * "Suggested" until the shopper adjusts it. Kept for display/styling only; it
 * no longer prevents pricing.
 */
export function needsWeightChoice(item: GroceryItem): boolean {
  return (
    item.ambiguous !== true &&
    item.quantitySpecified !== true &&
    WEIGHT_UNITS.has(item.unit.toLowerCase())
  )
}

/**
 * Whether the item's quantity is a SUGGESTED default (the shopper didn't state
 * an amount) rather than one they explicitly entered. Used to label rows
 * "Suggested · 1 lb" / "Suggested · 1 package". Ambiguous items are excluded
 * (they need a product choice first, not a quantity suggestion).
 */
export function isSuggestedQuantity(item: GroceryItem): boolean {
  return item.ambiguous !== true && item.quantitySpecified !== true
}

/**
 * Items that must be clarified BEFORE leaving the Review List. Only generic
 * ambiguity blocks; a deferred package size does not.
 */
export function itemsBlockingContinue(items: GroceryItem[]): GroceryItem[] {
  return items.filter(isGenericAmbiguous)
}

/**
 * Items whose package size OR unspecified weight will need to be chosen at
 * pricing time (Screen 4). Prepared for just-in-time clarification.
 */
export function itemsNeedingPackageChoice(items: GroceryItem[]): GroceryItem[] {
  return items.filter((it) => needsPackageChoice(it) || needsWeightChoice(it))
}

/**
 * Whether an item is ready to be priced right now. A generically ambiguous
 * item (needs a product choice) and a deferred package choice still block, but
 * an unspecified WEIGHT no longer does — we price it on the suggested default
 * (1 of its unit) and simply label it "Suggested" so nothing shows $0.00.
 */
export function isPriceable(item: GroceryItem): boolean {
  return !isGenericAmbiguous(item) && !needsPackageChoice(item)
}

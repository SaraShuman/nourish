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
 * A weight-sold item for which the shopper never stated an amount. The weight
 * is deferred (clarified at Compare), and we must not treat the default
 * quantity as requested. Does NOT block continuing.
 */
export function needsWeightChoice(item: GroceryItem): boolean {
  return (
    item.ambiguous !== true &&
    item.quantitySpecified !== true &&
    WEIGHT_UNITS.has(item.unit.toLowerCase())
  )
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
 * Whether an item is ready to be priced definitively right now: not
 * generically ambiguous, no deferred package choice, and (for weight-sold
 * items) a weight the shopper actually specified.
 */
export function isPriceable(item: GroceryItem): boolean {
  return !isGenericAmbiguous(item) && !needsPackageChoice(item) && !needsWeightChoice(item)
}

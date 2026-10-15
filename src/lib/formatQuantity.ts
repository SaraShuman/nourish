/**
 * Format a line-item quantity + unit for display in price breakdowns and
 * shopping lists.
 *
 * Rule:
 *  - A bare count ("each") renders as "× N" — these ARE individual items, so a
 *    multiplier reads naturally (e.g. "× 2").
 *  - Any other unit (weight, volume, or packaging like lb / oz / dozen / bag)
 *    renders as "N unit" (e.g. "2 lb", "1 dozen", "1 bag"). Showing "× 2" for
 *    a weight implies two separate items, which is wrong.
 *
 * The shopper's originally parsed unit is preserved and used verbatim.
 */
export function formatQuantity(quantity: number, unit: string): string {
  const u = (unit ?? '').trim()
  if (!u || u.toLowerCase() === 'each') {
    return `× ${quantity}`
  }
  return `${quantity} ${u}`
}

/**
 * Format a straight-line distance in miles for display.
 *  - A positive distance below 0.1 mi reads "Under 0.1 mi" (never "0.0 mi",
 *    which looks like the store is exactly at the shopper's point).
 *  - 0.1 mi and up rounds to one decimal, e.g. "1.3 mi".
 * Returns null when there's no usable distance so callers can omit the label.
 */
export function formatDistance(distanceMiles: number | undefined): string | null {
  if (distanceMiles === undefined || !Number.isFinite(distanceMiles) || distanceMiles < 0) {
    return null
  }
  if (distanceMiles > 0 && distanceMiles < 0.1) return 'Under 0.1 mi'
  return `${distanceMiles.toFixed(1)} mi`
}


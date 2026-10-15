/**
 * Pasta SHAPE helpers — a tiny, focused list (not a product taxonomy).
 *
 * The `pasta` catalog item covers all shapes for pricing. This module lets a
 * shopper preserve or choose a specific shape (spaghetti, penne, …) without a
 * new catalog entry per shape. The shape is a display/preference detail; it
 * never changes the simulated price (pricing stays keyed by the pasta id).
 */

export interface PastaShape {
  /** Stable id stored on the item (e.g. "penne"). */
  id: string
  /** Display label (e.g. "Penne"). */
  label: string
  /** Lowercase words that indicate this shape in free text. */
  aliases: string[]
}

/** Common shapes offered in the selector, in a sensible order. */
export const PASTA_SHAPES: PastaShape[] = [
  { id: 'spaghetti', label: 'Spaghetti', aliases: ['spaghetti', 'spaghetthi'] },
  { id: 'penne', label: 'Penne', aliases: ['penne'] },
  { id: 'rotini', label: 'Rotini', aliases: ['rotini'] },
  { id: 'rigatoni', label: 'Rigatoni', aliases: ['rigatoni'] },
  { id: 'macaroni', label: 'Macaroni', aliases: ['macaroni', 'elbow', 'elbows', 'elbow macaroni'] },
]

const SHAPE_BY_ID: Record<string, PastaShape> = Object.fromEntries(
  PASTA_SHAPES.map((s) => [s.id, s])
)

/** The shape's display label, or undefined for an unknown/"any" shape. */
export function pastaShapeLabel(id: string | undefined): string | undefined {
  if (!id) return undefined
  return SHAPE_BY_ID[id]?.label
}

/**
 * Detect a specific pasta shape mentioned in free text (e.g. "barilla penne"
 * → "penne"). Returns the shape id, or undefined when the text is generic
 * ("pasta", "noodles") so the item stays "Any type".
 */
export function detectPastaShape(text: string): string | undefined {
  const norm = ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ')} `
  for (const shape of PASTA_SHAPES) {
    for (const alias of shape.aliases) {
      if (norm.includes(` ${alias} `)) return shape.id
    }
  }
  return undefined
}

/**
 * Display name for a pasta item given its chosen shape. A specific shape reads
 * as e.g. "Penne"; "Any type" (undefined) falls back to the canonical "Pasta".
 */
export function pastaDisplayName(pastaType: string | undefined): string {
  return pastaShapeLabel(pastaType) ?? 'Pasta'
}

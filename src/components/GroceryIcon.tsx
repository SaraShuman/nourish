import type { GroceryCategory } from '../data/types'
import { CATALOG_BY_ID } from '../data/groceryCatalog'
import './GroceryIcon.css'

/**
 * Reusable grocery icon.
 *
 * MVP renders an emoji chosen by (in priority order):
 *   1. the catalog item's own `emoji` override,
 *   2. the category's default emoji,
 *   3. the shopping-cart fallback for unknown/uncategorized items.
 *
 * The emoji lives entirely inside this component, so it can later be
 * replaced with consistent SVG illustrations without touching the item
 * cards that consume it — the public props stay the same.
 */

const CATEGORY_EMOJI: Record<GroceryCategory, string> = {
  produce: '🥬',
  dairy: '🥛',
  meat: '🥩',
  seafood: '🐟',
  bakery: '🍞',
  pantry: '🥫',
  frozen: '🧊',
  beverages: '🧃',
  snacks: '🍪',
  other: '🛒',
}

const FALLBACK_EMOJI = '🛒'

interface GroceryIconProps {
  /** Catalog id, if the item was recognized. */
  catalogId?: string | null
  /** Category, used when there's no per-item emoji override. */
  category?: GroceryCategory
  /** Explicit emoji override (highest priority), e.g. for ambiguous items. */
  emoji?: string
  /** Decorative size in px (icon is aria-hidden). */
  size?: number
}

export function resolveEmoji(
  catalogId?: string | null,
  category?: GroceryCategory,
  emojiOverride?: string
): string {
  // An explicit override always wins (e.g. 🍗 for a general "chicken").
  if (emojiOverride) return emojiOverride
  if (catalogId) {
    const item = CATALOG_BY_ID[catalogId]
    if (item?.emoji) return item.emoji
    if (item) return CATEGORY_EMOJI[item.category]
  }
  if (category) return CATEGORY_EMOJI[category]
  return FALLBACK_EMOJI
}

export function GroceryIcon({ catalogId, category, emoji: emojiOverride, size = 40 }: GroceryIconProps) {
  const emoji = resolveEmoji(catalogId, category, emojiOverride)
  return (
    <span
      className="grocery-icon"
      style={{ fontSize: `${size * 0.72}px`, width: size, height: size }}
      aria-hidden="true"
    >
      {emoji}
    </span>
  )
}

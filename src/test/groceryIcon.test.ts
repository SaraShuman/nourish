import { describe, it, expect } from 'vitest'
import { resolveEmoji } from '../components/GroceryIcon'
import { parseGroceryList } from '../lib/parseGroceryList'

describe('resolveEmoji', () => {
  it('uses an explicit emoji override above all else', () => {
    // Ambiguous "chicken" has no catalogId and category "meat" (🥩),
    // but the override should force chicken 🍗.
    expect(resolveEmoji(null, 'meat', '🍗')).toBe('🍗')
  })

  it('falls back to the category emoji when no override/catalogId', () => {
    expect(resolveEmoji(null, 'meat')).toBe('🥩')
  })

  it('uses the catalog item emoji when a catalogId is given', () => {
    expect(resolveEmoji('bananas')).toBe('🍌')
  })
})

describe('ambiguous chicken carries a chicken emoji (not steak)', () => {
  it('parses a general "chicken" with the 🍗 override', () => {
    const item = parseGroceryList('chicken')[0]
    expect(item.ambiguous).toBe(true)
    expect(item.emoji).toBe('🍗')
    // And resolveEmoji honors it over the meat-category steak.
    expect(resolveEmoji(item.catalogId, item.category, item.emoji)).toBe('🍗')
  })
})

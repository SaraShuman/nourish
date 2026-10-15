import { describe, it, expect, beforeEach, vi } from 'vitest'
import { parseGroceryList } from '../lib/parseGroceryList'
import { enrichItem, detectAmbiguity } from '../lib/enrichItems'
import type { GroceryItem } from '../data/types'

beforeEach(() => {
  localStorage.clear()
})

/** A fetch that returns no products (OFF reachable but nothing matched). */
const emptyFetch = vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ products: [] }),
  text: async () => '{"products":[]}',
})) as unknown as typeof fetch

/** A fetch that always rejects (simulates API failure). */
const failingFetch = vi.fn(async () => {
  throw new Error('off down')
}) as unknown as typeof fetch

/** Parse a single fragment and return its one item. */
function parseOne(raw: string): GroceryItem {
  const items = parseGroceryList(raw)
  expect(items.length).toBeGreaterThan(0)
  return items[0]
}

describe('enrichItem — the seven required cases', () => {
  it('"2 pounds of boneless chicken breast" → Chicken Breast, qty 2 lb, variant preserved', async () => {
    const item = parseOne('2 pounds of boneless chicken breast')
    expect(item.catalogId).toBe('chicken-breast')
    expect(item.quantity).toBe(2)
    expect(item.unit).toBe('lb')

    const enriched = await enrichItem(item, {
      fragment: '2 pounds of boneless chicken breast',
      fetchImpl: emptyFetch,
    })
    // Local recognition is never overridden; not flagged ambiguous.
    expect(enriched.catalogId).toBe('chicken-breast')
    expect(enriched.ambiguous).toBeFalsy()
    expect(enriched.enriched).toBe(true)
  })

  it('"1 pound of chicken thighs" → Chicken Thighs, qty 1 lb', async () => {
    const item = parseOne('1 pound of chicken thighs')
    expect(item.catalogId).toBe('chicken-thighs')
    expect(item.quantity).toBe(1)
    expect(item.unit).toBe('lb')

    const enriched = await enrichItem(item, {
      fragment: '1 pound of chicken thighs',
      fetchImpl: emptyFetch,
    })
    expect(enriched.catalogId).toBe('chicken-thighs')
    expect(enriched.ambiguous).toBeFalsy()
  })

  it('"Perdue chicken breast" → Chicken Breast with brand Perdue preserved', async () => {
    const item = parseOne('Perdue chicken breast')
    expect(item.catalogId).toBe('chicken-breast')
    expect(item.brand).toBe('Perdue')

    const enriched = await enrichItem(item, {
      fragment: 'Perdue chicken breast',
      fetchImpl: emptyFetch,
    })
    // Explicit brand survives enrichment.
    expect(enriched.brand).toBe('Perdue')
    expect(enriched.ambiguous).toBeFalsy()
  })

  it('"A whole chicken" → Whole Chicken (distinct, not generic)', async () => {
    const item = parseOne('A whole chicken')
    expect(item.catalogId).toBe('whole-chicken')

    const enriched = await enrichItem(item, {
      fragment: 'A whole chicken',
      fetchImpl: emptyFetch,
    })
    expect(enriched.catalogId).toBe('whole-chicken')
    // "whole" is a distinguishing variant word, so NOT ambiguous.
    expect(enriched.ambiguous).toBeFalsy()
  })

  it('"Chicken" (ambiguous) → item preserved and flagged with candidates, no silent guess', async () => {
    const item = parseOne('chicken')
    // Locally "chicken" falls back to breast, but the request is ambiguous.
    const enriched = await enrichItem(item, {
      fragment: 'chicken',
      fetchImpl: emptyFetch,
    })
    expect(enriched.ambiguous).toBe(true)
    expect(enriched.candidates && enriched.candidates.length).toBeGreaterThan(1)
    const candidateNames = (enriched.candidates ?? []).map((c) => c.name.toLowerCase())
    expect(candidateNames.some((n) => n.includes('breast'))).toBe(true)
    expect(candidateNames.some((n) => n.includes('thigh'))).toBe(true)
    expect(candidateNames.some((n) => n.includes('wing'))).toBe(true)
  })

  it('a product missing from Open Food Facts → item kept, no crash', async () => {
    const item = parseOne('dragon fruit')
    expect(item.recognized).toBe(false)

    const enriched = await enrichItem(item, {
      fragment: 'dragon fruit',
      fetchImpl: emptyFetch,
    })
    // Unrecognized item is preserved for review, never dropped.
    expect(enriched.name.toLowerCase()).toContain('dragon fruit')
    expect(enriched.recognized).toBe(false)
    expect(enriched.enriched).toBe(true)
  })

  it('an API timeout / failure → graceful fallback to the local item', async () => {
    const item = parseOne('Perdue chicken breast')
    const enriched = await enrichItem(item, {
      fragment: 'Perdue chicken breast',
      fetchImpl: failingFetch,
      timeoutMs: 10,
    })
    // Local data intact despite OFF being unavailable.
    expect(enriched.catalogId).toBe('chicken-breast')
    expect(enriched.brand).toBe('Perdue')
    expect(enriched.enriched).toBe(true)
  })
})

describe('detectAmbiguity', () => {
  it('flags a bare term with variants', () => {
    expect(detectAmbiguity('chicken')).not.toBeNull()
    expect(detectAmbiguity('i need chicken please')).not.toBeNull()
  })

  it('does not flag a specific cut', () => {
    expect(detectAmbiguity('chicken thighs')).toBeNull()
    expect(detectAmbiguity('whole chicken')).toBeNull()
    expect(detectAmbiguity('boneless chicken breast')).toBeNull()
  })

  it('does not flag unrelated items', () => {
    expect(detectAmbiguity('bananas')).toBeNull()
  })
})

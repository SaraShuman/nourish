/**
 * Enrichment of branded products via OFF full-text search (search-a-licious).
 * Covers the five target products plus package-size preference, single vs.
 * multi-match handling, the max-4 cap, and graceful missing/timeout.
 *
 * All network is mocked — no live OFF calls.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { parseGroceryList } from '../lib/parseGroceryList'
import { enrichItem } from '../lib/enrichItems'
import type { GroceryItem } from '../data/types'

beforeEach(() => {
  localStorage.clear()
})

/** Build a fetch returning the given search-a-licious hits. */
function textSearchFetch(hits: unknown[]): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ hits }),
    text: async () => '',
  })) as unknown as typeof fetch
}

const failingFetch = vi.fn(async () => {
  throw new Error('off down')
}) as unknown as typeof fetch

function parseOne(raw: string): GroceryItem {
  const items = parseGroceryList(raw)
  expect(items.length).toBeGreaterThan(0)
  return items[0]
}

describe('branded enrichment — single confident match', () => {
  it('enriches "Heinz ketchup" style single result and preserves the request', async () => {
    const item = parseOne('Diet Coke')
    const enriched = await enrichItem(item, {
      fragment: item.sourceText ?? item.name,
      fetchImpl: textSearchFetch([
        {
          code: '0049000028911',
          product_name: 'Diet Coke',
          brands: ['Coca-Cola'],
          categories_tags: ['en:diet-sodas'],
          quantity: '355 ml',
        },
      ]),
    })
    expect(enriched.recognized).toBe(true)
    expect(enriched.name).toBe('Diet Coke')
    expect(enriched.brand).toBe('Coca-Cola')
    expect(enriched.barcode).toBe('0049000028911')
    expect(enriched.packageSize).toBe('355 ml')
    expect(enriched.ambiguous).toBeFalsy()
  })
})

describe('branded enrichment — real-world messy results', () => {
  it('defers size for "Diet Coke" even when results include noise and variants', async () => {
    // Mirrors live OFF data: the base product appears in several sizes, mixed
    // with a package baked into the name and unrelated variants.
    const item = parseOne('Diet Coke')
    const enriched = await enrichItem(item, {
      fragment: item.sourceText ?? item.name,
      fetchImpl: textSearchFetch([
        { code: '1', product_name: 'Diet Coke - 6pk/16.9 fl oz Bottles', brands: ['Coke'] },
        { code: '2', product_name: 'Diet Coke Caffeine Free', brands: ['Coca-Cola'], quantity: '355 ml' },
        { code: '3', product_name: 'Diet Coke', brands: ['Coca-Cola'], quantity: '2 L' },
        { code: '4', product_name: 'Diet Coke Lime', brands: ['Coca-Cola'], quantity: '355 ml' },
        { code: '5', product_name: 'Diet Coke', brands: ['Coca-Cola'], quantity: '12 x 355 ml' },
      ]),
    })
    // Deferred (not blocking), size unspecified, original wording preserved.
    expect(enriched.needsPackageChoice).toBe(true)
    expect(enriched.ambiguous).toBeFalsy()
    expect(enriched.name.toLowerCase()).toContain('diet coke')
    // Candidates are limited to the base product (sizes), capped at 4, and
    // exclude unrelated variants like Caffeine Free / Lime.
    expect(enriched.candidates!.length).toBeGreaterThan(1)
    expect(enriched.candidates!.length).toBeLessThanOrEqual(4)
    const names = enriched.candidates!.map((c) => c.name.toLowerCase())
    expect(names.every((n) => !n.includes('caffeine') && !n.includes('lime'))).toBe(true)
  })

  it('still clarifies (blocks) when results are genuinely different products', async () => {
    // An unrecognized term whose OFF results have no dominant repeated base
    // product → treat as distinct variants (clarify now, blocks continuing).
    const item = parseOne('fizzy drink thing')
    expect(item.recognized).toBe(false)
    const enriched = await enrichItem(item, {
      fragment: item.sourceText ?? item.name,
      fetchImpl: textSearchFetch([
        { code: 'a', product_name: 'Root Beer', brands: ['A&W'], quantity: '355 ml' },
        { code: 'b', product_name: 'Ginger Ale', brands: ['Canada Dry'], quantity: '355 ml' },
      ]),
    })
    expect(enriched.ambiguous).toBe(true)
    expect(enriched.needsPackageChoice).toBeFalsy()
  })
})

describe('branded enrichment — package size preference', () => {
  it('honors an explicit 12-pack preference by resolving to the matching product', async () => {
    const item = parseOne('12-pack Diet Coke')
    expect(item.packaging).toBe('12-pack')

    const enriched = await enrichItem(item, {
      fragment: item.sourceText ?? item.name,
      fetchImpl: textSearchFetch([
        { code: 'a', product_name: 'Diet Coke', brands: ['Coca-Cola'], quantity: '2 L' },
        { code: 'b', product_name: 'Diet Coke', brands: ['Coca-Cola'], quantity: '12 x 355 ml' },
      ]),
    })
    // The stated preference is honored: resolved to the 12-pack, not asked
    // again, and never swapped for the 2 L bottle.
    expect(enriched.recognized).toBe(true)
    expect(enriched.ambiguous).toBeFalsy()
    expect(enriched.needsPackageChoice).toBeFalsy()
    expect(enriched.packageSize).toBe('12 x 355 ml')
    expect(enriched.packaging).toBe('12-pack')
  })

  it('defers the package choice (no auto-pick) when no size was specified', async () => {
    const item = parseOne('Diet Coke')
    expect(item.packaging).toBeUndefined()

    const enriched = await enrichItem(item, {
      fragment: item.sourceText ?? item.name,
      fetchImpl: textSearchFetch([
        { code: 'a', product_name: 'Diet Coke', brands: ['Coca-Cola'], quantity: '2 L' },
        { code: 'b', product_name: 'Diet Coke', brands: ['Coca-Cola'], quantity: '12 x 355 ml' },
        { code: 'c', product_name: 'Diet Coke', brands: ['Coca-Cola'], quantity: '6 x 330 ml' },
      ]),
    })
    // Same product, differing sizes → size deferred, NOT blocking, no auto-pick.
    expect(enriched.needsPackageChoice).toBe(true)
    expect(enriched.ambiguous).toBeFalsy()
    expect(enriched.recognized).toBe(false)
    expect(enriched.candidates!.length).toBeGreaterThan(1)
  })
})

describe('branded enrichment — missing product / API failure', () => {
  it('preserves the original request when OFF returns nothing', async () => {
    const item = parseOne('Cheerios')
    const enriched = await enrichItem(item, {
      fragment: item.sourceText ?? item.name,
      fetchImpl: textSearchFetch([]),
    })
    expect(enriched.name).toBe('Cheerios')
    expect(enriched.recognized).toBe(false)
    expect(enriched.ambiguous).toBeFalsy()
    expect(enriched.enriched).toBe(true)
  })

  it('preserves the original request when the API fails/times out', async () => {
    const item = parseOne('Coca-Cola Zero Sugar')
    const enriched = await enrichItem(item, {
      fragment: item.sourceText ?? item.name,
      fetchImpl: failingFetch,
      timeoutMs: 10,
    })
    expect(enriched.name.toLowerCase()).toContain('zero sugar')
    expect(enriched.recognized).toBe(false)
    expect(enriched.enriched).toBe(true)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  lookupByBarcode,
  searchByCategoryBrand,
  searchByText,
  dedupeProducts,
} from '../lib/openFoodFacts'

beforeEach(() => {
  localStorage.clear()
})

/** Build a Response-like object for the injected fetch. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe('lookupByBarcode', () => {
  it('returns a normalized product on a hit (status 1)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        status: 1,
        product: {
          code: '0012345678905',
          product_name: 'Perdue Chicken Breast',
          brands: 'Perdue',
          categories_tags: ['en:chicken-breasts'],
          quantity: '1.5 lb',
        },
      })
    ) as unknown as typeof fetch

    const result = await lookupByBarcode('0012345678905', { fetchImpl })
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Perdue Chicken Breast')
    expect(result!.brand).toBe('Perdue')
    expect(result!.category).toBe('meat')
    expect(result!.barcode).toBe('0012345678905')
    // Calls our proxy, not OFF directly.
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/api/off/')
  })

  it('returns null for a missing product (status 0)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 0 })) as unknown as typeof fetch
    const result = await lookupByBarcode('0000000000000', { fetchImpl })
    expect(result).toBeNull()
  })

  it('returns null and does not throw on network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    const result = await lookupByBarcode('123', { fetchImpl })
    expect(result).toBeNull()
  })

  it('returns null on timeout (aborted fetch)', async () => {
    const fetchImpl = vi.fn((_, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (signal) {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }
      })
    }) as unknown as typeof fetch

    const result = await lookupByBarcode('123', { fetchImpl, timeoutMs: 10 })
    expect(result).toBeNull()
  })

  it('caches a result so a second call does not hit the network', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        status: 1,
        product: { code: '1', product_name: 'Eggs', categories_tags: ['en:eggs'] },
      })
    ) as unknown as typeof fetch

    await lookupByBarcode('1', { fetchImpl })
    await lookupByBarcode('1', { fetchImpl })
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })
})

describe('searchByCategoryBrand', () => {
  it('normalizes a structured search response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        products: [
          { code: '1', product_name: 'Chicken Thighs', categories_tags: ['en:chicken'], quantity: '1 lb' },
          { code: '2', product_name: 'Chicken Wings', categories_tags: ['en:chicken'] },
        ],
      })
    ) as unknown as typeof fetch

    const results = await searchByCategoryBrand(
      { categoriesTags: ['en:chickens'], pageSize: 5 },
      { fetchImpl }
    )
    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('Chicken Thighs')
    // Uses the structured v2 search endpoint, never a free-text query.
    const calledUrl = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/off/api/v2/search?')
    expect(calledUrl).toContain('categories_tags=en%3Achickens')
    expect(calledUrl).not.toContain('search_term')
  })

  it('returns [] on failure without throwing', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('boom')
    }) as unknown as typeof fetch
    const results = await searchByCategoryBrand({ categoriesTags: ['en:x'] }, { fetchImpl })
    expect(results).toEqual([])
  })
})

describe('searchByText (search-a-licious full-text)', () => {
  it('normalizes hits and hits the search route (not v2)', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        hits: [
          {
            code: '0049000024692',
            product_name: 'Diet Coke',
            brands: ['Coca-Cola'],
            categories_tags: ['en:sodas', 'en:diet-sodas'],
            quantity: '355 ml',
          },
        ],
      }),
      text: async () => '',
    })) as unknown as typeof fetch

    const results = await searchByText({ query: 'diet coke' }, { fetchImpl })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Diet Coke')
    expect(results[0].brand).toBe('Coca-Cola')
    expect(results[0].category).toBe('beverages')
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('/api/off/search?')
    expect(url).toContain('q=diet+coke')
  })

  it('dedupes identical products that differ only by barcode', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        hits: [
          { code: '1', product_name: 'Coke Zero', brands: ['Coca-Cola'], quantity: '20 fl oz' },
          { code: '2', product_name: 'Coke Zero', brands: ['Coca-Cola'], quantity: '20 fl oz' },
          { code: '3', product_name: 'Coke Zero', brands: ['Coca-Cola'], quantity: '2 L' },
        ],
      }),
      text: async () => '',
    })) as unknown as typeof fetch

    const results = await searchByText({ query: 'coke zero' }, { fetchImpl })
    // Two identical 20 fl oz entries collapse; the 2 L one stays distinct.
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.packageSize)).toEqual(['20 fl oz', '2 L'])
  })

  it('returns [] on empty query, miss, or failure (graceful)', async () => {
    const okEmpty = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ hits: [] }),
      text: async () => '',
    })) as unknown as typeof fetch
    expect(await searchByText({ query: '' }, { fetchImpl: okEmpty })).toEqual([])
    expect(await searchByText({ query: 'nope' }, { fetchImpl: okEmpty })).toEqual([])

    const failing = vi.fn(async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    expect(await searchByText({ query: 'x' }, { fetchImpl: failing })).toEqual([])
  })
})

describe('dedupeProducts', () => {
  it('collapses by name+brand+packageSize, keeping first occurrence', () => {
    const out = dedupeProducts([
      { name: 'Oreo', brand: 'Oreo', category: 'snacks', packageSize: '154 g' },
      { name: 'oreo', brand: 'Oreo', category: 'snacks', packageSize: '154 g' },
      { name: 'Oreo', brand: 'Oreo', category: 'snacks', packageSize: '66 g' },
    ])
    expect(out).toHaveLength(2)
  })
})

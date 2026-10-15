/**
 * Integration test for the Review List enrichment path:
 *   useGroceryList (mergeEnriched) + enrichItem, exercising the exact merge
 *   logic the Review List uses. Confirms enrichment ADDS reference data
 *   without changing the user's original product intent, and never overwrites
 *   edits or brand selections.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGroceryList, resetListFromInput } from '../hooks/useGroceryList'
import { enrichItem } from '../lib/enrichItems'

beforeEach(() => {
  localStorage.clear()
})

/** Fetch returning one OFF product with a barcode + package size. */
function offFetchWithProduct(): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      products: [
        {
          code: '0072745000010',
          product_name: 'Perdue Chicken Breast',
          brands: 'Perdue',
          categories_tags: ['en:chicken-breasts'],
          quantity: '1.5 lb',
        },
      ],
    }),
    text: async () => '',
  })) as unknown as typeof fetch
}

describe('Review enrichment — improves recognition without corrupting intent', () => {
  it('adds OFF barcode/packageSize to a branded item but preserves name, brand, qty, unit', async () => {
    resetListFromInput('Perdue chicken breast 2 lb')
    const { result } = renderHook(() => useGroceryList())

    const original = result.current.items[0]
    expect(original.catalogId).toBe('chicken-breast')
    expect(original.brand).toBe('Perdue')
    expect(original.quantity).toBe(2)
    expect(original.unit).toBe('lb')
    expect(original.barcode).toBeUndefined()

    const enriched = await enrichItem(original, {
      fragment: original.sourceText ?? original.name,
      fetchImpl: offFetchWithProduct(),
    })

    act(() => result.current.mergeEnriched(enriched))

    const after = result.current.items[0]
    // Enrichment ADDED the barcode (useful metadata)…
    expect(after.barcode).toBe('0072745000010')
    // …but for a WEIGHT item it must NOT adopt the OFF retail package size as
    // if it were the requested amount (the shopper asked for 2 lb).
    expect(after.packageSize).toBeUndefined()
    // …without changing the user's original intent.
    expect(after.catalogId).toBe('chicken-breast')
    expect(after.name).toBe('Chicken Breast')
    expect(after.brand).toBe('Perdue')
    expect(after.quantity).toBe(2)
    expect(after.unit).toBe('lb')
    expect(after.enriched).toBe(true)
  })

  it('does not overwrite a user edit made before enrichment resolves', async () => {
    resetListFromInput('Perdue chicken breast 2 lb')
    const { result } = renderHook(() => useGroceryList())
    const original = result.current.items[0]

    // Compute enrichment from the ORIGINAL item (simulates in-flight request).
    const enrichedPromise = enrichItem(original, {
      fragment: original.sourceText ?? original.name,
      fetchImpl: offFetchWithProduct(),
    })

    // Meanwhile the user edits quantity and switches brand.
    act(() => result.current.updateItem(original.id, { quantity: 5, brand: 'Tyson' }))

    const enriched = await enrichedPromise
    act(() => result.current.mergeEnriched(enriched))

    const after = result.current.items[0]
    // User edits win; enrichment only fills the empty reference fields.
    expect(after.quantity).toBe(5)
    expect(after.brand).toBe('Tyson')
    expect(after.barcode).toBe('0072745000010')
  })

  it('does not call the API for a recognized, unbranded staple', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ products: [] }),
      text: async () => '',
    })) as unknown as typeof fetch

    resetListFromInput('bananas 3 lb')
    const { result } = renderHook(() => useGroceryList())
    const bananas = result.current.items[0]
    expect(bananas.catalogId).toBe('bananas')
    expect(bananas.brand).toBe('')

    const enriched = await enrichItem(bananas, {
      fragment: bananas.sourceText ?? bananas.name,
      fetchImpl: fetchSpy,
    })

    // No network call for an unbranded staple…
    expect((fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
    // …and the item is unchanged apart from being marked enriched.
    expect(enriched.catalogId).toBe('bananas')
    expect(enriched.quantity).toBe(3)
    expect(enriched.enriched).toBe(true)
  })

  it('keeps an ambiguous "chicken" request intact and flags candidates (no API call)', async () => {
    const fetchSpy = vi.fn() as unknown as typeof fetch
    resetListFromInput('chicken')
    const { result } = renderHook(() => useGroceryList())
    const item = result.current.items[0]

    const enriched = await enrichItem(item, {
      fragment: item.sourceText ?? item.name,
      fetchImpl: fetchSpy,
    })
    act(() => result.current.mergeEnriched(enriched))

    const after = result.current.items[0]
    expect(after.ambiguous).toBe(true)
    expect((after.candidates ?? []).length).toBeGreaterThan(1)
    // Ambiguity is a local decision — no network call.
    expect((fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls ?? []).toHaveLength(0)
  })
})

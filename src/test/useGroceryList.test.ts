import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGroceryList, resetListFromInput } from '../hooks/useGroceryList'

beforeEach(() => {
  localStorage.clear()
})

describe('useGroceryList', () => {
  it('heals a stale saved item whose name has a size baked in', () => {
    localStorage.setItem('nourish:raw-input', 'diet coke')
    localStorage.setItem('nourish:raw-input-seed', 'diet coke')
    localStorage.setItem(
      'nourish:grocery-list',
      JSON.stringify([
        {
          id: 'x',
          catalogId: null,
          name: 'Diet Coke - 6pk/16.9 fl oz Bottles', // persisted by old logic
          quantity: 1,
          unit: 'each',
          brand: 'Coca-Cola',
          category: 'beverages',
          recognized: true,
          barcode: '123',
          enriched: true,
        },
      ])
    )
    const { result } = renderHook(() => useGroceryList())
    // Name is cleaned on load; size moved into packageSize.
    expect(result.current.items[0].name).toBe('Diet Coke')
    expect(result.current.items[0].packageSize).toBe('6pk/16.9 fl oz Bottles')
  })

  it('heals stale candidate names that have a size baked in', () => {
    localStorage.setItem('nourish:raw-input', 'diet coke')
    localStorage.setItem('nourish:raw-input-seed', 'diet coke')
    localStorage.setItem(
      'nourish:grocery-list',
      JSON.stringify([
        {
          id: 'x',
          catalogId: null,
          name: 'Diet Coke',
          quantity: 1,
          unit: 'each',
          brand: '',
          category: 'beverages',
          recognized: false,
          needsPackageChoice: true,
          enriched: true,
          candidates: [
            { catalogId: null, name: 'Diet Coke - 6pk/16.9 fl oz Bottles', category: 'beverages', brand: 'Coke', source: 'off' },
          ],
        },
      ])
    )
    const { result } = renderHook(() => useGroceryList())
    const cand = result.current.items[0].candidates![0]
    expect(cand.name).toBe('Diet Coke')
    expect(cand.packaging).toBe('6pk/16.9 fl oz Bottles')
  })

  it('seeds the list from the raw Welcome input', () => {
    localStorage.setItem('nourish:raw-input', 'bananas 3 lb, eggs 1 dozen')
    const { result } = renderHook(() => useGroceryList())
    expect(result.current.items).toHaveLength(2)
    expect(result.current.items[0].catalogId).toBe('bananas')
  })

  it('prefers a saved list when the raw input is unchanged since seeding', () => {
    localStorage.setItem('nourish:raw-input', 'bananas')
    // Mark the saved list as having been seeded from the same raw input.
    localStorage.setItem('nourish:raw-input-seed', 'bananas')
    localStorage.setItem(
      'nourish:grocery-list',
      JSON.stringify([
        { id: 'x', catalogId: 'eggs', name: 'Eggs', quantity: 2, unit: 'dozen', brand: '', category: 'dairy', recognized: true },
      ])
    )
    const { result } = renderHook(() => useGroceryList())
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].catalogId).toBe('eggs')
  })

  it('rebuilds the list from a fresh submission even after emptying it and retyping the same text', () => {
    // User typed "bananas", went to review, then deleted everything.
    resetListFromInput('bananas')
    localStorage.setItem('nourish:grocery-list', JSON.stringify([])) // emptied on review

    // Back on Welcome, they submit the same text again.
    resetListFromInput('bananas')

    const { result } = renderHook(() => useGroceryList())
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].catalogId).toBe('bananas')
  })

  it('re-seeds from the raw input when it changed since the list was seeded', () => {
    // A saved list exists, but the Welcome input has since changed.
    localStorage.setItem('nourish:raw-input-seed', 'bananas')
    localStorage.setItem(
      'nourish:grocery-list',
      JSON.stringify([
        { id: 'x', catalogId: 'bananas', name: 'Bananas', quantity: 1, unit: 'lb', brand: '', category: 'produce', recognized: true },
      ])
    )
    // New input typed on the Welcome screen.
    localStorage.setItem('nourish:raw-input', 'eggs 1 dozen, milk 1 gal')

    const { result } = renderHook(() => useGroceryList())
    expect(result.current.items).toHaveLength(2)
    const catalogIds = result.current.items.map((i) => i.catalogId)
    expect(catalogIds).toContain('eggs')
    expect(catalogIds).not.toContain('bananas')
  })

  it('defaults allowBrandSubstitutions to false', () => {
    const { result } = renderHook(() => useGroceryList())
    expect(result.current.prefs.allowBrandSubstitutions).toBe(false)
  })

  it('updates an item', () => {
    localStorage.setItem('nourish:raw-input', 'bananas 3 lb')
    const { result } = renderHook(() => useGroceryList())
    const id = result.current.items[0].id
    act(() => result.current.updateItem(id, { quantity: 5, brand: 'Dole' }))
    expect(result.current.items[0].quantity).toBe(5)
    expect(result.current.items[0].brand).toBe('Dole')
  })

  it('removes an item', () => {
    localStorage.setItem('nourish:raw-input', 'bananas, eggs')
    const { result } = renderHook(() => useGroceryList())
    const id = result.current.items[0].id
    act(() => result.current.removeItem(id))
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].catalogId).toBe('eggs')
  })

  it('adds a new blank item', () => {
    const { result } = renderHook(() => useGroceryList())
    const before = result.current.items.length
    act(() => result.current.addItem())
    expect(result.current.items).toHaveLength(before + 1)
    const added = result.current.items[result.current.items.length - 1]
    expect(added.recognized).toBe(false)
    expect(added.name).toBe('')
  })

  it('toggles brand substitutions and persists it', () => {
    const { result } = renderHook(() => useGroceryList())
    act(() => result.current.setAllowSubstitutions(true))
    expect(result.current.prefs.allowBrandSubstitutions).toBe(true)
    const saved = JSON.parse(localStorage.getItem('nourish:list-prefs') ?? '{}')
    expect(saved.allowBrandSubstitutions).toBe(true)
  })

  it('persists list edits to localStorage', () => {
    localStorage.setItem('nourish:raw-input', 'bananas 3 lb')
    const { result } = renderHook(() => useGroceryList())
    const id = result.current.items[0].id
    act(() => result.current.updateItem(id, { quantity: 9 }))
    const saved = JSON.parse(localStorage.getItem('nourish:grocery-list') ?? '[]')
    expect(saved[0].quantity).toBe(9)
  })
})

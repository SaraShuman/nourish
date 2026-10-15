/**
 * Review List UI: resolving an OFF branded clarification. Verifies the chips
 * render with distinguishers and that picking one adopts the OFF product
 * identity while preserving the shopper's packaging preference — all within
 * the existing card (no layout change).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { GroceryItemCard } from '../components/GroceryItemCard'
import { useGroceryList, resetListFromInput } from '../hooks/useGroceryList'
import type { GroceryItem, ProductCandidate } from '../data/types'

beforeEach(() => {
  localStorage.clear()
})

const offCandidates: ProductCandidate[] = [
  {
    catalogId: null,
    name: 'Diet Coke',
    category: 'beverages',
    brand: 'Coca-Cola',
    barcode: '12',
    packaging: '12 x 355 ml',
    source: 'off',
    distinguisher: 'Coca-Cola · 12 x 355 ml',
  },
  {
    catalogId: null,
    name: 'Diet Coke',
    category: 'beverages',
    brand: 'Coca-Cola',
    barcode: '20',
    packaging: '2 L',
    source: 'off',
    distinguisher: 'Coca-Cola · 2 L',
  },
]

describe('Review List — OFF branded clarification chips', () => {
  it('renders distinguishers and resolves to the chosen product, preserving packaging', () => {
    // Seed an ambiguous branded item with OFF candidates.
    const base: GroceryItem = {
      id: 'x1',
      catalogId: null,
      name: 'Diet Coke',
      quantity: 1,
      unit: 'each',
      brand: '',
      category: 'beverages',
      recognized: false,
      ambiguous: true,
      candidates: offCandidates,
      packaging: '12-pack',
      sourceText: '12-pack Diet Coke',
    }

    const patches: Partial<GroceryItem>[] = []
    const onChange = (_id: string, patch: Partial<GroceryItem>) => patches.push(patch)

    render(
      <GroceryItemCard item={base} allowSubstitutions={false} onChange={onChange} onRemove={() => {}} />
    )

    // Distinguishers are visible.
    const group = screen.getByRole('group', { name: /choose a type/i })
    expect(within(group).getByText('Coca-Cola · 12 x 355 ml')).toBeInTheDocument()
    expect(within(group).getByText('Coca-Cola · 2 L')).toBeInTheDocument()

    // Pick the 12-pack candidate (first chip).
    const chips = within(group).getAllByRole('button')
    fireEvent.click(chips[0])

    expect(patches).toHaveLength(1)
    const patch = patches[0]
    expect(patch.name).toBe('Diet Coke')
    expect(patch.brand).toBe('Coca-Cola')
    expect(patch.barcode).toBe('12')
    expect(patch.recognized).toBe(true)
    expect(patch.ambiguous).toBe(false)
    // The shopper's packaging preference ("12-pack") is preserved.
    expect(patch.packaging).toBe('12-pack')
  })

  it('persists a resolved branded choice through the list state', () => {
    resetListFromInput('placeholder') // seed storage structure
    const { result } = renderHook(() => useGroceryList())
    act(() => {
      // Simulate an ambiguous branded item being merged in.
      result.current.mergeEnriched({
        id: result.current.items[0].id,
        catalogId: null,
        name: 'Diet Coke',
        quantity: 1,
        unit: 'each',
        brand: '',
        category: 'beverages',
        recognized: false,
        ambiguous: true,
        candidates: offCandidates,
      })
    })
    expect(result.current.items[0].ambiguous).toBe(true)
    expect(result.current.items[0].candidates).toHaveLength(2)
  })
})

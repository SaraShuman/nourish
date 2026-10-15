/**
 * Pasta-type selector on the Review List card: a generic pasta item gets an
 * optional "Pasta type" selector (with "Any type"); choosing a shape updates
 * the item's name + pastaType so it carries through pricing/breakdown; a
 * specific shape or brand entered by the shopper is preserved; and the pasta
 * price (catalog id) is unaffected by the chosen shape.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GroceryItemCard } from '../components/GroceryItemCard'
import { parseGroceryList } from '../lib/parseGroceryList'
import { priceBasket } from '../lib/priceBasket'
import type { GroceryItem } from '../data/types'

beforeEach(() => localStorage.clear())

function pastaItem(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return {
    id: 'p1',
    catalogId: 'pasta',
    name: 'Pasta',
    quantity: 1,
    unit: 'box',
    brand: '',
    category: 'pantry',
    recognized: true,
    ...overrides,
  }
}

function renderCard(item: GroceryItem, onChange = (_id: string, _p: Partial<GroceryItem>) => {}) {
  render(
    <GroceryItemCard item={item} allowSubstitutions={false} onChange={onChange} onRemove={() => {}} />
  )
  // Rows are collapsed by default — expand to reveal the heavier controls.
  fireEvent.click(screen.getByRole('button', { name: /edit/i }))
}

describe('Pasta type selector', () => {
  it('offers an optional Pasta type selector with "Any type" for generic pasta', () => {
    renderCard(pastaItem())
    const select = screen.getByRole('combobox', { name: /pasta type/i })
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /any type/i })).toBeInTheDocument()
    // The common shapes are offered.
    for (const shape of ['Spaghetti', 'Penne', 'Rotini', 'Rigatoni', 'Macaroni']) {
      expect(screen.getByRole('option', { name: shape })).toBeInTheDocument()
    }
    // Generic pasta defaults to "Any type" (empty value).
    expect((select as HTMLSelectElement).value).toBe('')
  })

  it('choosing a shape updates both pastaType and the display name', () => {
    const patches: Partial<GroceryItem>[] = []
    renderCard(pastaItem(), (_id, p) => patches.push(p))
    fireEvent.change(screen.getByRole('combobox', { name: /pasta type/i }), {
      target: { value: 'penne' },
    })
    expect(patches).toHaveLength(1)
    expect(patches[0].pastaType).toBe('penne')
    expect(patches[0].name).toBe('Penne') // carries through to pricing/breakdown
  })

  it('"Any type" clears the shape without substituting a different one', () => {
    const patches: Partial<GroceryItem>[] = []
    renderCard(pastaItem({ pastaType: 'penne', name: 'Penne' }), (_id, p) => patches.push(p))
    const select = screen.getByRole('combobox', { name: /pasta type/i })
    expect((select as HTMLSelectElement).value).toBe('penne') // preserved specific shape
    fireEvent.change(select, { target: { value: '' } })
    expect(patches[0].pastaType).toBeUndefined()
    expect(patches[0].name).toBe('Pasta') // back to generic, not a different shape
  })

  it('only shows the selector for pasta, not other catalog items', () => {
    render(
      <GroceryItemCard
        item={{ ...pastaItem(), catalogId: 'rice', name: 'Rice', category: 'pantry' }}
        allowSubstitutions={false}
        onChange={() => {}}
        onRemove={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.queryByRole('combobox', { name: /pasta type/i })).not.toBeInTheDocument()
  })

  it('a chosen shape is priced as pasta (shape never changes the price)', () => {
    // The parsed "penne" item keeps catalogId 'pasta', so the breakdown line
    // reads "Penne" but the price matches generic pasta.
    const penne = parseGroceryList('penne')[0]
    const generic = parseGroceryList('pasta')[0]
    const pennBasket = priceBasket([penne], 'ralphs')
    const genericBasket = priceBasket([generic], 'ralphs')
    expect(pennBasket.lines[0].name).toBe('Penne') // type carried into breakdown
    expect(pennBasket.total).toBe(genericBasket.total) // price unchanged by shape
  })
})

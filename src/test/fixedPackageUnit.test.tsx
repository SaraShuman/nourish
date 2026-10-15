/**
 * For a RESOLVED Open Food Facts product (recognized, no catalog id, with a
 * package size), the card hides the Brand and Unit dropdowns and shows a
 * compact read-only description under the name, plus a "Change" affordance.
 * Generic/unresolved items keep their editable Brand and Unit controls.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import {
  GroceryItemCard,
  brandAddsInfo,
  buildProductDescription,
} from '../components/GroceryItemCard'
import type { GroceryItem, ProductCandidate } from '../data/types'

const offCandidates: ProductCandidate[] = [
  { catalogId: null, name: 'Diet Coke', category: 'beverages', brand: 'Coca-Cola', barcode: '12', packaging: '12 x 355 ml', source: 'off', distinguisher: '12 x 355 ml' },
  { catalogId: null, name: 'Diet Coke', category: 'beverages', brand: 'Coca-Cola', barcode: '20', packaging: '2 L', source: 'off', distinguisher: '2 L' },
]

/** A resolved OFF product (e.g. after picking a clarification chip). */
const resolvedDietCoke: GroceryItem = {
  id: 'r1',
  catalogId: null,
  name: 'Diet Coke',
  quantity: 1,
  unit: 'each',
  brand: 'Coca-Cola',
  category: 'beverages',
  recognized: true,
  barcode: '0049000028911', // OFF barcode marks this as a resolved OFF product
  packageSize: '6 pk / 16.9 fl oz',
  packaging: '6-pack',
  candidates: offCandidates,
}

function renderCard(
  item: GroceryItem,
  onChange: (id: string, patch: Partial<GroceryItem>) => void = () => {}
) {
  return render(
    <GroceryItemCard item={item} allowSubstitutions={false} onChange={onChange} onRemove={() => {}} />
  )
}

/** Expand the (single) card so its editing controls are rendered. */
function expandCard() {
  fireEvent.click(screen.getByRole('button', { name: /^Edit /i }))
}

describe('resolved OFF product — compact description, no Brand/Unit dropdowns', () => {
  it('has no Unit or Brand dropdowns even when expanded', () => {
    renderCard(resolvedDietCoke)
    expandCard()
    expect(screen.queryByLabelText(/^Unit for/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Brand for/i)).not.toBeInTheDocument()
  })

  it('shows the package size in the compact collapsed summary (brand omitted when redundant)', () => {
    renderCard(resolvedDietCoke)
    // Collapsed summary line carries the package size; "Coca-Cola" is omitted.
    expect(screen.getByText(/6 pk \/ 16\.9 fl oz/i)).toBeInTheDocument()
    expect(screen.queryByText(/coca-cola/i)).not.toBeInTheDocument()
  })

  it('keeps an editable quantity stepper labeled as number of packages', () => {
    renderCard(resolvedDietCoke)
    const group = screen.getByRole('group', { name: /number of packages for/i })
    expect(within(group).getByRole('button', { name: /increase quantity/i })).toBeInTheDocument()
  })

  it('offers a "Change package" button (expanded) that reopens size selection', () => {
    const patches: Partial<GroceryItem>[] = []
    renderCard(resolvedDietCoke, (_id, patch) => patches.push(patch))
    expandCard()
    fireEvent.click(screen.getByRole('button', { name: /change package/i }))
    // Reopens the (non-blocking) package choice, not the blocking ambiguous flow.
    expect(patches).toContainEqual({ needsPackageChoice: true })
  })

  it('has no brand dropdown even when OFF returned no package size (barcode only)', () => {
    renderCard({ ...resolvedDietCoke, packageSize: undefined, candidates: undefined })
    expandCard()
    expect(screen.queryByLabelText(/^Brand for/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Unit for/i)).not.toBeInTheDocument()
  })

  it('shows the parent brand only when it adds information', () => {
    const genericCereal: GroceryItem = {
      ...resolvedDietCoke,
      name: 'Toasted Oats',
      brand: 'Cheerios',
      packageSize: '18 oz',
    }
    renderCard(genericCereal)
    // Summary line shows "Cheerios · 18 oz".
    expect(screen.getByText(/cheerios/i)).toBeInTheDocument()
    expect(screen.getByText(/18 oz/i)).toBeInTheDocument()
  })

  it('displays a clean title even if a stored name still has a size baked in', () => {
    // Defensive: a stale item whose name was never cleaned still renders tidy.
    renderCard({ ...resolvedDietCoke, name: 'Diet Coke - 6pk/16.9 fl oz Bottles' })
    expect(screen.getByText('Diet Coke')).toBeInTheDocument()
    expect(screen.queryByText(/6pk\/16\.9 fl oz Bottles/i)).not.toBeInTheDocument()
  })
})

describe('generic/unresolved items keep editable controls', () => {
  it('keeps editable Unit and Brand dropdowns for a catalog item (expanded)', () => {
    const catalogItem: GroceryItem = {
      id: 'c1',
      catalogId: 'soda',
      name: 'Soda',
      quantity: 1,
      unit: 'pack',
      brand: '',
      category: 'beverages',
      recognized: true,
    }
    renderCard(catalogItem)
    expandCard()
    expect((screen.getByLabelText(/^Unit for/i) as HTMLSelectElement).tagName).toBe('SELECT')
    const brand = screen.getByLabelText(/^Brand for/i) as HTMLSelectElement
    expect(Array.from(brand.options).map((o) => o.textContent)).toContain('Any brand')
  })
})

describe('description helpers', () => {
  it('brandAddsInfo is false when the name already implies the brand', () => {
    expect(brandAddsInfo('Diet Coke', 'Coca-Cola')).toBe(false) // name recognizable, brand redundant here
    expect(brandAddsInfo('Cheerios', 'Cheerios')).toBe(false)
    expect(brandAddsInfo('Toasted Oats', 'Cheerios')).toBe(true)
    expect(brandAddsInfo('Ketchup', '')).toBe(false)
  })

  it('buildProductDescription joins meaningful parts with a middot', () => {
    expect(
      buildProductDescription({ ...resolvedDietCoke, name: 'Toasted Oats', brand: 'Cheerios', packageSize: '18 oz' })
    ).toBe('Cheerios · 18 oz')
    expect(buildProductDescription(resolvedDietCoke)).toBe('6 pk / 16.9 fl oz')
  })
})

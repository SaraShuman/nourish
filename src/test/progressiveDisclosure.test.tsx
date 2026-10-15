/**
 * Progressive disclosure + deferred package clarification regression tests
 * for the four required products: Diet Coke, Coke Zero, Perdue chicken breast,
 * and bananas. Also covers the pricing-readiness selectors that prepare
 * just-in-time clarification for Screen 4.
 */
import { useState } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { GroceryItemCard } from '../components/GroceryItemCard'
import { parseGroceryList } from '../lib/parseGroceryList'
import { enrichItem } from '../lib/enrichItems'
import {
  isPriceable,
  needsPackageChoice,
  itemsBlockingContinue,
  itemsNeedingPackageChoice,
} from '../lib/pricingReadiness'
import type { GroceryItem } from '../data/types'

beforeEach(() => {
  localStorage.clear()
})

function textSearchFetch(hits: unknown[]): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ hits }),
    text: async () => '',
  })) as unknown as typeof fetch
}

/** Multiple Diet Coke sizes (same product, differing package). */
const dietCokeSizes = [
  { code: '1', product_name: 'Diet Coke', brands: ['Coca-Cola'], quantity: '2 L' },
  { code: '2', product_name: 'Diet Coke', brands: ['Coca-Cola'], quantity: '12 x 355 ml' },
  { code: '3', product_name: 'Diet Coke', brands: ['Coca-Cola'], quantity: '6 x 330 ml' },
]

function renderCard(item: GroceryItem) {
  return render(
    <GroceryItemCard item={item} allowSubstitutions={false} onChange={() => {}} onRemove={() => {}} />
  )
}

async function enrich(raw: string, hits: unknown[]): Promise<GroceryItem> {
  const item = parseGroceryList(raw)[0]
  return enrichItem(item, { fragment: item.sourceText ?? item.name, fetchImpl: textSearchFetch(hits) })
}

describe('Diet Coke — friendly chip labels on messy real-world data', () => {
  it('drops sizeless entries and brand noise, never repeats the product name, keeps friendly sizes', async () => {
    // Mirrors live OFF: the pack baked into a name, a sizeless entry, varied
    // unit formatting, and brand noise.
    const item = await enrich('Diet Coke', [
      { code: 'a', product_name: 'Diet Coke - 6pk/16.9 fl oz Bottles', brands: ['Coke'] },
      { code: 'b', product_name: 'Diet Coke', brands: ['The Coca-Cola Company'], quantity: '500ml' },
      { code: 'c', product_name: 'Diet Coke', brands: ['Coca-Cola'], quantity: '20 fl. oz (591 mL)' },
      { code: 'd', product_name: 'Diet Coke', brands: ['Coke'] }, // no size → dropped
      { code: 'e', product_name: 'Diet Coke', brands: ['Coca-Cola'], quantity: '2 L' },
    ])
    expect(item.needsPackageChoice).toBe(true)

    renderCard(item)
    fireEvent.click(screen.getByRole('button', { name: /^Edit Diet Coke/i }))
    const group = screen.getByRole('group', { name: /choose a package size/i })

    // Friendly, normalized size labels.
    expect(within(group).getByText('6-pack · 16.9 fl oz bottles')).toBeInTheDocument()
    expect(within(group).getByText('500 mL')).toBeInTheDocument()
    expect(within(group).getByText('20 fl oz')).toBeInTheDocument()
    expect(within(group).getByText('2 L')).toBeInTheDocument()

    // Raw/ugly strings are NOT shown.
    expect(within(group).queryByText('500ml')).not.toBeInTheDocument()
    expect(within(group).queryByText(/591 mL/)).not.toBeInTheDocument()

    // Product name is never a chip label (no bare "Diet Coke" chip).
    expect(within(group).queryByText('Diet Coke')).not.toBeInTheDocument()

    // Brand/manufacturer noise is not shown on the labels.
    expect(within(group).queryByText(/coca-cola company/i)).not.toBeInTheDocument()
    expect(within(group).queryByText(/^Coke$/)).not.toBeInTheDocument()
  })
})

describe('Diet Coke — size deferred, not blocking', () => {
  it('defers the package size and labels the row "Size not specified"', async () => {
    const item = await enrich('Diet Coke', dietCokeSizes)
    expect(item.name).toBe('Diet Coke')
    expect(item.needsPackageChoice).toBe(true)
    expect(item.ambiguous).toBeFalsy()

    renderCard(item)
    // Collapsed row shows the exact deferred-size label.
    expect(screen.getByText('Size not specified')).toBeInTheDocument()
    // No auto-picked package size.
    expect(screen.queryByText(/2 L|12 x 355|6 x 330/)).not.toBeInTheDocument()
  })

  it('does not block continuing but is flagged for later package choice', async () => {
    const item = await enrich('Diet Coke', dietCokeSizes)
    expect(itemsBlockingContinue([item])).toHaveLength(0)
    expect(itemsNeedingPackageChoice([item])).toHaveLength(1)
    expect(isPriceable(item)).toBe(false)
    expect(needsPackageChoice(item)).toBe(true)
  })

  it('offers the deferred sizes only after expanding, with no preselection', async () => {
    const item = await enrich('Diet Coke', dietCokeSizes)
    renderCard(item)
    // Chips are not in the collapsed row.
    expect(screen.queryByRole('group', { name: /package size/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Edit Diet Coke/i }))
    const group = screen.getByRole('group', { name: /choose a package size/i })
    expect(within(group).getAllByRole('button').length).toBeGreaterThan(1)
  })

  it('labels size chips with friendly, normalized sizes (not the repeated product name)', async () => {
    const item = await enrich('Diet Coke', dietCokeSizes)
    renderCard(item)
    fireEvent.click(screen.getByRole('button', { name: /^Edit Diet Coke/i }))
    const group = screen.getByRole('group', { name: /choose a package size/i })
    // Friendly, normalized labels: "2 L", "12-pack · 355 mL", "6-pack · 330 mL".
    expect(within(group).getByText('2 L')).toBeInTheDocument()
    expect(within(group).getByText('12-pack · 355 mL')).toBeInTheDocument()
    expect(within(group).getByText('6-pack · 330 mL')).toBeInTheDocument()
    // Raw OFF strings are NOT shown.
    expect(within(group).queryByText('12 x 355 ml')).not.toBeInTheDocument()
    // The product name is NOT repeated on every chip.
    expect(within(group).queryByText('Diet Coke')).not.toBeInTheDocument()
  })

  it('preserves an explicit "12-pack Diet Coke" preference (resolved, priceable)', async () => {
    const item = await enrich('12-pack Diet Coke', dietCokeSizes)
    expect(item.packaging).toBe('12-pack')
    expect(item.needsPackageChoice).toBeFalsy()
    expect(item.recognized).toBe(true)
    expect(isPriceable(item)).toBe(true)
  })
})

describe('Diet Coke — resolving a size clears "Size not specified"', () => {
  it('removes the deferred-size label and shows the chosen size after selection', async () => {
    const resolved = await enrich('Diet Coke', dietCokeSizes)

    // Stateful host so the card re-renders with the merged patch, like the app.
    function Host() {
      const [item, setItem] = useState<GroceryItem>(resolved)
      return (
        <GroceryItemCard
          item={item}
          allowSubstitutions={false}
          onChange={(_id, patch) => setItem((prev) => ({ ...prev, ...patch }))}
          onRemove={() => {}}
        />
      )
    }
    render(<Host />)

    // Initially deferred.
    expect(screen.getByText('Size not specified')).toBeInTheDocument()

    // Expand and pick a size.
    fireEvent.click(screen.getByRole('button', { name: /^Edit Diet Coke/i }))
    const group = screen.getByRole('group', { name: /choose a package size/i })
    const firstSize = within(group).getAllByRole('button')[0]
    fireEvent.click(firstSize)

    // Label is gone; a concrete package size is shown instead.
    expect(screen.queryByText('Size not specified')).not.toBeInTheDocument()
    const sizeShown = screen.getAllByText(/\b(2 L|12 x 355 ml|6 x 330 ml)\b/i)
    expect(sizeShown.length).toBeGreaterThan(0)
  })
})

describe('Coke Zero — same deferral behavior', () => {
  it('defers size and does not block continuing', async () => {
    const item = await enrich('Coke Zero', [
      { code: 'z1', product_name: 'Coke Zero', brands: ['Coca-Cola'], quantity: '20 fl oz' },
      { code: 'z2', product_name: 'Coke Zero', brands: ['Coca-Cola'], quantity: '2 L' },
    ])
    expect(item.name).toBe('Coke Zero')
    expect(item.needsPackageChoice).toBe(true)
    expect(itemsBlockingContinue([item])).toHaveLength(0)
  })
})

describe('Perdue chicken breast — specific, priceable, no deferral', () => {
  it('keeps the brand + variant and is priceable without clarification', async () => {
    // Recognized catalog item with a brand → no text search; stays specific.
    const item = await enrich('Perdue chicken breast 1.5 lb', [])
    expect(item.catalogId).toBe('chicken-breast')
    expect(item.brand).toBe('Perdue')
    expect(item.quantity).toBe(1.5)
    expect(item.unit).toBe('lb')
    expect(item.needsPackageChoice).toBeFalsy()
    expect(item.ambiguous).toBeFalsy()
    expect(isPriceable(item)).toBe(true)
  })

  it('shows brand/variant in the summary and controls when expanded', async () => {
    const item = await enrich('Perdue chicken breast 1.5 lb', [])
    renderCard(item)
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Edit Chicken Breast/i }))
    const brand = screen.getByLabelText(/brand for/i) as HTMLSelectElement
    expect(brand.value).toBe('Perdue')
  })
})

describe('Bananas — plain weight item, collapsed and editable', () => {
  it('is priceable, sold by weight (2 lb is not two products), stepper editable', async () => {
    const item = await enrich('bananas 2 lb', [])
    expect(item.catalogId).toBe('bananas')
    expect(item.quantity).toBe(2)
    expect(item.unit).toBe('lb') // weight semantics preserved
    expect(item.needsPackageChoice).toBeFalsy()
    expect(isPriceable(item)).toBe(true)

    renderCard(item)
    // Compact collapsed row with an editable quantity stepper.
    const qtyGroup = screen.getByRole('group', { name: /quantity for/i })
    expect(within(qtyGroup).getByText('2')).toBeInTheDocument()
    expect(within(qtyGroup).getByRole('button', { name: /increase quantity/i })).toBeInTheDocument()
    // No "Size not specified" for a plain weight item.
    expect(screen.queryByText('Size not specified')).not.toBeInTheDocument()
  })
})

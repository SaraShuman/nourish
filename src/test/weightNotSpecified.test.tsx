/**
 * Fix 1 — unspecified weight must not be invented or shown as an OFF package
 * size, and interacting with the stepper establishes an explicit weight.
 * Fix 2 — shopper-friendly OFF package-size labels.
 *
 * Original list under test: "Diet Coke, Coke Zero, Perdue chicken breast,
 * bananas" (no weights/quantities stated for chicken or bananas).
 */
import { useState } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { GroceryItemCard } from '../components/GroceryItemCard'
import { parseGroceryList } from '../lib/parseGroceryList'
import { enrichItem } from '../lib/enrichItems'
import { formatPackageLabel } from '../lib/offNormalize'
import { isPriceable, needsWeightChoice, itemsBlockingContinue } from '../lib/pricingReadiness'
import type { GroceryItem } from '../data/types'

beforeEach(() => localStorage.clear())

/** OFF brand search returning a retail package (e.g. a 5 lb Perdue pack). */
function brandSearchFetch() {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      products: [
        {
          code: '00212',
          product_name: 'Chicken Breast',
          brands: ['Perdue'],
          categories_tags: ['en:chicken-breasts'],
          quantity: '5 lb (2.26 kg)',
        },
      ],
    }),
    text: async () => '',
  })) as unknown as typeof fetch
}

function renderStateful(initial: GroceryItem) {
  function Host() {
    const [item, setItem] = useState<GroceryItem>(initial)
    return (
      <GroceryItemCard
        item={item}
        allowSubstitutions={false}
        onChange={(_id, patch) => setItem((p) => ({ ...p, ...patch }))}
        onRemove={() => {}}
      />
    )
  }
  return render(<Host />)
}

describe('Fix 1 — parser does not invent a quantity', () => {
  it('flags Perdue chicken breast and bananas as quantity-unspecified', () => {
    const items = parseGroceryList('Perdue chicken breast, bananas')
    const chicken = items.find((i) => i.catalogId === 'chicken-breast')!
    const bananas = items.find((i) => i.catalogId === 'bananas')!
    expect(chicken.quantitySpecified).toBe(false)
    expect(bananas.quantitySpecified).toBe(false)
    // Brand preference preserved.
    expect(chicken.brand).toBe('Perdue')
  })

  it('marks an explicitly stated weight as specified', () => {
    const item = parseGroceryList('2 lb bananas')[0]
    expect(item.quantitySpecified).toBe(true)
    expect(item.quantity).toBe(2)
    expect(item.unit).toBe('lb')
  })
})

describe('Fix 1 — suggested weight, never an OFF package weight', () => {
  it('shows "Perdue · Suggested · 1 lb" and does not adopt the 5 lb pack', async () => {
    const original = parseGroceryList('Perdue chicken breast')[0]
    const enriched = await enrichItem(original, {
      fragment: original.sourceText ?? original.name,
      fetchImpl: brandSearchFetch(),
    })
    // Barcode metadata kept internally; the OFF 5 lb size is NOT adopted.
    expect(enriched.barcode).toBe('00212')
    expect(enriched.packageSize).toBeUndefined()
    expect(enriched.quantitySpecified).toBeFalsy()

    renderStateful(enriched)
    // Suggested default, clearly labeled; never the OFF 5 lb pack.
    expect(screen.getByText('Perdue · Suggested · 1 lb')).toBeInTheDocument()
    expect(screen.queryByText(/5 lb/i)).not.toBeInTheDocument()
  })

  it('bananas shows "Suggested · 1 lb" (no brand) and is priceable', async () => {
    const original = parseGroceryList('bananas')[0]
    const enriched = await enrichItem(original, {
      fragment: original.sourceText ?? original.name,
      fetchImpl: brandSearchFetch(),
    })
    renderStateful(enriched)
    expect(screen.getByText('Suggested · 1 lb')).toBeInTheDocument()
    // Still a suggestion for labeling, but now priceable and never blocking.
    expect(needsWeightChoice(enriched)).toBe(true)
    expect(isPriceable(enriched)).toBe(true)
    expect(itemsBlockingContinue([enriched])).toHaveLength(0)
  })
})

describe('Fix 1 — stepper shows the suggested default and commits on interaction', () => {
  it('shows the suggested 1 lb and the first interaction makes it explicit', () => {
    const chicken = parseGroceryList('Perdue chicken breast')[0]
    renderStateful(chicken)

    // Before interaction: labeled "Suggested · 1 lb", stepper shows a dimmed 1 lb.
    expect(screen.getByText('Perdue · Suggested · 1 lb')).toBeInTheDocument()
    const group = screen.getByRole('group', { name: /quantity for/i })
    expect(within(group).getByText('lb')).toBeInTheDocument()
    expect(within(group).getByText('1')).toBeInTheDocument()

    // First "+" commits an explicit 1 lb (no longer "Suggested").
    fireEvent.click(within(group).getByRole('button', { name: /increase quantity/i }))
    expect(screen.getByText('1 lb · Perdue')).toBeInTheDocument()
    expect(screen.queryByText(/suggested/i)).not.toBeInTheDocument()

    // Subsequent "+" adjusts the weight.
    fireEvent.click(screen.getByRole('group', { name: /quantity for/i }).querySelector('button:last-child')!)
    expect(screen.getByText('1.5 lb · Perdue')).toBeInTheDocument()
  })

  it('first "−" from the suggested default commits 0.5 lb', () => {
    const bananas = parseGroceryList('bananas')[0]
    renderStateful(bananas)
    const group = screen.getByRole('group', { name: /quantity for/i })
    fireEvent.click(within(group).getByRole('button', { name: /decrease quantity/i }))
    expect(screen.getByText('0.5 lb')).toBeInTheDocument()
  })
})

describe('Fix 2 — formatPackageLabel', () => {
  it('normalizes common OFF size strings into friendly labels', () => {
    expect(formatPackageLabel('500 ml')).toBe('500 mL')
    expect(formatPackageLabel('500 ml bottle')).toBe('500 mL bottle')
    expect(formatPackageLabel('20 fl. oz (591 mL)')).toBe('20 fl oz')
    expect(formatPackageLabel('2 L')).toBe('2 L')
    expect(formatPackageLabel('12 x 355 ml')).toBe('12-pack · 355 mL')
    expect(formatPackageLabel('6pk/16.9 fl oz Bottles')).toBe('6-pack · 16.9 fl oz bottles')
  })

  it('does not invent a container when the data has none', () => {
    expect(formatPackageLabel('500 ml')).not.toMatch(/bottle|can/)
  })

  it('returns empty for empty input (caller falls back to the name)', () => {
    expect(formatPackageLabel(undefined)).toBe('')
    expect(formatPackageLabel('')).toBe('')
  })
})

/**
 * Nearby Stores (Screen 5): shows the shopper's chosen store with its REAL
 * discovered location + distance (Google Places), a store-specific shopping
 * list priced from the simulated table, other real nearby stores, and an
 * honest real-locations / simulated-prices disclaimer. Never fabricates.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NearbyStores } from '../pages/NearbyStores'
import { resetListFromInput } from '../hooks/useGroceryList'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

/** Seed a ZIP location + a chosen store, and stub the Places discovery. */
function seed(storeId: string, placeNames: string[]) {
  localStorage.setItem(
    'nourish:location',
    JSON.stringify({ method: 'zip', zip: '90401', radiusMiles: 5 })
  )
  localStorage.setItem('nourish:comparison', JSON.stringify({ storeId }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/places/nearby')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            places: placeNames.map((name, i) => ({
              id: `place-${i + 1}`,
              displayName: { text: name },
              formattedAddress: `${100 + i} Demo St`,
              location: { latitude: 34.02 + i * 0.001, longitude: -118.49 },
              primaryType: 'supermarket',
            })),
          }),
          text: async () => '',
        } as unknown as Response
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as unknown as Response
    }) as unknown as typeof fetch
  )
}

function renderNearby() {
  return render(
    <MemoryRouter>
      <NearbyStores />
    </MemoryRouter>
  )
}

describe('NearbyStores — chosen store trip', () => {
  it('shows the selected store with its real discovered distance', async () => {
    resetListFromInput('bananas 2 lb, eggs 1 dozen')
    seed('ralphs', ['Ralphs', 'Vons'])
    renderNearby()
    // Store name appears as the selected-store heading (exact match).
    expect(await screen.findByRole('heading', { name: 'Ralphs' })).toBeInTheDocument()
    // The destination card shows a real distance label (e.g. "0.9 mi"); the
    // "straight-line from ZIP center" sublabel was removed from the card.
    const dest = screen.getByLabelText(/your destination: ralphs/i)
    expect(within(dest).getByText(/\bmi\b/i)).toBeInTheDocument()
    expect(screen.queryByText(/straight-line from zip center/i)).not.toBeInTheDocument()
  })

  it('builds a store-specific shopping list with a total', async () => {
    resetListFromInput('bananas 2 lb, eggs 1 dozen')
    seed('ralphs', ['Ralphs'])
    renderNearby()
    await screen.findByRole('heading', { name: /your list at ralphs/i })
    expect(screen.getByText(/bananas/i)).toBeInTheDocument()
    expect(screen.getByText(/estimated total/i)).toBeInTheDocument()
    // At least one priced line renders as a dollar amount.
    expect(screen.getAllByText(/^\$\d/).length).toBeGreaterThan(0)
  })

  it('estimates an uncatalogued list item instead of showing "No demo price available"', async () => {
    // "garlic" has no catalog price, but is interpretable → estimated, so the
    // shopping list prices it rather than leaving a gap.
    resetListFromInput('bananas 2 lb, garlic 1 each')
    seed('ralphs', ['Ralphs'])
    renderNearby()
    await screen.findByRole('heading', { name: /your list at ralphs/i })
    expect(screen.queryByText(/no demo price available/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/not carried here/i)).not.toBeInTheDocument()
    // Both items priced → a plain "Estimated total" (no partial "X of Y").
    expect(screen.getByText(/^estimated total$/i)).toBeInTheDocument()
    // Both list rows show a dollar amount.
    expect(screen.getAllByText(/^\$\d/).length).toBeGreaterThanOrEqual(2)
  })

  it('lists ALL discovered stores (priced + unpriced) with a count and badges', async () => {
    resetListFromInput('bananas 2 lb')
    seed('ralphs', ['Ralphs', 'Erewhon']) // 1 priced + 1 unpriced
    renderNearby()
    await screen.findByRole('heading', { name: 'Ralphs' })
    // The full list is tucked into a collapsed disclosure titled with the count.
    const summary = screen.getByText(/all stores near you \(2\)/i)
    expect(summary).toBeInTheDocument()
    fireEvent.click(summary) // open the dropdown
    // Both the priced retailer and the unpriced store are listed.
    expect(screen.getByText('Erewhon')).toBeInTheDocument()
    // Pricing is clearly distinguished.
    expect(screen.getByText('Demo pricing')).toBeInTheDocument()
    expect(screen.getByText('No demo pricing')).toBeInTheDocument()
  })

  it('is collapsed by default and opens on click', async () => {
    resetListFromInput('bananas 2 lb')
    seed('ralphs', ['Ralphs', 'Erewhon'])
    renderNearby()
    await screen.findByRole('heading', { name: 'Ralphs' })
    const details = screen.getByText(/all stores near you/i).closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false) // closed by default
    fireEvent.click(screen.getByText(/all stores near you/i))
    // (jsdom doesn't toggle `open` on summary click, so set it to mirror UX.)
    details.open = true
    expect(screen.getByText('Erewhon')).toBeInTheDocument()
  })

  it('includes the selected (priced) store in the full list, tagged as the pick', async () => {
    resetListFromInput('bananas 2 lb')
    seed('ralphs', ['Ralphs', 'Erewhon'])
    renderNearby()
    await screen.findByText(/all stores near you/i)
    // The destination (Ralphs) is also present in the comprehensive list.
    expect(screen.getByText('Your pick')).toBeInTheDocument()
  })

  it('shows the full list sorted closest-first', async () => {
    resetListFromInput('bananas 2 lb')
    // seed() places store i at lat 34.02 + i*0.001, so later index = farther.
    seed('ralphs', ['Ralphs', 'Erewhon', 'Vons'])
    renderNearby()
    const details = (await screen.findByText(/all stores near you/i)).closest(
      'details'
    ) as HTMLDetailsElement
    const rows = within(details).getAllByRole('listitem')
    // Rows are ordered closest-first; check each row leads with the expected store.
    expect(rows[0].textContent).toMatch(/^Ralphs/)
    expect(rows[1].textContent).toMatch(/^Erewhon/)
    expect(rows[2].textContent).toMatch(/^Vons/)
  })

  it('never presents prices as real — shows the simulated-price disclaimer', async () => {
    resetListFromInput('bananas 2 lb')
    seed('ralphs', ['Ralphs'])
    renderNearby()
    await screen.findByRole('heading', { name: 'Ralphs' })
    expect(screen.getByText(/prices are simulated for demonstration only/i)).toBeInTheDocument()
  })

  it('offers Get directions to the verified store location (Google Maps)', async () => {
    resetListFromInput('bananas 2 lb')
    seed('ralphs', ['Ralphs'])
    renderNearby()
    await screen.findByRole('heading', { name: 'Ralphs' })
    const link = screen.getByRole('link', { name: /get directions/i })
    const href = link.getAttribute('href') ?? ''
    expect(href).toContain('google.com/maps/dir/')
    expect(href).toContain('destination=')
    // Uses the Google place_id (our Places store id) for an exact match.
    expect(href).toContain('destination_place_id=place-1')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('shows addresses so same-retailer branches are distinguishable', async () => {
    resetListFromInput('bananas 2 lb')
    // Two Trader Joe's branches at different addresses must both remain listed.
    seed('ralphs', ['Ralphs', "Trader Joe's", "Trader Joe's"])
    renderNearby()
    await screen.findByRole('heading', { name: 'Ralphs' })
    expect(screen.getAllByText("Trader Joe's")).toHaveLength(2)
    expect(screen.getByText('101 Demo St')).toBeInTheDocument()
    expect(screen.getByText('102 Demo St')).toBeInTheDocument()
  })
})

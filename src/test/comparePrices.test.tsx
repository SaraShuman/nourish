/**
 * Compare Prices (Screen 4): renders retailer cards with a recommendation,
 * preference toggle, just-in-time clarification gating definitive totals,
 * navigation to Nearby Stores, and state persistence.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { ComparePrices } from '../pages/ComparePrices'
import { resetListFromInput } from '../hooks/useGroceryList'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

/** Seed a ZIP location so the screen has something to discover from. */
function seedLocation(radiusMiles = 5) {
  localStorage.setItem(
    'nourish:location',
    JSON.stringify({ method: 'zip', zip: '90401', radiusMiles })
  )
}

/**
 * Stub the global fetch used by discovery. The ZIP → coordinates step uses the
 * built-in centroid table (no network), so only the Places lookup needs
 * stubbing:
 *  - /places/nearby → a Google Places response with the given store names
 */
function stubDiscovery(storeNames: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/places/nearby')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            places: storeNames.map((name, i) => ({
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

function renderCompare(initial = '/compare') {
  const router = createMemoryRouter(
    [
      { path: '/location', element: <div>Location screen</div> },
      { path: '/compare', element: <ComparePrices /> },
      { path: '/nearby', element: <div>Nearby screen</div> },
    ],
    { initialEntries: [initial] }
  )
  return render(<RouterProvider router={router} />)
}

describe('ComparePrices — cards & recommendation', () => {
  beforeEach(() => {
    resetListFromInput('bananas 2 lb, eggs 1 dozen, chicken breast 2 lb')
  })

  it('shows headline, subhead, and the concise demo/locations disclaimer', () => {
    seedLocation()
    stubDiscovery(['Ralphs'])
    renderCompare()
    expect(screen.getByRole('heading', { name: /compare prices/i })).toBeInTheDocument()
    expect(screen.getByText(/ranked by lowest estimated total/i)).toBeInTheDocument()
    // Concise disclaimer replaces the long one; Google attribution preserved.
    expect(screen.getByText(/demo prices · actual store locations/i)).toBeInTheDocument()
    expect(screen.getByText(/powered by google/i)).toBeInTheDocument()
  })

  it('only shows retailers found nearby, with a BEST VALUE recommendation', async () => {
    seedLocation()
    // Ralphs + Whole Foods found nearby; Trader Joe's is NOT.
    stubDiscovery(['Ralphs', 'Whole Foods Market'])
    renderCompare()
    expect(await screen.findByText('Ralphs')).toBeInTheDocument()
    expect(screen.getByText('Whole Foods Market')).toBeInTheDocument()
    // Trader Joe's was not discovered → no card for it.
    expect(screen.queryByText("Trader Joe's")).not.toBeInTheDocument()
    expect(screen.getByText('BEST VALUE')).toBeInTheDocument()
    // Coverage reads "priced" (not "available") — we can't claim real stock.
    expect(screen.getAllByText(/of 3 items priced/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/items available/i)).not.toBeInTheDocument()
    // The winning card shows the green savings naming the priciest store.
    // Whole Foods is the most expensive of the two → "$X less than Whole Foods…".
    expect(screen.getByText(/\$\d+(\.\d+)? less than Whole Foods/i)).toBeInTheDocument()
    // (We removed the older "lowest simulated total" / "vs the priciest store" phrasing.)
    expect(screen.queryByText(/lowest simulated total/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/vs the priciest store/i)).not.toBeInTheDocument()
    // The redundant savings-summary panel was removed — the cards communicate
    // the recommendation (badge + totals + deltas) on their own.
    expect(screen.queryByText(/you could save/i)).not.toBeInTheDocument()
  })

  it('shows a plain per-card distance and one straight-line disclosure above the footer', async () => {
    seedLocation()
    stubDiscovery(['Ralphs', 'Whole Foods Market'])
    renderCompare()
    await screen.findByText('Ralphs')
    // Cards show just the distance (e.g. "4.3 mi"), no inline "(straight-line)".
    expect(screen.queryByText(/\(straight-line\)/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/\d+(\.\d+)?\s*mi$/i).length).toBeGreaterThan(0)
    // A single subtle disclosure appears near the bottom, above the footer.
    expect(
      screen.getByText(/distances are approximate and measured in a straight line, not driving distance/i)
    ).toBeInTheDocument()
    // The old below-cards explanation and tradeoff callout stay gone.
    expect(screen.queryByText(/distances are straight-line estimates/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/closer for only/i)).not.toBeInTheDocument()
  })

  it('has no strategy segmented control and states the single ranking rule', async () => {
    seedLocation()
    stubDiscovery(['Ralphs', 'Whole Foods Market'])
    renderCompare()
    await screen.findByText('Ralphs')
    // The old Lowest/One store/Balanced tabs are gone.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /balanced/i })).not.toBeInTheDocument()
    // The screen explains how it ranks, up front.
    expect(screen.getByText(/ranked by lowest estimated total/i)).toBeInTheDocument()
  })
})

describe('ComparePrices — location-aware discovery', () => {
  it('shows an honest message (no hardcoded stores) when discovery errors', async () => {
    resetListFromInput('bananas 2 lb, eggs 1 dozen')
    // Use coordinates directly so origin resolves and only Overpass fails.
    localStorage.setItem(
      'nourish:location',
      JSON.stringify({ method: 'geo', coords: { latitude: 34.0195, longitude: -118.4912 }, radiusMiles: 5 })
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('overpass down')
      }) as unknown as typeof fetch
    )
    renderCompare()
    expect(await screen.findByText(/couldn’t verify nearby stores/i)).toBeInTheDocument()
    // Never silently falls back to the demo trio.
    expect(screen.queryByText('BEST VALUE')).not.toBeInTheDocument()
  })

  it('resolves a bare saved ZIP to coordinates and never shows the "need a location" error', async () => {
    // Regression: the exact value a shopper had persisted in localStorage.
    // Previously the Census onelineaddress geocoder returned no match for a
    // bare ZIP, so Compare wrongly reported "We need a location to find nearby
    // stores." The built-in ZIP-centroid table must resolve it instead.
    resetListFromInput('bananas 2 lb, eggs 1 dozen')
    localStorage.setItem(
      'nourish:location',
      '{"method":"zip","radiusMiles":5,"zip":"90401"}'
    )
    stubDiscovery(['Ralphs'])
    renderCompare()
    expect(await screen.findByText('Ralphs')).toBeInTheDocument()
    expect(
      screen.queryByText(/we need a location to find nearby stores/i)
    ).not.toBeInTheDocument()
  })

  it('links to ALL discovered nearby stores by count (priced + unpriced)', async () => {
    resetListFromInput('bananas 2 lb, eggs 1 dozen')
    seedLocation()
    stubDiscovery(['Ralphs', 'Smart & Final']) // 2 discovered: 1 priced, 1 not
    renderCompare()
    expect(await screen.findByText('Ralphs')).toBeInTheDocument()
    // The link counts every unique discovered store, not just unpriced ones.
    expect(screen.getByText(/view all 2 nearby stores/i)).toBeInTheDocument()
    // The full list lives on Screen 5, not inline on Compare.
    expect(screen.queryByText('Smart & Final')).not.toBeInTheDocument()
  })

  it('nearby-stores link navigates to the Nearby Stores screen', async () => {
    resetListFromInput('bananas 2 lb, eggs 1 dozen')
    seedLocation()
    stubDiscovery(['Ralphs', 'Smart & Final', 'Erewhon'])
    renderCompare()
    await screen.findByText('Ralphs')
    fireEvent.click(screen.getByText(/view all 3 nearby stores/i))
    expect(screen.getByText('Nearby screen')).toBeInTheDocument()
  })
})

describe('ComparePrices — retailer breakdown arrow', () => {
  it('expands an itemized breakdown with prices, quantities, and a subtotal', async () => {
    resetListFromInput('bananas 2 lb, eggs 1 dozen')
    seedLocation()
    stubDiscovery(['Ralphs'])
    renderCompare()
    const arrow = await screen.findByRole('button', { name: /show item breakdown for/i })
    fireEvent.click(arrow)
    // Product names present.
    expect(screen.getByText(/bananas/i)).toBeInTheDocument()
    expect(screen.getByText(/eggs/i)).toBeInTheDocument()
    // Weight-based items show "2 lb", NOT "× 2" (which would imply 2 items).
    expect(screen.getByText(/2 lb/i)).toBeInTheDocument() // bananas 2 lb
    expect(screen.getByText(/1 dozen/i)).toBeInTheDocument() // eggs 1 dozen
    expect(screen.queryByText(/× 2/)).not.toBeInTheDocument()
    // Per-item prices and a labeled subtotal.
    expect(screen.getAllByText(/^\$\d/).length).toBeGreaterThan(0)
    expect(screen.getByText(/subtotal \(2 matched\)/i)).toBeInTheDocument()
  })
})

describe('ComparePrices — partial basket honesty', () => {
  it('highlights BEST MATCH (not full-list BEST VALUE) and explains unpriced items', async () => {
    // "diet coke" has no catalog price → every store is partial.
    resetListFromInput('bananas 2 lb, diet coke')
    seedLocation()
    stubDiscovery(['Ralphs', 'Vons'])
    renderCompare()
    await screen.findByText('Ralphs')
    // The recommended store is still highlighted, but as a partial-aware
    // "BEST MATCH" — never a full-list BEST VALUE claim.
    expect(screen.getByText('BEST MATCH')).toBeInTheDocument()
    expect(screen.queryByText('BEST VALUE')).not.toBeInTheDocument()
    // No full-list "lowest total" claim; the card notes totals exclude unpriced.
    expect(screen.queryByText(/lowest simulated total/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/less than/i)).not.toBeInTheDocument() // no savings claim when partial
    expect(screen.getByText(/total excludes items we couldn’t price/i)).toBeInTheDocument()
    expect(screen.getByText(/no store can fulfill your full list/i)).toBeInTheDocument()
    expect(screen.getByText(/diet coke/i)).toBeInTheDocument()
    expect(screen.getAllByText(/partial/i).length).toBeGreaterThan(0)
  })
})

describe('ComparePrices — just-in-time clarification', () => {
  it('blocks definitive totals until an unspecified weight is clarified', async () => {
    resetListFromInput('chicken breast') // no weight → needs clarification
    seedLocation()
    stubDiscovery(['Ralphs'])
    renderCompare()

    // Clarification UI shown; no cards yet. Copy reads as a quick step.
    expect(await screen.findByText(/almost there — just pick an amount/i)).toBeInTheDocument()
    expect(screen.queryByText('BEST VALUE')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view my shopping trip/i })).toBeDisabled()

    const section = screen.getByLabelText(/clarify items for pricing/i)
    fireEvent.click(within(section).getByRole('button', { name: /^2 lb$/i }))

    expect(await screen.findByText('BEST VALUE')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view my shopping trip/i })).toBeEnabled()
  })
})

describe('ComparePrices — navigation & persistence', () => {
  beforeEach(() => {
    resetListFromInput('bananas 2 lb, eggs 1 dozen')
    seedLocation()
  })

  it('CTA opens the shopping trip for the Best Value store when none is chosen', async () => {
    stubDiscovery(['Ralphs', 'Vons'])
    renderCompare()
    const cta = await screen.findByRole('button', { name: /view my shopping trip/i })
    await waitFor(() => expect(cta).toBeEnabled())
    fireEvent.click(cta)
    expect(screen.getByText('Nearby screen')).toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem('nourish:comparison') ?? '{}')
    // Defaults to the Best Value (cheapest complete) store — Ralphs is cheaper.
    expect(saved.storeId).toBe('ralphs')
  })

  it('tapping a retailer card opens the shopping trip for THAT store', async () => {
    stubDiscovery(['Ralphs', 'Vons'])
    renderCompare()
    await screen.findByText('Ralphs')
    // Tap the Vons card (not the Best Value) → its trip, its store persisted.
    fireEvent.click(screen.getByRole('button', { name: /view shopping trip for vons/i }))
    expect(screen.getByText('Nearby screen')).toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem('nourish:comparison') ?? '{}')
    expect(saved.storeId).toBe('vons')
  })

  it('the breakdown arrow expands in place and does NOT navigate', async () => {
    stubDiscovery(['Ralphs'])
    renderCompare()
    await screen.findByText('Ralphs')
    fireEvent.click(screen.getByRole('button', { name: /show item breakdown for ralphs/i }))
    // Still on Compare (no navigation), and the breakdown is now shown.
    expect(screen.queryByText('Nearby screen')).not.toBeInTheDocument()
    expect(screen.getByText(/subtotal \(/i)).toBeInTheDocument()
  })

  it('back button returns to Location without losing the list', () => {
    stubDiscovery(['Ralphs'])
    renderCompare()
    fireEvent.click(screen.getByRole('button', { name: /go back to add location/i }))
    expect(screen.getByText('Location screen')).toBeInTheDocument()
    expect(localStorage.getItem('nourish:grocery-list')).toBeTruthy()
  })
})

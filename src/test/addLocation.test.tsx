/**
 * Add Location (Screen 3) behavior: ZIP validation gating the CTA, radius
 * default/selection + persistence, geolocation error handling (no substitute
 * location), navigation to Compare, and preservation of Screen 2 state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AddLocation } from '../pages/AddLocation'

const realGeo = navigator.geolocation

beforeEach(() => localStorage.clear())
afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', { value: realGeo, configurable: true })
  vi.restoreAllMocks()
})

function setGeolocation(impl: Partial<Geolocation> | undefined) {
  Object.defineProperty(navigator, 'geolocation', { value: impl, configurable: true })
}

function renderLocation(initial = '/location') {
  const router = createMemoryRouter(
    [
      { path: '/review', element: <div>Review screen</div> },
      { path: '/location', element: <AddLocation /> },
      { path: '/compare', element: <div>Compare screen</div> },
    ],
    { initialEntries: [initial] }
  )
  return render(<RouterProvider router={router} />)
}

describe('AddLocation — layout & copy', () => {
  it('shows the headline, supporting text, and truthful privacy note', () => {
    renderLocation()
    expect(screen.getByRole('heading', { name: /where do you shop\?/i })).toBeInTheDocument()
    expect(screen.getByText(/find grocery stores near you to compare prices/i)).toBeInTheDocument()
    expect(screen.getByText(/your location helps us find nearby stores\. you can change it anytime\./i)).toBeInTheDocument()
  })

  it('marks Location as the active step', () => {
    renderLocation()
    const nav = screen.getByRole('navigation', { name: /progress/i })
    expect(within(nav).getByText('Location')).toBeInTheDocument()
  })
})

describe('AddLocation — ZIP validation gates the CTA', () => {
  it('disables "Find nearby stores" until a valid 5-digit ZIP is entered', () => {
    renderLocation()
    const cta = screen.getByRole('button', { name: /find nearby stores|enter a location/i })
    expect(cta).toBeDisabled()

    const zip = screen.getByLabelText('ZIP code')
    fireEvent.change(zip, { target: { value: '904' } })
    expect(cta).toBeDisabled()

    fireEvent.change(zip, { target: { value: '90401' } })
    expect(cta).toBeEnabled()
  })

  it('shows a validation hint for an incomplete ZIP on blur', () => {
    renderLocation()
    const zip = screen.getByLabelText('ZIP code')
    fireEvent.change(zip, { target: { value: '904' } })
    fireEvent.blur(zip)
    expect(screen.getByText(/five-digit US ZIP code/i)).toBeInTheDocument()
  })

  it('strips non-digits and caps at five characters', () => {
    renderLocation()
    const zip = screen.getByLabelText('ZIP code') as HTMLInputElement
    fireEvent.change(zip, { target: { value: '9a0b4c0d1x' } })
    expect(zip.value).toBe('90401')
  })

  it('clears the ZIP via the clear button', () => {
    renderLocation()
    const zip = screen.getByLabelText('ZIP code') as HTMLInputElement
    fireEvent.change(zip, { target: { value: '90401' } })
    fireEvent.click(screen.getByRole('button', { name: /clear zip code/i }))
    expect(zip.value).toBe('')
  })
})

describe('AddLocation — radius selector', () => {
  it('defaults to 5 miles and lets the shopper change it (persisted)', () => {
    renderLocation()
    const five = screen.getByRole('radio', { name: '5 mi' })
    expect(five).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByRole('radio', { name: '10 mi' }))
    expect(screen.getByRole('radio', { name: '10 mi' })).toHaveAttribute('aria-checked', 'true')

    const saved = JSON.parse(localStorage.getItem('nourish:location') ?? '{}')
    expect(saved.radiusMiles).toBe(10)
  })
})

describe('AddLocation — geolocation', () => {
  it('requests permission only on tap and stores coords on success', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 34.0, longitude: -118.5 } } as GeolocationPosition)
    )
    setGeolocation({ getCurrentPosition })
    renderLocation()
    expect(getCurrentPosition).not.toHaveBeenCalled() // not on mount

    fireEvent.click(screen.getByRole('button', { name: /use my current location/i }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)

    // CTA becomes enabled and the location persists.
    expect(await screen.findByRole('button', { name: /^find nearby stores$/i })).toBeEnabled()
    const saved = JSON.parse(localStorage.getItem('nourish:location') ?? '{}')
    expect(saved.method).toBe('geo')
    expect(saved.coords).toEqual({ latitude: 34.0, longitude: -118.5 })
  })

  it('shows a graceful message on permission denial and does not set a location', async () => {
    setGeolocation({
      getCurrentPosition: (_s, error) =>
        error &&
        error({ code: 1, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError),
    })
    renderLocation()
    fireEvent.click(screen.getByRole('button', { name: /use my current location/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/location access was blocked/i)
    // No fabricated location → CTA stays disabled.
    expect(screen.getByRole('button', { name: /enter a location/i })).toBeDisabled()
    const saved = JSON.parse(localStorage.getItem('nourish:location') ?? '{}')
    expect(saved.method ?? null).toBeNull()
  })
})

describe('AddLocation — reverse geocode populates ZIP', () => {
  /** Stub the global fetch used by reverseGeocodeZip (via the proxy route). */
  function stubCensusFetch(zip: string | null) {
    const body = {
      result: {
        geographies: {
          '2020 Census ZIP Code Tabulation Areas': zip ? [{ ZCTA5: zip }] : [],
        },
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      })) as unknown as typeof fetch
    )
  }

  function geoSuccess() {
    setGeolocation({
      getCurrentPosition: (success: PositionCallback) =>
        success({ coords: { latitude: 34.0195, longitude: -118.4912 } } as GeolocationPosition),
    })
  }

  it('populates the ZIP field with the reverse-geocoded result on success', async () => {
    geoSuccess()
    stubCensusFetch('90401')
    renderLocation()

    fireEvent.click(screen.getByRole('button', { name: /use my current location/i }))

    const zip = (await screen.findByDisplayValue('90401')) as HTMLInputElement
    expect(zip).toBe(screen.getByLabelText('ZIP code'))
    // The resolved ZIP is also persisted.
    const saved = JSON.parse(localStorage.getItem('nourish:location') ?? '{}')
    expect(saved.zip).toBe('90401')
    expect(screen.getByRole('button', { name: /^find nearby stores$/i })).toBeEnabled()
  })

  it('keeps coordinates and shows a friendly message when the ZIP lookup fails', async () => {
    geoSuccess()
    stubCensusFetch(null) // census returns no ZIP
    renderLocation()

    fireEvent.click(screen.getByRole('button', { name: /use my current location/i }))

    expect(
      await screen.findByText(/couldn’t determine your ZIP code\. You can enter it manually\./i)
    ).toBeInTheDocument()
    // Coordinates are kept (Continue still enabled), ZIP left blank — never fabricated.
    expect((screen.getByLabelText('ZIP code') as HTMLInputElement).value).toBe('')
    const saved = JSON.parse(localStorage.getItem('nourish:location') ?? '{}')
    expect(saved.method).toBe('geo')
    expect(saved.coords).toEqual({ latitude: 34.0195, longitude: -118.4912 })
  })

  it('lets a manual ZIP override the geolocated result', async () => {
    geoSuccess()
    stubCensusFetch('90401')
    renderLocation()
    fireEvent.click(screen.getByRole('button', { name: /use my current location/i }))
    await screen.findByDisplayValue('90401')

    // Shopper types a different ZIP — manual choice wins.
    const zip = screen.getByLabelText('ZIP code') as HTMLInputElement
    fireEvent.change(zip, { target: { value: '10001' } })
    expect(zip.value).toBe('10001')
    const saved = JSON.parse(localStorage.getItem('nourish:location') ?? '{}')
    expect(saved.method).toBe('zip')
    expect(saved.zip).toBe('10001')
  })
})

describe('AddLocation — "Use a different city"', () => {
  it('clears the location and refocuses the ZIP field', () => {
    renderLocation()
    const zip = screen.getByLabelText('ZIP code') as HTMLInputElement
    fireEvent.change(zip, { target: { value: '90401' } })
    expect(screen.getByRole('button', { name: /^find nearby stores$/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /use a different city/i }))
    expect(zip.value).toBe('')
    expect(document.activeElement).toBe(zip)
  })
})

describe('AddLocation — navigation & state persistence', () => {
  it('navigates to Compare once a valid location is set', () => {
    renderLocation()
    fireEvent.change(screen.getByLabelText('ZIP code'), { target: { value: '90401' } })
    fireEvent.click(screen.getByRole('button', { name: /^find nearby stores$/i }))
    expect(screen.getByText('Compare screen')).toBeInTheDocument()
  })

  it('persists the ZIP to localStorage synchronously (readable before navigation)', () => {
    renderLocation()
    // Typing a valid ZIP must leave it in storage immediately, so the next
    // screen (Compare) reads a usable location rather than "no location".
    fireEvent.change(screen.getByLabelText('ZIP code'), { target: { value: '90401' } })
    const saved = JSON.parse(localStorage.getItem('nourish:location') ?? '{}')
    expect(saved.method).toBe('zip')
    expect(saved.zip).toBe('90401')
  })

  it('back button returns to the Review List', () => {
    renderLocation()
    fireEvent.click(screen.getByRole('button', { name: /go back to review list/i }))
    expect(screen.getByText('Review screen')).toBeInTheDocument()
  })

  it('restores a previously saved ZIP and radius on mount', () => {
    localStorage.setItem(
      'nourish:location',
      JSON.stringify({ method: 'zip', zip: '10001', radiusMiles: 15 })
    )
    renderLocation()
    expect((screen.getByLabelText('ZIP code') as HTMLInputElement).value).toBe('10001')
    expect(screen.getByRole('radio', { name: '15 mi' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: /^find nearby stores$/i })).toBeEnabled()
  })

  it('does not touch the grocery list (Screen 2 state preserved)', () => {
    const list = JSON.stringify([{ id: 'a', catalogId: 'bananas', name: 'Bananas', quantity: 2, unit: 'lb', brand: '', category: 'produce', recognized: true }])
    localStorage.setItem('nourish:grocery-list', list)
    renderLocation()
    fireEvent.change(screen.getByLabelText('ZIP code'), { target: { value: '90401' } })
    fireEvent.click(screen.getByRole('button', { name: /^find nearby stores$/i }))
    // The grocery list in storage is unchanged.
    expect(localStorage.getItem('nourish:grocery-list')).toBe(list)
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGeolocation } from '../hooks/useGeolocation'

const realGeo = navigator.geolocation

afterEach(() => {
  // Restore whatever was there.
  Object.defineProperty(navigator, 'geolocation', { value: realGeo, configurable: true })
  vi.restoreAllMocks()
})

function setGeolocation(impl: Partial<Geolocation> | undefined) {
  Object.defineProperty(navigator, 'geolocation', { value: impl, configurable: true })
}

/** Minimal GeolocationPositionError-like object with code constants. */
function geoError(code: number): GeolocationPositionError {
  return {
    code,
    message: '',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError
}

describe('useGeolocation', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('resolves coordinates on success', async () => {
    setGeolocation({
      getCurrentPosition: (success) =>
        success({ coords: { latitude: 34.01, longitude: -118.49 } } as GeolocationPosition),
    })
    const { result } = renderHook(() => useGeolocation())
    let coords: unknown
    await act(async () => {
      coords = await result.current.request()
    })
    expect(coords).toEqual({ latitude: 34.01, longitude: -118.49 })
    expect(result.current.error).toBeNull()
  })

  it('reports permission-denied without substituting a location', async () => {
    setGeolocation({
      getCurrentPosition: (_s, error) => error && error(geoError(1)),
    })
    const { result } = renderHook(() => useGeolocation())
    let coords: unknown
    await act(async () => {
      coords = await result.current.request()
    })
    expect(coords).toBeNull()
    expect(result.current.error).toBe('permission-denied')
  })

  it('reports position-unavailable', async () => {
    setGeolocation({
      getCurrentPosition: (_s, error) => error && error(geoError(2)),
    })
    const { result } = renderHook(() => useGeolocation())
    await act(async () => {
      await result.current.request()
    })
    expect(result.current.error).toBe('unavailable')
  })

  it('reports unsupported when the API is missing', async () => {
    setGeolocation(undefined)
    const { result } = renderHook(() => useGeolocation())
    let coords: unknown
    await act(async () => {
      coords = await result.current.request()
    })
    expect(coords).toBeNull()
    expect(result.current.error).toBe('unsupported')
  })

  it('does NOT request permission on mount (only on request())', () => {
    const getCurrentPosition = vi.fn()
    setGeolocation({ getCurrentPosition })
    renderHook(() => useGeolocation())
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })
})

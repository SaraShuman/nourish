import { useCallback, useEffect, useState } from 'react'
import type { GeoCoords } from './useGeolocation'
import type { LocationState, RadiusMiles } from '../data/types'

const LOCATION_KEY = 'nourish:location'

const DEFAULT_LOCATION: LocationState = {
  method: null,
  radiusMiles: 5, // default radius per spec
}

function loadLocation(): LocationState {
  try {
    const saved = localStorage.getItem(LOCATION_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<LocationState>
      return { ...DEFAULT_LOCATION, ...parsed }
    }
  } catch {
    /* fall back to defaults */
  }
  return DEFAULT_LOCATION
}

export interface UseLocationReturn {
  location: LocationState
  /** Set a validated ZIP as the location (clears any coords). */
  setZip: (zip: string) => void
  /** Set device coordinates as the location (clears any ZIP). */
  setCoords: (coords: GeoCoords) => void
  /** Change the shopping radius. */
  setRadius: (radius: RadiusMiles) => void
  /** Clear the selected location (keeps the radius). */
  clearLocation: () => void
  /** Whether a usable location is set (geo coords or a ZIP). */
  hasLocation: boolean
}

/**
 * Owns the shopper's location + shopping radius, persisted to localStorage so
 * it survives navigation and refreshes. Location is stored on the device to
 * carry the choice forward; it may later be sent to a store-location provider
 * (e.g. Kroger) to retrieve nearby stores.
 */
/** Persist immediately so a navigation right after a setter can't race the
 *  post-render effect (Compare reads this key on mount). */
function persist(next: LocationState): void {
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — effect below is a best-effort fallback */
  }
}

export function useLocation(): UseLocationReturn {
  const [location, setLocation] = useState<LocationState>(loadLocation)

  // Safety net: keep storage in sync even for updates that didn't go through
  // a setter (none currently, but harmless and robust).
  useEffect(() => {
    persist(location)
  }, [location])

  const update = useCallback((producer: (prev: LocationState) => LocationState) => {
    setLocation((prev) => {
      const next = producer(prev)
      persist(next) // synchronous write before any subsequent navigation
      return next
    })
  }, [])

  const setZip = useCallback(
    (zip: string) => update((prev) => ({ ...prev, method: 'zip', zip, coords: undefined })),
    [update]
  )

  const setCoords = useCallback(
    (coords: GeoCoords) => update((prev) => ({ ...prev, method: 'geo', coords, zip: undefined })),
    [update]
  )

  const setRadius = useCallback(
    (radius: RadiusMiles) => update((prev) => ({ ...prev, radiusMiles: radius })),
    [update]
  )

  const clearLocation = useCallback(
    () => update((prev) => ({ method: null, radiusMiles: prev.radiusMiles })),
    [update]
  )

  const hasLocation =
    location.method === 'geo'
      ? Boolean(location.coords)
      : location.method === 'zip'
        ? Boolean(location.zip)
        : false

  return { location, setZip, setCoords, setRadius, clearLocation, hasLocation }
}

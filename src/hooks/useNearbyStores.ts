import { useEffect, useRef, useState } from 'react'
import type { LocationState, Store } from '../data/types'
import { discoverStores, geocodeZip, type DiscoveryStatus } from '../lib/storeDiscovery'
import { zipCentroid } from '../data/zipCentroids'

const DISCOVERED_KEY = 'nourish:discovered-stores'

/** We resolve a bare ZIP to coordinates in two steps: first a built-in
 * centroid table (instant, offline-safe, no API cost for common demo ZIPs),
 * then a proxied Google Places Text Search for any other valid ZIP. Only when
 * BOTH fail do we fall back to an honest "couldn't locate that ZIP" state —
 * we never fabricate a location. */

export type NearbyStatus = 'idle' | 'loading' | DiscoveryStatus | 'no-location' | 'no-zip-coords'

export interface UseNearbyStoresReturn {
  status: NearbyStatus
  stores: Store[]
  /** The coordinates discovery ran from, when known. */
  origin: { lat: number; lng: number } | null
}

/** Resolve the shopper's coordinates from their LocationState. */
async function resolveOrigin(
  location: LocationState,
  fetchImpl?: typeof fetch
): Promise<{ lat: number; lng: number } | null> {
  if (location.coords) {
    return { lat: location.coords.latitude, lng: location.coords.longitude }
  }
  if (location.zip) {
    // 1) Built-in centroid table — instant, offline, no API cost.
    const centroid = zipCentroid(location.zip)
    if (centroid) return centroid
    // 2) Any other valid ZIP → proxied Google Places geocode.
    return geocodeZip(location.zip, { fetchImpl })
  }
  return null
}

/**
 * Discover real nearby stores for the current location + radius. Re-runs when
 * the ZIP, coordinates, or radius change. Persists results for Screen 5.
 * Injectable deps keep it testable.
 */
export function useNearbyStores(
  location: LocationState,
  deps: { fetchImpl?: typeof fetch } = {}
): UseNearbyStoresReturn {
  const [status, setStatus] = useState<NearbyStatus>('idle')
  const [stores, setStores] = useState<Store[]>([])
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null)
  const reqId = useRef(0)

  const key = `${location.method}|${location.zip ?? ''}|${
    location.coords ? `${location.coords.latitude},${location.coords.longitude}` : ''
  }|${location.radiusMiles}`

  useEffect(() => {
    const id = ++reqId.current
    const hasLocation = Boolean(location.coords || location.zip)
    if (!hasLocation) {
      setStatus('no-location')
      setStores([])
      setOrigin(null)
      return
    }

    setStatus('loading')
    ;(async () => {
      const coords = await resolveOrigin(location, deps.fetchImpl)
      if (id !== reqId.current) return // superseded by a newer change
      if (!coords) {
        setStatus('no-zip-coords')
        setStores([])
        setOrigin(null)
        return
      }
      setOrigin(coords)
      const result = await discoverStores(coords.lat, coords.lng, location.radiusMiles, {
        fetchImpl: deps.fetchImpl,
      })
      if (id !== reqId.current) return
      setStatus(result.status)
      setStores(result.stores)
      try {
        localStorage.setItem(DISCOVERED_KEY, JSON.stringify(result.stores))
      } catch {
        /* ignore storage failures */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { status, stores, origin }
}

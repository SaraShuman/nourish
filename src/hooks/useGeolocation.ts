import { useCallback, useState } from 'react'

/** Human-readable geolocation error states surfaced to the UI. */
export type GeolocationErrorKind =
  | 'unsupported' // navigator.geolocation missing
  | 'permission-denied'
  | 'unavailable' // position could not be determined
  | 'timeout'
  | 'unknown'

export interface GeoCoords {
  latitude: number
  longitude: number
}

interface UseGeolocationReturn {
  /** Whether a request is in flight. */
  loading: boolean
  /** The latest error, or null. */
  error: GeolocationErrorKind | null
  /**
   * Request the device location. Permission is prompted by the browser ONLY
   * when this is called (i.e. on an explicit tap). Resolves with coordinates
   * on success, or null on any failure — never a fabricated location.
   */
  request: () => Promise<GeoCoords | null>
  /** Clear any error (e.g. when the shopper switches to ZIP entry). */
  reset: () => void
}

/** Map a GeolocationPositionError code to our error kind. */
function mapError(err: GeolocationPositionError): GeolocationErrorKind {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'permission-denied'
    case err.POSITION_UNAVAILABLE:
      return 'unavailable'
    case err.TIMEOUT:
      return 'timeout'
    default:
      return 'unknown'
  }
}

export function useGeolocation(): UseGeolocationReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<GeolocationErrorKind | null>(null)

  const reset = useCallback(() => setError(null), [])

  const request = useCallback((): Promise<GeoCoords | null> => {
    // Only reached on an explicit tap — never on mount.
    const geo =
      typeof navigator !== 'undefined' ? (navigator.geolocation as Geolocation | undefined) : undefined
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      setError('unsupported')
      return Promise.resolve(null)
    }

    setLoading(true)
    setError(null)

    return new Promise<GeoCoords | null>((resolve) => {
      geo.getCurrentPosition(
        (pos) => {
          setLoading(false)
          resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        },
        (err) => {
          setLoading(false)
          setError(mapError(err))
          resolve(null)
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
      )
    })
  }, [])

  return { loading, error, request, reset }
}

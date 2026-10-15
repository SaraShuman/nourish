/**
 * Reverse geocoding: device coordinates → US ZIP code.
 *
 * Uses the US Census Geocoder (free, no API key) via our own proxy. The ZIP
 * comes from the Census "ZIP Code Tabulation Areas" layer (ZCTA5), which is
 * the Census's authoritative ZIP approximation. US-only.
 *
 * We NEVER fabricate a ZIP: any failure (network, timeout, no coverage,
 * non-US) resolves to null so the caller can fall back to manual entry.
 */

const PROXY_BASE = '/api/off'
const DEFAULT_TIMEOUT_MS = 6000

// Cache resolved ZIPs by rounded coordinates so repeat taps don't re-hit the
// service. Rounded to ~1km to keep the key stable across tiny GPS jitter.
const CACHE_PREFIX = 'nourish:revgeo:'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h

function cacheKey(lat: number, lng: number): string {
  return `${CACHE_PREFIX}${lat.toFixed(2)},${lng.toFixed(2)}`
}

function cacheGet(key: string): string | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { expires: number; zip: string | null }
    if (Date.now() > parsed.expires) {
      localStorage.removeItem(key)
      return null
    }
    return parsed.zip
  } catch {
    return null
  }
}

function cacheSet(key: string, zip: string | null): void {
  try {
    localStorage.setItem(key, JSON.stringify({ expires: Date.now() + CACHE_TTL_MS, zip }))
  } catch {
    /* storage unavailable — operate without the cache */
  }
}

/** Shape of the Census geographies response (only the bits we read). */
interface CensusResponse {
  result?: {
    geographies?: {
      '2020 Census ZIP Code Tabulation Areas'?: { ZCTA5?: string }[]
    }
  }
}

/** Extract a 5-digit ZIP (ZCTA5) from a Census response, or null. */
export function extractZip(json: unknown): string | null {
  const zctas = (json as CensusResponse)?.result?.geographies?.[
    '2020 Census ZIP Code Tabulation Areas'
  ]
  const zip = Array.isArray(zctas) ? zctas[0]?.ZCTA5 : undefined
  return zip && /^\d{5}$/.test(zip) ? zip : null
}

export interface ReverseGeocodeOptions {
  timeoutMs?: number
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

/**
 * Resolve coordinates to a 5-digit US ZIP, or null if it can't be reliably
 * determined. Cached by rounded coordinates.
 */
export async function reverseGeocodeZip(
  latitude: number,
  longitude: number,
  opts: ReverseGeocodeOptions = {}
): Promise<string | null> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = opts

  const key = cacheKey(latitude, longitude)
  const cached = cacheGet(key)
  if (cached !== null) return cached

  const query = new URLSearchParams({
    x: String(longitude),
    y: String(latitude),
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    layers: 'all',
    format: 'json',
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(
      `${PROXY_BASE}/census/geocoder/geographies/coordinates?${query.toString()}`,
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    )
    clearTimeout(timer)
    if (!res.ok) return null
    const json = (await res.json()) as unknown
    const zip = extractZip(json)
    // Cache both hits and confirmed misses (null) to avoid repeat lookups.
    cacheSet(key, zip)
    return zip
  } catch {
    clearTimeout(timer)
    return null
  }
}

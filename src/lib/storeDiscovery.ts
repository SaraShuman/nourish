/**
 * Real nearby-store discovery via Google Places API (New), proxied so the API
 * key stays server-side. Returns verified store locations with a STRAIGHT-LINE
 * (Haversine) distance from the shopper. We never invent names, addresses,
 * coordinates, or distances.
 *
 * This is LOCATION data only — kept separate from the simulated price table.
 * Each store is tagged with a `retailerId` when its name matches one of our
 * priced retailers, or null when it's a real store we can't price in the demo.
 */
import type { Store } from '../data/types'
import { matchRetailer } from '../data/pricing'

const PROXY_BASE = '/api/off'
const DEFAULT_TIMEOUT_MS = 12000

/**
 * Resolve a bare ZIP (or short place query) to coordinates via the proxied
 * Google Places Text Search. The API key stays server-side; the browser only
 * hits our /places/geocode route. Returns null on any failure so callers fall
 * back to an honest no-coordinates state — we never fabricate a location.
 */
export async function geocodeZip(
  zip: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<{ lat: number; lng: number } | null> {
  const q = zip.trim()
  if (!q) return null
  const { fetchImpl = fetch, timeoutMs = 8000 } = opts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${PROXY_BASE}/places/geocode?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const json = (await res.json()) as {
      places?: { location?: { latitude?: number; longitude?: number } }[]
    }
    const loc = json.places?.[0]?.location
    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      return { lat: loc.latitude, lng: loc.longitude }
    }
    return null
  } catch {
    clearTimeout(timer)
    return null
  }
}

// Cache by rounded coordinates + radius so repeat views/toggles don't re-query.
const CACHE_PREFIX = 'nourish:stores:'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1h

function cacheKey(lat: number, lng: number, radiusMiles: number): string {
  return `${CACHE_PREFIX}${lat.toFixed(2)},${lng.toFixed(2)},${radiusMiles}`
}

function cacheGet(key: string): Store[] | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { expires: number; stores: Store[] }
    if (Date.now() > parsed.expires) {
      localStorage.removeItem(key)
      return null
    }
    return parsed.stores
  } catch {
    return null
  }
}

function cacheSet(key: string, stores: Store[]): void {
  try {
    localStorage.setItem(key, JSON.stringify({ expires: Date.now() + CACHE_TTL_MS, stores }))
  } catch {
    /* storage unavailable — operate without the cache */
  }
}

/** Straight-line distance in miles between two lat/lng points. */
export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8 // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** A Google Places (New) place with the fields in our minimal field mask. */
interface PlacesPlace {
  id?: string
  displayName?: { text?: string; languageCode?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  primaryType?: string
}

/** Normalize Google Places results into our Store shape, sorted by distance. */
export function normalizePlaces(
  json: unknown,
  originLat: number,
  originLng: number
): Store[] {
  const places = (json as { places?: PlacesPlace[] })?.places
  if (!Array.isArray(places)) return []

  const stores: Store[] = []
  const seen = new Set<string>()

  for (const p of places) {
    const name = p.displayName?.text
    if (!name) continue // unnamed results aren't useful to show
    const lat = p.location?.latitude
    const lng = p.location?.longitude
    if (lat === undefined || lng === undefined) continue

    // De-dupe by the stable place_id when present (the authoritative identity),
    // else by name + rounded coordinates. This collapses true duplicates while
    // keeping genuinely separate branches (different id or location).
    const coordKey = `${name.toLowerCase()}@${lat.toFixed(3)},${lng.toFixed(3)}`
    const dedupe = p.id ? `id:${p.id}` : coordKey
    if (seen.has(dedupe)) continue
    seen.add(dedupe)

    stores.push({
      // place_id is stable and exempt from Google's caching limits.
      id: p.id ?? coordKey,
      name,
      address: p.formattedAddress,
      lat,
      lng,
      distanceMiles: Math.round(haversineMiles(originLat, originLng, lat, lng) * 10) / 10,
      source: 'places',
      retailerId: matchRetailer(name),
    })
  }

  stores.sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity))
  return stores
}

export interface DiscoverOptions {
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export type DiscoveryStatus = 'ok' | 'empty' | 'error'

export interface DiscoveryResult {
  status: DiscoveryStatus
  stores: Store[]
}

/**
 * Discover real grocery stores within `radiusMiles` of the given coordinates.
 * Returns a status so the UI can show loading / empty / error states honestly
 * — on failure we never fall back to hardcoded stores.
 */
export async function discoverStores(
  lat: number,
  lng: number,
  radiusMiles: number,
  opts: DiscoverOptions = {}
): Promise<DiscoveryResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = opts

  const key = cacheKey(lat, lng, radiusMiles)
  const cached = cacheGet(key)
  if (cached) return { status: cached.length ? 'ok' : 'empty', stores: cached }

  const radiusMeters = Math.round(radiusMiles * 1609.34)
  // The proxy translates these params into an authenticated Google Places
  // searchNearby POST; the API key never reaches the browser.
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(radiusMeters),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${PROXY_BASE}/places/nearby?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timer)
    if (!res.ok) return { status: 'error', stores: [] }
    const json = (await res.json()) as unknown
    const stores = normalizePlaces(json, lat, lng)
    cacheSet(key, stores)
    return { status: stores.length ? 'ok' : 'empty', stores }
  } catch {
    clearTimeout(timer)
    return { status: 'error', stores: [] }
  }
}

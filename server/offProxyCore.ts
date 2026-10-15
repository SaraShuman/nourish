/**
 * Open Food Facts proxy core — shared by the Vite dev middleware and the
 * production serverless handler. One source of truth for:
 *   - the OFF base URL and allowed endpoints,
 *   - the required custom User-Agent,
 *   - request timeout + a single retry,
 *   - a small in-memory TTL cache to protect OFF rate limits
 *     (15 req/min reads, 10 req/min search per IP).
 *
 * This core sets the User-Agent header, which browsers are not allowed to set
 * from fetch — the primary reason a thin proxy exists at all.
 *
 * It deals ONLY with product reference data. It never fabricates price or
 * store-availability information.
 */

/** Product reads + structured v2 search live on the main OFF host. */
const OFF_BASE = 'https://world.openfoodfacts.org'
/** Full-text search uses the dedicated search-a-licious service. */
const OFF_SEARCH_BASE = 'https://search.openfoodfacts.org'
/** US Census Geocoder — reverse-geocodes coordinates to a ZIP (ZCTA5). */
const CENSUS_BASE = 'https://geocoding.geo.census.gov'
/** Google Places API (New) — discovers real nearby grocery stores.
 *  Requires a server-side API key (GOOGLE_PLACES_KEY). The browser never sees
 *  the key: the client GETs /api/off/places/nearby and this proxy performs the
 *  authenticated POST to Google on its behalf. */
const PLACES_BASE = 'https://places.googleapis.com'
/** Minimal field mask — only what we render. Keeping this lean holds the
 *  request in Google's cheaper Pro SKU and avoids charges for data we discard. */
const PLACES_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType'
/** Even leaner field mask for ZIP → coordinates (we only need the point). */
const PLACES_GEOCODE_FIELD_MASK = 'places.location,places.formattedAddress'

/** Compose the OFF-required User-Agent: "AppName/Version (contact: email)". */
export function buildUserAgent(contactEmail: string | undefined): string {
  const email = contactEmail && contactEmail.trim() ? contactEmail.trim() : 'UNSET_CONTACT'
  return `Nourish/0.1 (contact: ${email})`
}

/**
 * Allowed path prefixes, each mapped to its upstream host, so the proxy is
 * never an open relay. Full-text search is routed to search-a-licious.
 */
const ALLOWED_ROUTES: { pattern: RegExp; base: string }[] = [
  { pattern: /^\/api\/v2\/product\/[^/]+(?:\.json)?$/, base: OFF_BASE },       // barcode read
  { pattern: /^\/api\/v2\/search$/, base: OFF_BASE },                          // structured v2
  { pattern: /^\/search$/, base: OFF_SEARCH_BASE },                            // full-text (SAL)
  { pattern: /^\/census\/geocoder\/geographies\/coordinates$/, base: CENSUS_BASE }, // reverse geocode
  { pattern: /^\/places\/nearby$/, base: PLACES_BASE }, // nearby store discovery (Google Places New)
  { pattern: /^\/places\/geocode$/, base: PLACES_BASE }, // ZIP → coordinates (Places Text Search New)
]

/** Resolve the upstream base URL for a path, or null if not allowed. */
export function resolveUpstreamBase(pathname: string): string | null {
  const route = ALLOWED_ROUTES.find((r) => r.pattern.test(pathname))
  return route ? route.base : null
}

/**
 * Ordered list of upstream bases to try for a path. Every route has a single
 * upstream base. Returns [] if the path isn't allowed.
 */
export function resolveUpstreamBases(pathname: string): string[] {
  const base = resolveUpstreamBase(pathname)
  return base ? [base] : []
}

/**
 * Rewrite our proxy path to the upstream path. The Census route is namespaced
 * under "/census/..." on our side to avoid collisions; strip that prefix so
 * the real "/geocoder/..." path is forwarded. The Places route is translated
 * to Google's searchNearby endpoint.
 */
export function rewriteUpstreamPath(pathname: string): string {
  if (pathname.startsWith('/census/')) return pathname.slice('/census'.length)
  if (pathname === '/places/nearby') return '/v1/places:searchNearby'
  if (pathname === '/places/geocode') return '/v1/places:searchText'
  return pathname
}

/** True for a Places route, which needs an authenticated POST to Google. */
function isPlacesPath(pathname: string): boolean {
  return pathname === '/places/nearby' || pathname === '/places/geocode'
}

/**
 * Build the Google Places searchText POST body that resolves a bare ZIP (or
 * place query) to coordinates. Returns null when no query is provided.
 */
export function buildPlacesGeocodeRequest(query: string): { body: string } | null {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)
  const q = (params.get('q') ?? '').trim()
  if (!q) return null
  return { body: JSON.stringify({ textQuery: q, maxResultCount: 1 }) }
}

/**
 * Build the Google Places searchNearby POST body from the lat/lng/radius query
 * params the client sends. Radius is clamped to Google's 0–50000 m range.
 * Returns null if the required params are missing/invalid.
 */
export function buildPlacesRequest(
  query: string
): { body: string } | null {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)
  const latRaw = params.get('lat')
  const lngRaw = params.get('lng')
  if (!latRaw || !lngRaw) return null
  const lat = Number(latRaw)
  const lng = Number(lngRaw)
  const radiusRaw = Number(params.get('radius'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const radius = Number.isFinite(radiusRaw)
    ? Math.min(Math.max(radiusRaw, 1), 50000)
    : 8046 // ~5 miles default
  const body = JSON.stringify({
    includedTypes: ['supermarket', 'grocery_store'],
    maxResultCount: 20,
    locationRestriction: {
      circle: { center: { latitude: lat, longitude: lng }, radius },
    },
  })
  return { body }
}

export function isAllowedOffPath(pathname: string): boolean {
  return resolveUpstreamBase(pathname) !== null
}

interface CacheEntry {
  expires: number
  status: number
  body: string
}

/** Simple in-memory TTL cache. Keyed by full OFF URL (path + query). */
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const CACHE_MAX_ENTRIES = 500

function cacheGet(key: string): CacheEntry | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expires) {
    cache.delete(key)
    return null
  }
  return hit
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Evict the oldest inserted key (Map preserves insertion order).
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, entry)
}

export interface ProxyResult {
  status: number
  body: string
  fromCache: boolean
}

export interface ProxyOptions {
  /** Full request path + query as received, e.g. "/api/v2/product/123.json". */
  pathAndQuery: string
  contactEmail: string | undefined
  /** Google Places API key, server-side only. Required for the /places route. */
  placesApiKey?: string | undefined
  /** Per-request timeout in ms. */
  timeoutMs?: number
  /** Injectable fetch for testing; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

/**
 * Perform (or serve from cache) a proxied upstream request. Returns a plain
 * object so both the Node middleware and a serverless handler can shape their
 * own response. Network errors are surfaced as a 502 result so callers degrade
 * gracefully.
 */
export async function proxyOff(opts: ProxyOptions): Promise<ProxyResult> {
  const { pathAndQuery, contactEmail, fetchImpl = fetch } = opts

  const pathname = pathAndQuery.split('?')[0]
  const query = pathAndQuery.slice(pathname.length) // includes leading "?" if present
  const base = resolveUpstreamBase(pathname)
  if (!base) {
    return { status: 403, body: JSON.stringify({ error: 'path_not_allowed' }), fromCache: false }
  }

  const cacheKey = pathAndQuery
  const cached = cacheGet(cacheKey)
  if (cached) {
    return { status: cached.status, body: cached.body, fromCache: true }
  }

  const upstreamPath = rewriteUpstreamPath(pathname)

  // Google Places needs an authenticated POST with a JSON body + field mask.
  // Handled separately so the API key stays server-side and the client only
  // ever sends a simple GET /api/off/places/nearby?lat=&lng=&radius=.
  if (isPlacesPath(pathname)) {
    return proxyPlaces({ base, upstreamPath, pathname, query, opts, fetchImpl })
  }

  // Default: a plain GET to a reference-data upstream (OFF / Census).
  const timeoutMs = opts.timeoutMs ?? 4000
  const headers = {
    'User-Agent': buildUserAgent(contactEmail),
    Accept: 'application/json',
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${base}${upstreamPath}${query}`, {
      headers,
      signal: controller.signal,
    })
    clearTimeout(timer)
    const body = await res.text()
    if (res.status === 200) {
      cacheSet(cacheKey, { expires: Date.now() + CACHE_TTL_MS, status: 200, body })
    }
    return { status: res.status, body, fromCache: false }
  } catch (err) {
    clearTimeout(timer)
    return {
      status: 502,
      body: JSON.stringify({ error: 'off_unavailable', detail: String(err) }),
      fromCache: false,
    }
  }
}

/** POST to a Google Places (New) endpoint with the server-side key + mask. */
async function proxyPlaces(args: {
  base: string
  upstreamPath: string
  /** Our proxy pathname ("/places/nearby" | "/places/geocode"). */
  pathname: string
  query: string
  opts: ProxyOptions
  fetchImpl: typeof fetch
}): Promise<ProxyResult> {
  const { base, upstreamPath, pathname, query, opts, fetchImpl } = args
  const apiKey = opts.placesApiKey
  if (!apiKey) {
    return {
      status: 500,
      body: JSON.stringify({ error: 'places_key_missing' }),
      fromCache: false,
    }
  }

  // Pick the request body + field mask for the specific Places route.
  const isGeocode = pathname === '/places/geocode'
  const request = isGeocode ? buildPlacesGeocodeRequest(query) : buildPlacesRequest(query)
  if (!request) {
    return {
      status: 400,
      body: JSON.stringify({ error: 'bad_places_request' }),
      fromCache: false,
    }
  }
  const fieldMask = isGeocode ? PLACES_GEOCODE_FIELD_MASK : PLACES_FIELD_MASK

  const timeoutMs = opts.timeoutMs ?? 8000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${base}${upstreamPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: request.body,
      signal: controller.signal,
    })
    clearTimeout(timer)
    const body = await res.text()
    if (res.status === 200) {
      // Cache keyed by our proxy path + client query — never includes the key.
      cacheSet(`${pathname}${query}`, {
        expires: Date.now() + CACHE_TTL_MS,
        status: 200,
        body,
      })
    }
    return { status: res.status, body, fromCache: false }
  } catch (err) {
    clearTimeout(timer)
    return {
      status: 502,
      body: JSON.stringify({ error: 'places_unavailable', detail: String(err) }),
      fromCache: false,
    }
  }
}

/** Test-only: clear the module cache between runs. */
export function __clearOffCache(): void {
  cache.clear()
}

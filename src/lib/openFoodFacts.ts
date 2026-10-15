/**
 * Browser-side Open Food Facts client.
 *
 * Talks ONLY to our own proxy (/api/off/...), never to OFF directly — the
 * proxy sets the required User-Agent (which browsers cannot set) and shields
 * OFF's rate limits with server-side caching. This client adds a short
 * timeout, a localStorage TTL cache, and normalization into our terms.
 *
 * API usage, per OFF docs:
 *   - Barcode read:  GET /api/v2/product/<barcode>.json           (15 req/min)
 *   - Structured search: GET /api/v2/search?categories_tags=...   (10 req/min)
 *     v2 search is STRUCTURED ONLY — it has no free-text (search_term).
 *     We therefore query by category/brand tags, never raw phrases.
 *
 * This module returns product reference data only. It never implies that a
 * local store stocks or prices a product.
 */
import { normalizeOffProduct, type NormalizedOffProduct, type OffProduct } from './offNormalize'

const PROXY_BASE = '/api/off'
const DEFAULT_TIMEOUT_MS = 4500
const FIELDS = 'code,product_name,product_name_en,brands,brands_tags,categories_tags,quantity'

// ── Client-side cache (localStorage, TTL) ────────────────────────────────
const CACHE_PREFIX = 'nourish:off-cache:'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h — product reference data is stable

interface CachePayload<T> {
  expires: number
  value: T
}

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachePayload<T>
    if (Date.now() > parsed.expires) {
      localStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    return parsed.value
  } catch {
    return null
  }
}

function cacheSet<T>(key: string, value: T): void {
  try {
    const payload: CachePayload<T> = { expires: Date.now() + CACHE_TTL_MS, value }
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(payload))
  } catch {
    /* storage full / unavailable — operate without the cache */
  }
}

// ── Low-level fetch with timeout ─────────────────────────────────────────
async function getJson(
  pathAndQuery: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${PROXY_BASE}${pathAndQuery}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    // Timeout, network failure, or proxy error — degrade gracefully.
    clearTimeout(timer)
    return null
  }
}

export interface OffClientOptions {
  timeoutMs?: number
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

/**
 * Look up a single product by barcode. Returns a normalized product, or null
 * when missing/unavailable. Cached by barcode.
 */
export async function lookupByBarcode(
  barcode: string,
  opts: OffClientOptions = {}
): Promise<NormalizedOffProduct | null> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = opts
  const cacheKey = `barcode:${barcode}`
  const cached = cacheGet<NormalizedOffProduct | 'MISS'>(cacheKey)
  if (cached) return cached === 'MISS' ? null : cached

  const json = (await getJson(
    `/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
    timeoutMs,
    fetchImpl
  )) as { status?: number; product?: OffProduct } | null

  if (!json || json.status !== 1 || !json.product) {
    cacheSet(cacheKey, 'MISS')
    return null
  }
  const normalized = normalizeOffProduct(json.product)
  cacheSet(cacheKey, normalized ?? 'MISS')
  return normalized
}

export interface StructuredSearchParams {
  /** OFF category tag(s), e.g. "en:chicken-breasts". */
  categoriesTags?: string[]
  /** OFF brand tag, e.g. "perdue". */
  brandsTag?: string
  /** Max results to normalize. */
  pageSize?: number
}

/**
 * Structured category/brand search via OFF v2 (NOT free-text). Returns up to
 * `pageSize` normalized products. Empty array on miss/unavailable.
 */
export async function searchByCategoryBrand(
  params: StructuredSearchParams,
  opts: OffClientOptions = {}
): Promise<NormalizedOffProduct[]> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = opts
  const { categoriesTags = [], brandsTag, pageSize = 5 } = params

  const query = new URLSearchParams()
  if (categoriesTags.length) query.set('categories_tags', categoriesTags.join(','))
  if (brandsTag) query.set('brands_tags', brandsTag)
  query.set('fields', FIELDS)
  query.set('page_size', String(pageSize))
  // Deterministic ordering so cache keys and tests are stable.
  query.set('sort_by', 'unique_scans_n')

  const cacheKey = `search:${query.toString()}`
  const cached = cacheGet<NormalizedOffProduct[]>(cacheKey)
  if (cached) return cached

  const json = (await getJson(`/api/v2/search?${query.toString()}`, timeoutMs, fetchImpl)) as
    | { products?: OffProduct[] }
    | null

  if (!json || !Array.isArray(json.products)) {
    cacheSet(cacheKey, [])
    return []
  }

  const normalized = json.products
    .map(normalizeOffProduct)
    .filter((p): p is NormalizedOffProduct => p !== null)
    .slice(0, pageSize)

  cacheSet(cacheKey, normalized)
  return normalized
}

export interface TextSearchParams {
  /** Free-text query, e.g. "diet coke". */
  query: string
  /** Max hits to request/normalize. */
  pageSize?: number
}

/** Shape of a search-a-licious hit (fields requested below). */
interface SalHit {
  code?: string
  product_name?: string
  brands?: string[]
  categories_tags?: string[]
  quantity?: string
}

/**
 * Full-text product search via Open Food Facts search-a-licious.
 *
 * v2 search has no free-text support, so branded product names ("Diet Coke")
 * are resolved here. Returns normalized products, DEDUPED so the same product
 * appearing under several database entries/barcodes is collapsed to one.
 * Empty array on miss/unavailable (graceful degradation).
 */
export async function searchByText(
  params: TextSearchParams,
  opts: OffClientOptions = {}
): Promise<NormalizedOffProduct[]> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = opts
  const q = params.query.trim()
  if (!q) return []
  const pageSize = params.pageSize ?? 20

  const query = new URLSearchParams()
  query.set('q', q)
  query.set('page_size', String(pageSize))
  query.set('fields', 'code,product_name,brands,categories_tags,quantity')

  const cacheKey = `textsearch:${query.toString()}`
  const cached = cacheGet<NormalizedOffProduct[]>(cacheKey)
  if (cached) return cached

  const json = (await getJson(`/search?${query.toString()}`, timeoutMs, fetchImpl)) as
    | { hits?: SalHit[] }
    | null

  if (!json || !Array.isArray(json.hits)) {
    cacheSet(cacheKey, [])
    return []
  }

  const normalized = json.hits
    .map((h) =>
      normalizeOffProduct({
        code: h.code,
        product_name: h.product_name,
        brands: h.brands,
        categories_tags: h.categories_tags,
        quantity: h.quantity,
      })
    )
    .filter((p): p is NormalizedOffProduct => p !== null)

  const deduped = dedupeProducts(normalized)
  cacheSet(cacheKey, deduped)
  return deduped
}

/**
 * Collapse duplicate products. Two OFF entries are "the same product" when
 * their normalized name + brand + package size agree (case-insensitive). The
 * first occurrence (highest search relevance) is kept.
 */
export function dedupeProducts(products: NormalizedOffProduct[]): NormalizedOffProduct[] {
  const seen = new Set<string>()
  const out: NormalizedOffProduct[] = []
  for (const p of products) {
    const key = [
      p.name.toLowerCase().replace(/\s+/g, ' ').trim(),
      p.brand.toLowerCase().trim(),
      (p.packageSize ?? '').toLowerCase().replace(/\s+/g, '').trim(),
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

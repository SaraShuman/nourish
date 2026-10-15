/**
 * Google Places proxy behavior in the proxy core. The client sends a simple
 * GET /places/nearby?lat=&lng=&radius=; the proxy must translate that into an
 * authenticated POST to Google with the server-side key + a minimal field mask,
 * keep the key off the client, and surface failures honestly (never fabricate).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  proxyOff,
  __clearOffCache,
  resolveUpstreamBases,
  buildPlacesRequest,
  buildPlacesGeocodeRequest,
} from '../../server/offProxyCore'

const PLACES_PATH = '/places/nearby?lat=34.0152&lng=-118.4918&radius=8046'

beforeEach(() => __clearOffCache())

/** A fetch stub that records the request it received. */
function recordingStub(response: { status: number; body?: string }): typeof fetch {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const { status, body = '{}' } = response
    void init
    return {
      ok: status === 200,
      status,
      text: async () => body,
    } as unknown as Response
  }) as unknown as typeof fetch
}

describe('resolveUpstreamBases', () => {
  it('resolves a single Google base for the places route', () => {
    const bases = resolveUpstreamBases('/places/nearby')
    expect(bases).toHaveLength(1)
    expect(bases[0]).toContain('places.googleapis.com')
  })
})

describe('buildPlacesRequest', () => {
  it('builds a circle request from lat/lng/radius and clamps the radius', () => {
    const req = buildPlacesRequest('?lat=34&lng=-118&radius=99999')
    expect(req).not.toBeNull()
    const body = JSON.parse(req!.body)
    expect(body.includedTypes).toContain('supermarket')
    expect(body.includedTypes).toContain('grocery_store')
    expect(body.locationRestriction.circle.center).toEqual({ latitude: 34, longitude: -118 })
    expect(body.locationRestriction.circle.radius).toBe(50000) // clamped to Google's max
  })

  it('returns null for missing/invalid coordinates', () => {
    expect(buildPlacesRequest('?radius=1000')).toBeNull()
    expect(buildPlacesRequest('?lat=abc&lng=-118&radius=1000')).toBeNull()
  })
})

describe('proxyOff — Google Places route', () => {
  it('POSTs to Google with the API key + field mask and a JSON body', async () => {
    const fetchImpl = recordingStub({ status: 200, body: '{"places":[]}' })
    const result = await proxyOff({
      pathAndQuery: PLACES_PATH,
      contactEmail: 'x@y.z',
      placesApiKey: 'secret-key',
      fetchImpl,
    })
    expect(result.status).toBe(200)
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toHaveLength(1)
    const [url, init] = calls[0]
    expect(url).toContain('places.googleapis.com')
    expect(url).toContain('/v1/places:searchNearby')
    expect(init.method).toBe('POST')
    expect(init.headers['X-Goog-Api-Key']).toBe('secret-key')
    expect(init.headers['X-Goog-FieldMask']).toContain('places.displayName')
    expect(init.headers['X-Goog-FieldMask']).toContain('places.location')
    const sentBody = JSON.parse(init.body)
    expect(sentBody.locationRestriction.circle.center.latitude).toBe(34.0152)
  })

  it('never exposes the key to the client (not in the response body)', async () => {
    const fetchImpl = recordingStub({ status: 200, body: '{"places":[]}' })
    const result = await proxyOff({
      pathAndQuery: PLACES_PATH,
      contactEmail: 'x@y.z',
      placesApiKey: 'secret-key',
      fetchImpl,
    })
    expect(result.body).not.toContain('secret-key')
  })

  it('returns 500 when the key is missing (and does not call Google)', async () => {
    const fetchImpl = recordingStub({ status: 200 })
    const result = await proxyOff({
      pathAndQuery: PLACES_PATH,
      contactEmail: 'x@y.z',
      placesApiKey: undefined,
      fetchImpl,
    })
    expect(result.status).toBe(500)
    expect(result.body).toContain('places_key_missing')
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
  })

  it('returns 400 for a request missing coordinates', async () => {
    const fetchImpl = recordingStub({ status: 200 })
    const result = await proxyOff({
      pathAndQuery: '/places/nearby?radius=1000',
      contactEmail: 'x@y.z',
      placesApiKey: 'secret-key',
      fetchImpl,
    })
    expect(result.status).toBe(400)
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
  })

  it('surfaces an upstream error status, never fabricated data', async () => {
    const fetchImpl = recordingStub({ status: 403, body: '{"error":{"code":403}}' })
    const result = await proxyOff({
      pathAndQuery: PLACES_PATH,
      contactEmail: 'x@y.z',
      placesApiKey: 'secret-key',
      fetchImpl,
    })
    expect(result.status).toBe(403)
    expect(result.body).not.toContain('"places":[{')
  })

  it('returns 502 (not 200) when the Google request throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    const result = await proxyOff({
      pathAndQuery: PLACES_PATH,
      contactEmail: 'x@y.z',
      placesApiKey: 'secret-key',
      fetchImpl,
    })
    expect(result.status).toBe(502)
    expect(result.body).toContain('places_unavailable')
  })
})

describe('buildPlacesGeocodeRequest', () => {
  it('builds a Text Search body from the ZIP query', () => {
    const req = buildPlacesGeocodeRequest('?q=90272')
    expect(req).not.toBeNull()
    const body = JSON.parse(req!.body)
    expect(body.textQuery).toBe('90272')
    expect(body.maxResultCount).toBe(1)
  })

  it('returns null when no query is provided', () => {
    expect(buildPlacesGeocodeRequest('')).toBeNull()
    expect(buildPlacesGeocodeRequest('?q=')).toBeNull()
  })
})

describe('proxyOff — Google Places geocode (ZIP → coordinates)', () => {
  const GEOCODE_PATH = '/places/geocode?q=90272'

  it('POSTs to searchText with the key + a lean location field mask', async () => {
    const fetchImpl = recordingStub({
      status: 200,
      body: '{"places":[{"location":{"latitude":34.08,"longitude":-118.54}}]}',
    })
    const result = await proxyOff({
      pathAndQuery: GEOCODE_PATH,
      contactEmail: 'x@y.z',
      placesApiKey: 'secret-key',
      fetchImpl,
    })
    expect(result.status).toBe(200)
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('/v1/places:searchText')
    expect(init.method).toBe('POST')
    expect(init.headers['X-Goog-Api-Key']).toBe('secret-key')
    expect(init.headers['X-Goog-FieldMask']).toContain('places.location')
    expect(init.headers['X-Goog-FieldMask']).not.toContain('displayName')
    expect(JSON.parse(init.body).textQuery).toBe('90272')
    expect(result.body).not.toContain('secret-key')
  })

  it('returns 400 when the ZIP query is missing', async () => {
    const fetchImpl = recordingStub({ status: 200 })
    const result = await proxyOff({
      pathAndQuery: '/places/geocode',
      contactEmail: 'x@y.z',
      placesApiKey: 'secret-key',
      fetchImpl,
    })
    expect(result.status).toBe(400)
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
  })

  it('resolves to a single Google base', () => {
    expect(resolveUpstreamBases('/places/geocode')).toHaveLength(1)
    expect(resolveUpstreamBases('/places/geocode')[0]).toContain('places.googleapis.com')
  })
})

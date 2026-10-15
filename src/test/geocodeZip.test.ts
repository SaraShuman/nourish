/**
 * ZIP → coordinates via the proxied Google Places Text Search. A valid ZIP not
 * in the built-in centroid table (e.g. 90272) must still resolve, instead of
 * falling into the "we need a location" state. Failures resolve to null so the
 * caller stays honest and never fabricates a location.
 */
import { describe, it, expect, vi } from 'vitest'
import { geocodeZip } from '../lib/storeDiscovery'

function stub(response: { ok?: boolean; json?: unknown; reject?: boolean }): typeof fetch {
  return vi.fn(async (_url: string) => {
    if (response.reject) throw new Error('network down')
    return {
      ok: response.ok ?? true,
      status: response.ok === false ? 500 : 200,
      json: async () => response.json ?? {},
    } as unknown as Response
  }) as unknown as typeof fetch
}

describe('geocodeZip', () => {
  it('resolves a ZIP to coordinates from the proxy response', async () => {
    const fetchImpl = stub({
      json: { places: [{ location: { latitude: 34.0845, longitude: -118.5448 } }] },
    })
    const coords = await geocodeZip('90272', { fetchImpl })
    expect(coords).toEqual({ lat: 34.0845, lng: -118.5448 })
    // Hits the proxy geocode route with the ZIP as the query.
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toContain('/api/off/places/geocode?q=90272')
  })

  it('returns null for an empty ZIP (no request made)', async () => {
    const fetchImpl = stub({ json: {} })
    expect(await geocodeZip('   ', { fetchImpl })).toBeNull()
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
  })

  it('returns null when the proxy has no result (never fabricates)', async () => {
    expect(await geocodeZip('00000', { fetchImpl: stub({ json: { places: [] } }) })).toBeNull()
  })

  it('returns null on a non-OK response or a network error', async () => {
    expect(await geocodeZip('90272', { fetchImpl: stub({ ok: false }) })).toBeNull()
    expect(await geocodeZip('90272', { fetchImpl: stub({ reject: true }) })).toBeNull()
  })
})

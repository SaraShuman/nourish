import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reverseGeocodeZip, extractZip } from '../lib/reverseGeocode'

beforeEach(() => localStorage.clear())

/** A Census-shaped response carrying a ZCTA5 ZIP. */
function censusResponse(zip?: string) {
  return {
    result: {
      geographies: {
        '2020 Census ZIP Code Tabulation Areas': zip ? [{ ZCTA5: zip }] : [],
      },
    },
  }
}

function jsonFetch(body: unknown, ok = true): typeof fetch {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch
}

describe('extractZip', () => {
  it('reads a 5-digit ZCTA5', () => {
    expect(extractZip(censusResponse('90401'))).toBe('90401')
  })
  it('returns null when absent or malformed', () => {
    expect(extractZip(censusResponse())).toBeNull()
    expect(extractZip(censusResponse('9040'))).toBeNull()
    expect(extractZip({})).toBeNull()
    expect(extractZip(null)).toBeNull()
  })
})

describe('reverseGeocodeZip', () => {
  it('resolves a ZIP from coordinates and hits the census proxy route', async () => {
    const fetchImpl = jsonFetch(censusResponse('90401'))
    const zip = await reverseGeocodeZip(34.0195, -118.4912, { fetchImpl })
    expect(zip).toBe('90401')
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('/api/off/census/geocoder/geographies/coordinates?')
    expect(url).toContain('x=-118.4912')
    expect(url).toContain('y=34.0195')
  })

  it('returns null (never fabricates) when no ZIP is found', async () => {
    expect(await reverseGeocodeZip(0, 0, { fetchImpl: jsonFetch(censusResponse()) })).toBeNull()
  })

  it('returns null on a non-OK response', async () => {
    expect(await reverseGeocodeZip(1, 1, { fetchImpl: jsonFetch({}, false) })).toBeNull()
  })

  it('returns null on network failure/timeout without throwing', async () => {
    const failing = vi.fn(async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    expect(await reverseGeocodeZip(1, 1, { fetchImpl: failing })).toBeNull()
  })

  it('caches by rounded coordinates (second call does not hit the network)', async () => {
    const fetchImpl = jsonFetch(censusResponse('10001'))
    await reverseGeocodeZip(40.7484, -73.9857, { fetchImpl })
    await reverseGeocodeZip(40.7484, -73.9857, { fetchImpl })
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })
})

/**
 * Approximate centroid coordinates for a small set of US ZIP codes.
 *
 * Why this exists: turning a bare ZIP into coordinates needs a geocoder that
 * accepts ZIP-only input. The Census `onelineaddress` geocoder matches STREET
 * addresses (it returns no match for a bare ZIP), and public ZIP geocoders
 * (Nominatim, etc.) rate-limit/forbid anonymous use. For a credit-efficient,
 * deterministic, offline-safe MVP we ship centroids for the ZIPs the demo
 * uses. Unknown ZIPs fall back to an honest "couldn't locate that ZIP" state —
 * we never invent a location.
 *
 * Coordinates are public ZCTA centroids (approximate; fine for a ~5–15 mi
 * store search). Extend this table as needed, or swap in a real geocoder.
 */

export interface ZipCentroid {
  lat: number
  lng: number
  /** City/area label, for display/debugging. */
  area: string
}

export const ZIP_CENTROIDS: Record<string, ZipCentroid> = {
  // Los Angeles area
  '90401': { lat: 34.0152, lng: -118.4918, area: 'Santa Monica, CA' },
  '90012': { lat: 34.0614, lng: -118.2385, area: 'Los Angeles, CA' },
  '90210': { lat: 34.1030, lng: -118.4105, area: 'Beverly Hills, CA' },
  '91101': { lat: 34.1478, lng: -118.1445, area: 'Pasadena, CA' },
  '90802': { lat: 33.7693, lng: -118.1912, area: 'Long Beach, CA' },
  // San Francisco Bay Area
  '94103': { lat: 37.7726, lng: -122.4099, area: 'San Francisco, CA' },
  '94612': { lat: 37.8094, lng: -122.2698, area: 'Oakland, CA' },
  // New York
  '10001': { lat: 40.7506, lng: -73.9972, area: 'New York, NY' },
  '11201': { lat: 40.6939, lng: -73.9903, area: 'Brooklyn, NY' },
  // Chicago
  '60601': { lat: 41.8858, lng: -87.6229, area: 'Chicago, IL' },
  // Seattle
  '98101': { lat: 47.6113, lng: -122.3360, area: 'Seattle, WA' },
  // Austin
  '78701': { lat: 30.2711, lng: -97.7437, area: 'Austin, TX' },
}

/** Centroid coordinates for a ZIP, or null when we don't have it. */
export function zipCentroid(zip: string): { lat: number; lng: number } | null {
  const c = ZIP_CENTROIDS[zip.trim()]
  return c ? { lat: c.lat, lng: c.lng } : null
}

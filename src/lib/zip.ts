/**
 * US ZIP-code helpers.
 *
 * NOTE: This validates FORMAT only (five digits). It does not confirm the ZIP
 * exists or map it to a city/stores — that requires a geocoding/store provider
 * we don't have yet. We never fabricate a city or store from a ZIP.
 */

/** Keep only digits and cap at five, for use while typing. */
export function normalizeZipInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 5)
}

/** True when the value is exactly five digits. */
export function isValidZip(value: string): boolean {
  return /^\d{5}$/.test(value.trim())
}

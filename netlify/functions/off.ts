/**
 * Netlify Function entry for the Open Food Facts / Google Places proxy.
 *
 * This is a thin wrapper: the real logic lives in server/api/off.ts, written
 * against the Web Fetch API (Request -> Response), which Netlify Functions
 * support natively. The server-side secrets (GOOGLE_PLACES_KEY, OFF_CONTACT)
 * are read from the function's environment — set them in the Netlify dashboard.
 * They are NEVER shipped to the browser.
 *
 * Routing: netlify.toml redirects /api/off/* to /.netlify/functions/off, and
 * the handler reads the full "/api/off/..." path from the request URL. The
 * `path` config below also mounts the function directly at /api/off/* so the
 * original pathname is preserved for the proxy's allow-list matching.
 */
import { handler } from '../../server/api/off'

export default async function (request: Request): Promise<Response> {
  return handler(request)
}

// Mount the function on the public API path so request.url keeps "/api/off/...".
export const config = {
  path: '/api/off/*',
}

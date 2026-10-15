/**
 * Production serverless handler for the Open Food Facts proxy.
 *
 * Written against the Web Fetch API (Request -> Response) so it runs on
 * Vercel (Edge or Node), Netlify Functions, and Cloudflare Workers with a
 * thin adapter. It shares server/offProxyCore.ts with the Vite dev plugin so
 * local and production behavior match exactly.
 *
 * Deploy notes (portfolio MVP):
 *   - Vercel:    place at /api/off.ts (Edge: `export const config = { runtime: 'edge' }`)
 *                and route /api/off/* -> this function via vercel.json rewrite.
 *   - Netlify:   wrap with a small handler that converts the Lambda event to a
 *                Request and this Response back; set redirect /api/off/* .
 *   - Cloudflare: export default { fetch: handler }.
 *
 * Set the OFF_CONTACT environment variable to your real contact email in the
 * host's dashboard. It is read server-side only and never exposed to clients.
 */
import { proxyOff } from '../offProxyCore'

const MOUNT = '/api/off'

export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (!url.pathname.startsWith(MOUNT)) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Everything after the mount prefix is the OFF path; keep the query string.
  const pathAndQuery = (url.pathname.slice(MOUNT.length) || '/') + url.search
  const contactEmail = process.env.OFF_CONTACT ?? process.env.VITE_OFF_CONTACT
  const placesApiKey = process.env.GOOGLE_PLACES_KEY

  const result = await proxyOff({ pathAndQuery, contactEmail, placesApiKey })

  return new Response(result.body, {
    status: result.status,
    headers: {
      'Content-Type': 'application/json',
      'X-Off-Cache': result.fromCache ? 'hit' : 'miss',
      // Allow the SPA origin to read the response in production if hosted
      // on a different subdomain; same-origin deploys ignore this.
      'Cache-Control': 'public, max-age=600',
    },
  })
}

// Convenience default export for hosts that expect `{ fetch }` or a default fn.
export default handler

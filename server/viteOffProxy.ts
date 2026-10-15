/**
 * Vite dev-server plugin that proxies Open Food Facts requests during
 * development. Mirrors the production serverless handler (server/api/off.ts)
 * so behavior is identical locally and in prod.
 *
 * Client calls:   /api/off/api/v2/product/<barcode>.json
 *                 /api/off/api/v2/search?<structured query>
 * which maps to:  OFF /api/v2/...  (see offProxyCore.ALLOWED_PATHS)
 */
import type { Plugin, Connect } from 'vite'
import { proxyOff } from './offProxyCore'

const MOUNT = '/api/off'

export function offProxyPlugin(): Plugin {
  return {
    name: 'nourish-off-proxy',
    configureServer(server) {
      const handler: Connect.NextHandleFunction = (req, res, next) => {
        const rawUrl = req.url ?? ''
        if (!rawUrl.startsWith(MOUNT)) return next()

        // Strip the mount prefix to get the OFF path + query.
        const pathAndQuery = rawUrl.slice(MOUNT.length) || '/'
        // Secrets come from the server env (never shipped to the client).
        const contactEmail = process.env.OFF_CONTACT ?? process.env.VITE_OFF_CONTACT
        const placesApiKey = process.env.GOOGLE_PLACES_KEY

        proxyOff({ pathAndQuery, contactEmail, placesApiKey })
          .then((result) => {
            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('X-Off-Cache', result.fromCache ? 'hit' : 'miss')
            res.end(result.body)
          })
          .catch((err) => {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'proxy_error', detail: String(err) }))
          })
      }

      server.middlewares.use(handler)
    },
  }
}

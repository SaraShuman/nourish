/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { resolve } from 'path'
import { offProxyPlugin } from './server/viteOffProxy'

export default defineConfig(({ mode }) => {
  // Load server-side secrets from .env into process.env for the dev proxy.
  // ("" prefix = load ALL vars, not just VITE_*.) These stay server-side and
  // are never injected into client code. Inline shell env takes precedence.
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['OFF_CONTACT', 'GOOGLE_PLACES_KEY']) {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [
      react(),
      svgr(), // enables `import MySvg from './file.svg?react'`
      offProxyPlugin(), // dev proxy (OFF reference data + Google Places discovery)
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})

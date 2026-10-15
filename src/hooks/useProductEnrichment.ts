/**
 * Drives on-demand Open Food Facts enrichment for the grocery list.
 *
 * Deliberately NOT per-keystroke. Enrichment runs once per item (those not
 * yet `enriched`), after a short debounce, and bursts are spaced out to stay
 * well under OFF's rate limits. In-flight work is cancelled on unmount.
 *
 * The hook is additive: it reports enriched items back via `onEnrich` so the
 * owner (useGroceryList) can merge them. It renders nothing and changes no
 * layout.
 */
import { useEffect, useRef } from 'react'
import type { GroceryItem } from '../data/types'
import { enrichItem } from '../lib/enrichItems'

interface UseProductEnrichmentOptions {
  items: GroceryItem[]
  /** Map of item id -> raw fragment, for ambiguity detection. */
  fragments: Record<string, string>
  /** Called with a single enriched item to merge into state. */
  onEnrich: (item: GroceryItem) => void
  /** Debounce before starting a pass (ms). */
  debounceMs?: number
  /** Minimum spacing between per-item network calls (ms). */
  spacingMs?: number
  /** Disable (e.g. in tests that don't want network). Default true. */
  enabled?: boolean
}

export function useProductEnrichment({
  items,
  fragments,
  onEnrich,
  debounceMs = 400,
  spacingMs = 250,
  enabled = true,
}: UseProductEnrichmentOptions): void {
  // Track ids we've already dispatched so we never re-enrich the same row.
  const processed = useRef<Set<string>>(new Set())
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const pending = items.filter(
      (it) => !it.enriched && !processed.current.has(it.id)
    )
    if (pending.length === 0) return

    const timer = setTimeout(async () => {
      for (const item of pending) {
        if (cancelled.current) return
        processed.current.add(item.id)
        try {
          const enriched = await enrichItem(item, {
            fragment: fragments[item.id] ?? item.name,
          })
          if (!cancelled.current) onEnrich(enriched)
        } catch {
          // enrichItem already degrades gracefully; ignore to avoid breaking
          // the list if something unexpected happens.
        }
        // Space out network bursts to respect rate limits.
        await new Promise((r) => setTimeout(r, spacingMs))
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [items, fragments, onEnrich, enabled, debounceMs, spacingMs])
}

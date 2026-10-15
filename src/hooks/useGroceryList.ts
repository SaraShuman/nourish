import { useCallback, useEffect, useState } from 'react'
import type { GroceryItem, ListPreferences } from '../data/types'
import { parseGroceryList } from '../lib/parseGroceryList'
import { splitNameAndSize } from '../lib/offNormalize'

const RAW_INPUT_KEY = 'nourish:raw-input'
const LIST_KEY = 'nourish:grocery-list'
const PREFS_KEY = 'nourish:list-prefs'
/** The raw Welcome input the saved list was last seeded from. */
const SEED_KEY = 'nourish:raw-input-seed'

const DEFAULT_PREFS: ListPreferences = {
  allowBrandSubstitutions: false, // default OFF, per spec
}

let addCounter = 0
function makeRowId(): string {
  addCounter += 1
  return `row-add-${Date.now().toString(36)}-${addCounter}`
}

/**
 * Heal items persisted by older logic: if a resolved OFF product's name has a
 * package size baked into it (e.g. "Diet Coke - 6pk/16.9 fl oz"), split it so
 * the displayed title is clean and the size lives in `packageSize`.
 */
function sanitizeSavedItem(item: GroceryItem): GroceryItem {
  let changed = false
  const next: GroceryItem = { ...item }

  // Clean a package size baked into the product name.
  const split = splitNameAndSize(item.name)
  if (split.name !== item.name) {
    next.name = split.name
    next.packageSize = item.packageSize ?? split.size
    changed = true
  }

  // Clean the same baked-in size out of any stored candidate names, moving it
  // to the candidate's `packaging` when that's empty.
  if (item.candidates && item.candidates.length) {
    const cleanedCandidates = item.candidates.map((c) => {
      const cs = splitNameAndSize(c.name)
      if (cs.name === c.name) return c
      changed = true
      return { ...c, name: cs.name, packaging: c.packaging ?? cs.size }
    })
    if (changed) next.candidates = cleanedCandidates
  }

  return changed ? next : item
}

function loadList(): GroceryItem[] {
  const raw = localStorage.getItem(RAW_INPUT_KEY) ?? ''

  // Use the previously edited (and persisted) list ONLY when it is still
  // valid for the current Welcome input — i.e. the list was seeded from the
  // same raw text. This preserves in-list edits across normal back/forward
  // navigation, while a fresh Welcome submission (which clears the saved
  // list via resetListFromInput) forces a re-parse below.
  const seededFrom = localStorage.getItem(SEED_KEY)
  if (seededFrom !== null && seededFrom === raw) {
    try {
      const saved = localStorage.getItem(LIST_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as GroceryItem[]
        if (Array.isArray(parsed)) return parsed.map(sanitizeSavedItem)
      }
    } catch {
      /* fall through to re-seeding */
    }
  }

  // Seed (or re-seed) from the raw input and record what we seeded from.
  localStorage.setItem(SEED_KEY, raw)
  return parseGroceryList(raw)
}

/**
 * Rebuild the saved grocery list from the given raw Welcome input.
 *
 * Called when the user submits the Welcome screen ("Find my savings") so the
 * review list always reflects what they just typed — even if the text is
 * identical to a previous submission or they had emptied the list. This is
 * the single source of truth for turning Welcome input into the list.
 */
export function resetListFromInput(raw: string): void {
  localStorage.setItem(RAW_INPUT_KEY, raw)
  localStorage.setItem(SEED_KEY, raw)
  localStorage.setItem(LIST_KEY, JSON.stringify(parseGroceryList(raw)))
}

function loadPrefs(): ListPreferences {
  try {
    const saved = localStorage.getItem(PREFS_KEY)
    if (saved) return { ...DEFAULT_PREFS, ...JSON.parse(saved) }
  } catch {
    /* use defaults */
  }
  return DEFAULT_PREFS
}

export interface UseGroceryListReturn {
  items: GroceryItem[]
  prefs: ListPreferences
  updateItem: (id: string, patch: Partial<GroceryItem>) => void
  removeItem: (id: string) => void
  addItem: () => void
  setAllowSubstitutions: (allow: boolean) => void
  /**
   * Merge an OFF-enriched item back into the list by id. Only fills/annotates
   * the matching row; if the row is gone (removed), it's a no-op. Preserves
   * any edits the user made in the meantime by applying enrichment as a patch
   * that never overrides user-editable identity fields.
   */
  mergeEnriched: (enriched: GroceryItem) => void
}

/**
 * Owns the editable grocery list and list preferences, persisting both to
 * localStorage. Seeds the list from the raw Welcome input on first visit.
 */
export function useGroceryList(): UseGroceryListReturn {
  const [items, setItems] = useState<GroceryItem[]>(loadList)
  const [prefs, setPrefs] = useState<ListPreferences>(loadPrefs)

  // Persist whenever either changes.
  useEffect(() => {
    localStorage.setItem(LIST_KEY, JSON.stringify(items))
  }, [items])

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  }, [prefs])

  const updateItem = useCallback((id: string, patch: Partial<GroceryItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }, [])

  const addItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      {
        id: makeRowId(),
        catalogId: null,
        name: '',
        quantity: 1,
        unit: 'each',
        brand: '',
        category: 'other',
        recognized: false,
      },
    ])
  }, [])

  const setAllowSubstitutions = useCallback((allow: boolean) => {
    setPrefs((prev) => ({ ...prev, allowBrandSubstitutions: allow }))
  }, [])

  const mergeEnriched = useCallback((enriched: GroceryItem) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== enriched.id) return it
        // Adopt the enrichment OUTCOME (identity, recognition, candidates,
        // deferral flags) while protecting the shopper's quick edits that can
        // happen before enrichment resolves: purchase quantity, chosen unit,
        // and an explicitly set brand are preserved from the current item.
        return {
          ...enriched,
          quantity: it.quantity,
          unit: it.unit,
          brand: it.brand ? it.brand : enriched.brand,
          enriched: true,
        }
      })
    )
  }, [])

  return {
    items,
    prefs,
    updateItem,
    removeItem,
    addItem,
    setAllowSubstitutions,
    mergeEnriched,
  }
}

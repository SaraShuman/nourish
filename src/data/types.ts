/**
 * Grocery-recognition domain types.
 *
 * IMPORTANT: These types describe the user's grocery list and the static
 * recognition catalog ONLY. They intentionally contain NO prices and NO
 * retailer references — retailer products and simulated prices live in a
 * separate module (future milestone) to keep recognition independent of
 * pricing/comparison logic.
 */

export type GroceryCategory =
  | 'produce'
  | 'dairy'
  | 'meat'
  | 'seafood'
  | 'bakery'
  | 'pantry'
  | 'frozen'
  | 'beverages'
  | 'snacks'
  | 'other'

/** A static entry in the recognition catalog. */
export interface CatalogItem {
  /** Stable identifier, e.g. "bananas". */
  id: string
  /** Display name, e.g. "Bananas". */
  canonicalName: string
  category: GroceryCategory
  /** Lowercase alternate spellings/singulars used for matching. */
  aliases: string[]
  /** The unit pre-selected when this item is recognized. */
  defaultUnit: string
  /** Units offered in the unit dropdown for this item. */
  units: string[]
  /** Grocery brand options (NOT retailers). Empty = generic item. */
  brands: string[]
  /** Optional emoji override; otherwise the category emoji is used. */
  emoji?: string
}

/**
 * A candidate product variant offered when a request is ambiguous (e.g.
 * "chicken"). Surfaced to the user for selection — we never silently pick one.
 * Candidates may come from the local catalog or Open Food Facts.
 */
export interface ProductCandidate {
  /** Local catalog id when the candidate is a catalog item, else null. */
  catalogId: string | null
  /** Display name, e.g. "Chicken Breast" or "Diet Coke". */
  name: string
  category: GroceryCategory
  /** Suggested brand, or "" for none. */
  brand: string
  /** Open Food Facts barcode when the candidate originated from OFF. */
  barcode?: string
  /**
   * Package configuration from OFF, e.g. "12 x 355 ml" or "2 L". Shown to the
   * user as a distinguishing detail; NOT the purchase quantity.
   */
  packaging?: string
  /** Where this candidate came from. */
  source: 'catalog' | 'off'
  /**
   * A short label describing what makes this candidate different from the
   * others (variant, package size, or flavor), for compact display.
   */
  distinguisher?: string
}

/** A single editable row in the user's grocery list. */
export interface GroceryItem {
  /** Unique per row (not the catalog id — the list can hold duplicates). */
  id: string
  /** Matched catalog id, or null when the item was not recognized. */
  catalogId: string | null
  /** Editable display name. */
  name: string
  quantity: number
  unit: string
  /** Selected grocery brand; "" means "Any brand". */
  brand: string
  category: GroceryCategory
  /** False when the parser could not match the item — kept for user review. */
  recognized: boolean

  // ── Optional Open Food Facts enrichment (all optional; absent by default) ──
  // These NEVER imply local store availability or price — OFF is product
  // reference data only, kept separate from the retailer/pricing module.

  /** Open Food Facts barcode (EAN/UPC) when a specific product was matched. */
  barcode?: string
  /** Human-readable package size from OFF, e.g. "1.5 lb", "907 g". */
  packageSize?: string
  /**
   * Package CONFIGURATION the shopper wants, e.g. "12-pack" or "2 L bottle".
   * This is intentionally SEPARATE from `quantity` (how many packages to buy)
   * so later pricing can reason about per-package vs. per-unit cost. A
   * "12-pack" is ONE package containing 12, not quantity 12.
   */
  packaging?: string
  /**
   * True only when the shopper EXPLICITLY stated an amount (typed a number,
   * or adjusted the stepper). When false/absent, `quantity` holds a neutral
   * starting value (1) that must NOT be presented as a requested amount — the
   * UI shows "Weight not specified" and clarification is deferred to Compare.
   */
  quantitySpecified?: boolean
  /**
   * True when the request could match multiple distinct products/variants
   * (e.g. "chicken"). The item is preserved and flagged for the user to
   * clarify — we do not guess a variant. Pairs with `candidates`.
   */
  ambiguous?: boolean
  /** Candidate products offered for an ambiguous request. */
  candidates?: ProductCandidate[]
  /** Marks that OFF enrichment has already been attempted for this row. */
  enriched?: boolean
  /**
   * True when the product is identified but its PACKAGE SIZE is unspecified
   * and the available OFF matches differ mainly by size (e.g. "Diet Coke"
   * with 6-pack / 12-pack / 2 L options). Unlike `ambiguous`, this does NOT
   * block continuing — the choice is deferred to pricing time (Screen 4).
   * The shopper's wording is preserved and `candidates` are kept in state.
   */
  needsPackageChoice?: boolean
  /**
   * The original raw text fragment this row was parsed from (e.g. "2 lb
   * boneless chicken breast"). Used by OFF enrichment to detect ambiguity
   * against the user's actual words, not the resolved catalog name.
   */
  sourceText?: string
  /**
   * Optional emoji override for the item's icon. Used for ambiguous items
   * (no catalogId) so the icon reflects the requested food (e.g. 🍗 for a
   * general "chicken") instead of the generic category emoji.
   */
  emoji?: string
  /**
   * Chosen pasta SHAPE for a pasta item (e.g. "penne", "spaghetti"), or
   * undefined for "Any type". This is a shape preference only — pricing is
   * still keyed by the `pasta` catalog id, so the type never changes the
   * price, but it is carried through display and the itemized breakdown.
   * "Any type" (undefined) means the shopper is flexible; it is NOT a licence
   * to substitute a different shape when one was explicitly chosen.
   */
  pastaType?: string
}

/** List-level preferences persisted alongside the grocery list. */
export interface ListPreferences {
  /**
   * When false (default), a requested brand must be matched exactly.
   * When true, comparable alternatives may be suggested (clearly labeled).
   */
  allowBrandSubstitutions: boolean
}

/* ============================================================
   Location & store discovery (Screen 3)
   ============================================================ */

/** Shopping-radius options (miles). */
export type RadiusMiles = 5 | 10 | 15

/** How the shopper specified their location. */
export type LocationMethod = 'geo' | 'zip'

/**
 * The shopper's chosen location + shopping radius. Persisted to localStorage.
 * Geolocation yields coordinates only (no city/store names without a geocoder);
 * ZIP is validated for FORMAT only until a real lookup provider exists.
 */
export interface LocationState {
  /** Which input the shopper used, or null when nothing is set yet. */
  method: LocationMethod | null
  /** Five-digit US ZIP when entered via the ZIP field. */
  zip?: string
  /** Device coordinates when "Use my current location" succeeded. */
  coords?: { latitude: number; longitude: number }
  /** Shopping radius in miles. Defaults to 5. */
  radiusMiles: RadiusMiles
}

/**
 * The shopper's comparison selection, persisted for Screen 5 (Nearby Stores).
 * Stores the chosen/recommended store id. (Comparison strategy modes were
 * removed — Nourish always ranks by cheapest complete basket.)
 */
export interface ComparisonSelection {
  /** Chosen/recommended retailer id (matches a pricing StoreId), or null. */
  storeId: string | null
}

/**
 * A grocery STORE (location/retailer), kept separate from grocery product
 * pricing. Address/coordinates/distance are optional and MUST remain unset
 * until verified by a real store-location provider — we never invent them.
 * This structure is the integration point for the Kroger API and others.
 */
export interface Store {
  /** Stable id (Google Places place_id, or a retailer id for demo entries). */
  id: string
  /** Display name from the location source, e.g. "Ralphs". */
  name: string
  /** Verified street address — undefined when the source didn't provide it. */
  address?: string
  /** Verified coordinates from the location source. */
  lat?: number
  lng?: number
  /** STRAIGHT-LINE distance (miles) from the shopper — real Haversine calc. */
  distanceMiles?: number
  /** Where this record came from. */
  source: 'places' | 'demo' | 'kroger'
  /**
   * Our priced-retailer id when the discovered store maps to one (e.g. "vons"),
   * or null when it's a real nearby store we don't have demo pricing for.
   */
  retailerId: string | null
}

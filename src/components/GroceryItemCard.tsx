import { useLayoutEffect, useRef, useState } from 'react'
import type { GroceryItem, ProductCandidate } from '../data/types'
import { CATALOG_BY_ID } from '../data/groceryCatalog'
import { matchBrandedProduct } from '../lib/brandedProducts'
import { splitNameAndSize, formatPackageLabel } from '../lib/offNormalize'
import { needsWeightChoice, isSuggestedQuantity } from '../lib/pricingReadiness'
import { PASTA_SHAPES, pastaDisplayName } from '../lib/pastaType'
import { GroceryIcon } from './GroceryIcon'
import './GroceryItemCard.css'

interface GroceryItemCardProps {
  item: GroceryItem
  /** Whether brand substitutions are allowed (affects the brand hint). */
  allowSubstitutions: boolean
  onChange: (id: string, patch: Partial<GroceryItem>) => void
  onRemove: (id: string) => void
}

/** Common unit fallbacks when an item has no catalog entry. */
const GENERIC_UNITS = ['each', 'lb', 'oz', 'bunch', 'bag', 'box', 'can', 'jar', 'bottle', 'pack', 'dozen', 'gal']

/**
 * Whether the parent brand adds information beyond the product name. For
 * "Diet Coke" / brand "Coca-Cola" the name is already recognizable, so we
 * don't repeat the brand. If the name already contains the brand (either
 * direction), it's redundant.
 */
export function brandAddsInfo(name: string, brand: string): boolean {
  const n = name.trim().toLowerCase()
  const b = brand.trim().toLowerCase()
  if (!b) return false
  // Direct containment either way → redundant.
  if (n.includes(b) || b.includes(n)) return false
  // The name is itself a recognizable branded product (e.g. "Diet Coke")
  // whose parent company ("Coca-Cola") adds nothing for the shopper.
  if (matchBrandedProduct(n)) return false
  // Share a significant word token (≥4 chars) → redundant.
  const nameTokens = n.split(/[^a-z0-9]+/).filter((t) => t.length >= 4)
  const brandTokens = b.split(/[^a-z0-9]+/).filter((t) => t.length >= 4)
  if (nameTokens.some((t) => brandTokens.includes(t))) return false
  return true
}

/**
 * Build the compact read-only description shown under the name for a resolved
 * OFF product, e.g. "6-pack · 16.9 fl oz bottles" (and the brand only when it
 * adds info). Falls back to just the package size.
 */
export function buildProductDescription(item: GroceryItem): string {
  const parts: string[] = []
  if (brandAddsInfo(item.name, item.brand)) parts.push(item.brand.trim())
  if (item.packageSize && item.packageSize.trim()) parts.push(item.packageSize.trim())
  return parts.join(' · ')
}

/**
 * The compact secondary line shown under the name in the COLLAPSED row.
 * Priority:
 *  - deferred package size → the exact label "Size not specified"
 *  - resolved OFF product → brand (when meaningful) · package size
 *  - specific brand on a catalog item → the brand
 *  - items sold by weight / generic → unit summary (e.g. "lb")
 * Returns "" when there's nothing worth showing.
 */
export function buildSummaryLine(item: GroceryItem): string {
  // A deferred package choice (OFF sizes) still asks for a size.
  if (item.needsPackageChoice && !item.ambiguous) return 'Size not specified'

  // A RESOLVED OFF product (carries a barcode) shows its package description,
  // not a quantity suggestion — the shopper chose a specific product/size.
  const isResolvedOff = item.recognized && !item.catalogId && Boolean(item.barcode?.trim())
  if (!isResolvedOff) {
    // Quantity the shopper never stated → a SUGGESTED, editable default. We show
    // "Suggested · 1 lb" (weight) or "Suggested · 1 bag" (packaged), with the
    // brand when present. The shopper can nudge the stepper to make it explicit.
    if (isSuggestedQuantity(item)) {
      const amount = `${formatQtyValue(item.quantity)} ${item.unit}`
      const suggested = `Suggested · ${amount}`
      return item.brand ? `${item.brand} · ${suggested}` : suggested
    }

    // Explicit weight the shopper stated.
    if (isWeightUnit(item.unit) && item.quantitySpecified) {
      const weight = `${formatQtyValue(item.quantity)} ${item.unit}`
      return item.brand ? `${weight} · ${item.brand}` : weight
    }
  }

  const desc = buildProductDescription(item)
  if (desc) return desc
  if (item.brand) return item.brand
  return ''
}

/** Weight units (sold by weight, not as a fixed package). */
const WEIGHT_UNITS = new Set(['lb', 'lbs', 'oz', 'kg', 'g'])
function isWeightUnit(unit: string): boolean {
  return WEIGHT_UNITS.has(unit.toLowerCase())
}
/** Format a quantity number (shared with the stepper display). */
function formatQtyValue(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(1)
}

/**
 * The extra variant words a candidate name has beyond the item's base name,
 * e.g. base "Diet Coke" + candidate "Diet Coke Caffeine Free" → "Caffeine
 * Free". Preserves meaningful distinctions on size chips. Returns undefined
 * when the candidate is just the base product.
 */
export function variantSuffix(baseName: string, candidateName: string): string | undefined {
  const base = baseName.trim().toLowerCase()
  const cand = candidateName.trim()
  if (cand.toLowerCase().startsWith(base) && cand.length > base.length) {
    const extra = cand.slice(base.length).replace(/^[\s·-]+/, '').trim()
    return extra || undefined
  }
  return undefined
}

export function GroceryItemCard({
  item,
  allowSubstitutions,
  onChange,
  onRemove,
}: GroceryItemCardProps) {
  const catalog = item.catalogId ? CATALOG_BY_ID[item.catalogId] : null
  const unitOptions = catalog ? catalog.units : GENERIC_UNITS
  const brandOptions = catalog ? catalog.brands : []
  const isPasta = item.catalogId === 'pasta'

  /**
   * Change the pasta shape. We keep the pasta catalog id (pricing is unchanged)
   * but reflect the chosen shape in the item NAME so it carries through to the
   * comparison and the itemized breakdown. "Any type" ("") clears the shape and
   * restores the generic "Pasta" name — flexibility, not a substitution of a
   * shape the shopper had chosen.
   */
  function handlePastaTypeChange(nextType: string) {
    const pastaType = nextType || undefined
    onChange(item.id, { pastaType, name: pastaDisplayName(pastaType) })
  }

  // Ensure the current unit is selectable even if not in the option list.
  const units = unitOptions.includes(item.unit) ? unitOptions : [item.unit, ...unitOptions]

  // Ensure the current brand is selectable even when it isn't in the catalog
  // options (e.g. a brand preserved on an ambiguous "Perdue chicken" item,
  // which has no catalog entry yet). Keeps the brand visible, not reset to "".
  const brands =
    item.brand && !brandOptions.includes(item.brand) ? [item.brand, ...brandOptions] : brandOptions

  const formatQty = formatQtyValue

  const hasSpecificBrand = item.brand !== ''

  /**
   * Resolve an ambiguous item when the shopper picks a clarification choice.
   * Preserves quantity, unit, and brand; only the identity fields change.
   * Clears the ambiguous flag so the row becomes a normal, priceable item.
   */
  function resolveAmbiguous(choice: ProductCandidate) {
    // "Other" (catalog candidate with null id) keeps the shopper's original
    // word; a catalog or OFF choice adopts that product's identity.
    const catalogEntry = choice.catalogId ? CATALOG_BY_ID[choice.catalogId] : null

    // Clean any package size baked into the chosen candidate's name, so a
    // stale candidate (e.g. "Diet Coke - 6pk/16.9 fl oz Bottles") can never
    // flow back into the item's name. Prefer an explicit packaging value.
    const cleaned = splitNameAndSize(choice.name)
    const chosenPackaging = choice.packaging ?? cleaned.size

    onChange(item.id, {
      catalogId: choice.catalogId,
      name: catalogEntry
        ? catalogEntry.canonicalName
        : choice.source === 'off'
          ? cleaned.name // adopt the specific OFF product name (de-sized)
          : item.sourceText ?? item.name,
      category: catalogEntry ? catalogEntry.category : choice.category,
      // Keep an explicit shopper brand; otherwise take the choice's brand.
      brand: item.brand || choice.brand || '',
      barcode: choice.source === 'off' ? choice.barcode : item.barcode,
      // Carry the chosen product's package size so the card shows it in the
      // read-only description (and detects a resolved OFF product).
      packageSize: choice.source === 'off' ? chosenPackaging ?? item.packageSize : item.packageSize,
      // Preserve the shopper's packaging preference; fall back to the
      // choice's package config if they hadn't specified one.
      packaging: item.packaging ?? choice.packaging,
      recognized: Boolean(catalogEntry) || choice.source === 'off',
      ambiguous: false,
      // The size (or type) is now chosen, so this is no longer a deferred
      // package choice — clears the "Size not specified" label.
      needsPackageChoice: false,
      // Retain the candidate list (hidden while resolved) so the shopper can
      // reopen it via "Change" to pick a different package/variant.
      candidates: item.candidates,
      // Drop the ambiguous-only emoji override for a resolved catalog item;
      // keep it for "Other" / branded so the icon still matches the product.
      emoji: catalogEntry ? undefined : item.emoji,
    })
  }

  /**
   * Reopen package selection for a resolved OFF product so the shopper can
   * pick a different package size instead of being stuck. Re-shows the size
   * chips via `needsPackageChoice` (non-blocking) rather than `ambiguous`
   * (which would block continuing). The candidate list was retained on resolve.
   */
  function handleChangeProduct() {
    onChange(item.id, { needsPackageChoice: true })
  }

  // A resolved OFF product: a specific product that came from Open Food Facts
  // rather than the local catalog. Detect it as "recognized, no catalog id,
  // and carries an OFF barcode" — barcode is a reliable marker even when OFF
  // has no package size for the product (packageSize is often missing).
  const isResolvedOffProduct =
    item.recognized && !item.catalogId && Boolean(item.barcode && item.barcode.trim())
  const productDescription = isResolvedOffProduct ? buildProductDescription(item) : ''
  const canReselect = Boolean(item.candidates && item.candidates.length > 0)

  // Progressive disclosure: rows are collapsed by default; expand to edit the
  // heavier controls (unit/brand/package/clarify/delete). A generically
  // ambiguous item ("chicken") auto-expands so the required choice is visible.
  const [expanded, setExpanded] = useState<boolean>(Boolean(item.ambiguous))
  const summaryLine = buildSummaryLine(item)

  // Defensive display name: strip any package size that may still be baked
  // into a stored name so the collapsed title always reads cleanly, even for
  // items persisted before name-cleaning existed.
  const displayName = splitNameAndSize(item.name).name || item.name

  // Compact quantity stepper (collapsed row). Min 0.5 so weight items like
  // "0.5 lb" stay valid; step 0.5 preserves existing quantity semantics.
  // For a weight item whose amount is UNSPECIFIED, the first interaction
  // ESTABLISHES an explicit weight (in the current unit) rather than nudging
  // an assumed hidden quantity: the shown starting value (1) becomes an
  // explicit "1 <unit>", and a decrease from there goes to 0.5.
  function stepQuantity(delta: number) {
    const unspecified = needsWeightChoice(item)
    const base = unspecified ? 1 : item.quantity
    const next = unspecified
      ? delta > 0
        ? 1 // first "+" commits the starting 1 as explicit (e.g. 1 lb)
        : Math.max(0.5, Math.round((base + delta) * 2) / 2)
      : Math.max(0.5, Math.round((base + delta) * 2) / 2)
    onChange(item.id, { quantity: next, quantitySpecified: true })
  }

  // Auto-grow the name textarea to fit its content (fallback for browsers
  // without CSS field-sizing). The CSS max-height caps it at two lines.
  const nameRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = nameRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [item.name])

  const detailsId = `grocery-card-details-${item.id}`

  return (
    <li
      className={`grocery-card${!item.recognized ? ' grocery-card--review' : ''}${
        expanded ? ' grocery-card--expanded' : ''
      }`}
    >
      {/* ── Collapsed summary row: icon, name + secondary line, qty stepper,
          expand toggle. Easy to scan; editing lives behind the toggle. ── */}
      <div className="grocery-card__summary">
        <GroceryIcon
          catalogId={item.catalogId}
          category={item.category}
          emoji={item.emoji}
          size={52}
        />

        <div className="grocery-card__summary-text">
          <span className="grocery-card__summary-name" title={displayName}>
            {displayName || 'Item'}
          </span>
          {summaryLine && (
            <span
              className={`grocery-card__summary-detail${
                (item.needsPackageChoice && !item.ambiguous) || isSuggestedQuantity(item)
                  ? ' grocery-card__summary-detail--unspecified'
                  : ''
              }`}
            >
              {summaryLine}
            </span>
          )}
        </div>

        {/* Compact quantity stepper — editable in the collapsed row. For a
            packaged product this is the number of PACKAGES. */}
        <div
          className="grocery-card__stepper"
          role="group"
          aria-label={
            isResolvedOffProduct
              ? `Number of packages for ${item.name || 'item'}`
              : `Quantity for ${item.name || 'item'}`
          }
        >
          <button
            type="button"
            className="grocery-card__step"
            onClick={() => stepQuantity(-0.5)}
            disabled={item.quantity <= 0.5}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span
            className={`grocery-card__step-value${
              isSuggestedQuantity(item) ? ' grocery-card__step-value--unspecified' : ''
            }`}
            aria-live="polite"
          >
            {/* A suggested (unspecified) quantity shows its editable default,
                dimmed, matching the "Suggested · 1 lb" label. A +/- tap commits
                it as the shopper's explicit amount. */}
            {formatQty(item.quantity)}
            {isWeightUnit(item.unit) && (
              <span className="grocery-card__step-unit"> {item.unit}</span>
            )}
          </span>
          <button
            type="button"
            className="grocery-card__step"
            onClick={() => stepQuantity(0.5)}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        {/* Expand / collapse toggle */}
        <button
          type="button"
          className="grocery-card__disclose"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={expanded ? `Hide details for ${item.name || 'item'}` : `Edit ${item.name || 'item'}`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={`grocery-card__chevron${expanded ? ' grocery-card__chevron--up' : ''}`}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── Expanded details: name edit, unit/brand or package, clarify, delete ── */}
      {expanded && (
        <div id={detailsId} className="grocery-card__details">
          {/* Editable name */}
          <label className="grocery-card__field">
            <span className="grocery-card__field-label">Name</span>
            <textarea
              ref={nameRef}
              className="grocery-card__name"
              value={item.name}
              onChange={(e) => onChange(item.id, { name: e.target.value })}
              aria-label="Item name"
              placeholder="Item name"
              rows={1}
            />
          </label>

          {/* Clarification for an ambiguous general category ("chicken") or a
              deferred package choice ("Diet Coke" sizes). Nothing preselected. */}
          {item.candidates && item.candidates.length > 0 && (item.ambiguous || item.needsPackageChoice) && (
            <div
              className="grocery-card__clarify"
              role="group"
              aria-label={
                item.needsPackageChoice
                  ? `Choose a package size for ${item.name || 'this item'}`
                  : `Choose a type for ${item.name || 'this item'}`
              }
            >
              {item.candidates.map((choice) => {
                // For a package-size choice the products are the same, so lead
                // with the SIZE (the thing that differs); the product name is
                // redundant. For a generic-category choice, lead with the name.
                // Package-size choice: lead with a FRIENDLY, normalized size
                // label (e.g. "6-pack · 16.9 fl oz bottles"), not the raw OFF
                // string or the repeated product name. Keep a meaningful
                // variant word (e.g. "Caffeine Free") as the secondary line;
                // never show brand noise. Generic-category choices keep their
                // existing name/distinguisher.
                const friendlySize = formatPackageLabel(choice.packaging)
                const variantNote = variantSuffix(item.name, choice.name)
                const primary =
                  item.needsPackageChoice && friendlySize ? friendlySize : choice.name
                const secondary =
                  item.needsPackageChoice && friendlySize
                    ? variantNote
                    : choice.distinguisher
                return (
                  <button
                    key={choice.name + (choice.packaging ?? '')}
                    type="button"
                    className="grocery-card__clarify-chip"
                    onClick={() => resolveAmbiguous(choice)}
                  >
                    <span className="grocery-card__clarify-name">{primary}</span>
                    {secondary && (
                      <span className="grocery-card__clarify-detail">{secondary}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Unit (generic/unresolved) OR package description + Change (OFF) */}
          <div className="grocery-card__detail-controls">
            {isResolvedOffProduct && !item.ambiguous ? (
              <>
                {productDescription && (
                  <span className="grocery-card__product-desc">{productDescription}</span>
                )}
                {canReselect && (
                  <button
                    type="button"
                    className="grocery-card__change-product"
                    onClick={handleChangeProduct}
                  >
                    Change package
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="grocery-card__select-wrap grocery-card__unit">
                  <select
                    className="grocery-card__select"
                    value={item.unit}
                    onChange={(e) => onChange(item.id, { unit: e.target.value })}
                    aria-label={`Unit for ${item.name || 'item'}`}
                  >
                    {units.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div className="grocery-card__select-wrap grocery-card__brand">
                  <select
                    className={`grocery-card__select${hasSpecificBrand ? ' grocery-card__select--brand-set' : ''}`}
                    value={item.brand}
                    onChange={(e) => onChange(item.id, { brand: e.target.value })}
                    aria-label={`Brand for ${item.name || 'item'}`}
                  >
                    <option value="">Any brand</option>
                    {brands.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Pasta shape — optional, progressively disclosed for pasta only. */}
          {isPasta && !item.ambiguous && (
            <label className="grocery-card__field grocery-card__pasta-type">
              <span className="grocery-card__field-label">Pasta type</span>
              <div className="grocery-card__select-wrap">
                <select
                  className={`grocery-card__select${item.pastaType ? ' grocery-card__select--brand-set' : ''}`}
                  value={item.pastaType ?? ''}
                  onChange={(e) => handlePastaTypeChange(e.target.value)}
                  aria-label={`Pasta type for ${item.name || 'item'}`}
                >
                  <option value="">Any type</option>
                  {PASTA_SHAPES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </label>
          )}

          {/* Brand-substitution hint: only when a specific brand is chosen */}
          {hasSpecificBrand && !isResolvedOffProduct && (
            <p className="grocery-card__brand-hint">
              {allowSubstitutions
                ? 'Comparable alternatives may be suggested if unavailable.'
                : 'Exact brand required — no substitutions.'}
            </p>
          )}

          {/* Delete lives in the expanded controls */}
          <button
            type="button"
            className="grocery-card__delete"
            onClick={() => onRemove(item.id)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a1 1 0 01-1 1H8a1 1 0 01-1-1V7"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            Remove item
          </button>
        </div>
      )}
    </li>
  )
}

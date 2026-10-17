import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NourishLogo } from '../components/NourishLogo'
import { ProgressSteps } from '../components/ProgressSteps'
import { PrimaryButton } from '../components/PrimaryButton'
import { useGroceryList } from '../hooks/useGroceryList'
import { useLocation } from '../hooks/useLocation'
import { useNearbyStores } from '../hooks/useNearbyStores'
import { comparePrices, itemsNeedingClarification } from '../lib/priceBasket'
import { needsWeightChoice } from '../lib/pricingReadiness'
import { formatQuantity, formatDistance } from '../lib/formatQuantity'
import type { StoreId } from '../data/pricing'
import type { ComparisonSelection, GroceryItem, ProductCandidate, Store } from '../data/types'
import groceryBag from '../assets/grocery-bag.png'
import './ComparePrices.css'

const COMPARISON_KEY = 'nourish:comparison'

const money = (n: number) => `$${n.toFixed(2)}`

export function ComparePrices() {
  const navigate = useNavigate()
  const { items, updateItem } = useGroceryList()
  const { location } = useLocation()
  const nearby = useNearbyStores(location)
  const [expandedStore, setExpandedStore] = useState<string | null>(null)
  // The retailer the shopper has actively chosen (by tapping a card), or null
  // to mean "use the Best Value recommendation" for the primary CTA.
  const [selectedStoreId, setSelectedStoreId] = useState<StoreId | null>(null)

  // Retailers we both found nearby AND can price → these drive the comparison.
  const pricedStoreIds = useMemo(() => {
    const ids = new Set<StoreId>()
    for (const s of nearby.stores) if (s.retailerId) ids.add(s.retailerId as StoreId)
    return Array.from(ids)
  }, [nearby.stores])

  // Real nearby stores we discovered but don't have demo pricing for.
  const unpricedNearby = useMemo(
    () => nearby.stores.filter((s) => !s.retailerId),
    [nearby.stores]
  )

  // Nearest discovered location per priced retailer (for distance labels).
  const nearestByRetailer = useMemo(() => {
    const map = new Map<string, Store>()
    for (const s of nearby.stores) {
      if (!s.retailerId) continue
      const cur = map.get(s.retailerId)
      if (!cur || (s.distanceMiles ?? Infinity) < (cur.distanceMiles ?? Infinity)) {
        map.set(s.retailerId, s)
      }
    }
    return map
  }, [nearby.stores])

  // Verified straight-line distance per priced retailer, for the closer-store
  // tradeoff note.
  const distancesById = useMemo(() => {
    const map: Partial<Record<StoreId, number>> = {}
    for (const [id, store] of nearestByRetailer) {
      if (store.distanceMiles !== undefined) map[id as StoreId] = store.distanceMiles
    }
    return map
  }, [nearestByRetailer])

  const pending = useMemo(() => itemsNeedingClarification(items), [items])
  const result = useMemo(
    () => comparePrices(items, pricedStoreIds, distancesById),
    [items, pricedStoreIds, distancesById]
  )

  // Definitive totals only show once required clarifications are resolved AND
  // discovery has finished successfully with at least one priced retailer.
  const discoveryReady = nearby.status === 'ok' || nearby.status === 'empty'
  const ready = pending.length === 0 && discoveryReady && pricedStoreIds.length > 0

  function persistSelection(storeId: ComparisonSelection['storeId']) {
    const selection: ComparisonSelection = { storeId }
    localStorage.setItem(COMPARISON_KEY, JSON.stringify(selection))
  }

  /** Persist a store and open its Shopping Trip. */
  function openShoppingTrip(storeId: ComparisonSelection['storeId']) {
    persistSelection(storeId)
    navigate('/nearby')
  }

  /** Primary CTA: open the chosen retailer, or Best Value if none chosen. */
  function handleViewTrip() {
    openShoppingTrip(selectedStoreId ?? result.recommendedId)
  }

  // Sort baskets so the recommended store leads (matches the mockup).
  const baskets = useMemo(() => {
    const copy = [...result.baskets]
    copy.sort((a, b) => {
      if (a.storeId === result.recommendedId) return -1
      if (b.storeId === result.recommendedId) return 1
      return a.total - b.total
    })
    return copy
  }, [result])

  const recommended = baskets.find((b) => b.storeId === result.recommendedId) ?? null

  // Savings for the recommended store vs. the most expensive compared store —
  // only meaningful (and shown) when the whole list is priced across at least
  // two baskets, so it's a fair full-list claim. Simulated figures. Carries the
  // priciest store's NAME so the copy can read "$X less than <store>".
  const savingsVsHighest = useMemo<{ amount: number; storeName: string } | null>(() => {
    if (!recommended || !result.anyComplete || baskets.length < 2) return null
    const highest = baskets.reduce((hi, b) => (b.total > hi.total ? b : hi))
    const amount = Math.round((highest.total - recommended.total) * 100) / 100
    if (amount <= 0 || highest.storeId === recommended.storeId) return null
    return { amount, storeName: highest.storeName }
  }, [baskets, recommended, result.anyComplete])

  return (
    <main className="compare page" aria-labelledby="compare-heading">
      {/* ── Top nav ── */}
      <header className="compare__header">
        <button
          type="button"
          className="compare__back"
          onClick={() => navigate('/location')}
          aria-label="Go back to Add Location"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <NourishLogo variant="compact" />
      </header>

      <ProgressSteps current="compare" />

      <div className="compare__content page-content">
        <h1 id="compare-heading" className="compare__headline">Compare Prices</h1>
        <p className="compare__subhead">
          Ranked by lowest estimated total for your full list.
        </p>

        {/* Just-in-time clarification — highest priority when items need it */}
        {pending.length > 0 && <ClarifySection items={pending} onChange={updateItem} />}

        {/* Discovery status (only when nothing to clarify) */}
        {pending.length === 0 && !ready && (
          <DiscoveryState
            status={nearby.status}
            unpricedNearby={unpricedNearby}
            onFixLocation={() => navigate('/location')}
          />
        )}

        {/* Comparison cards */}
        {ready && (
          <>
            <ul className="compare__cards">
              {baskets.map((b) => {
                const isRec = b.storeId === result.recommendedId
                const delta = recommended ? b.total - recommended.total : 0
                const expanded = expandedStore === b.storeId
                return (
                  <li
                    key={b.storeId}
                    className={`compare__card${isRec ? ' compare__card--best' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`View shopping trip for ${b.storeName}`}
                    onClick={() => {
                      setSelectedStoreId(b.storeId)
                      openShoppingTrip(b.storeId)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedStoreId(b.storeId)
                        openShoppingTrip(b.storeId)
                      }
                    }}
                  >
                    {isRec && (
                      <span className="compare__badge">
                        {result.anyComplete ? 'BEST VALUE' : 'BEST MATCH'}
                      </span>
                    )}
                    <div className="compare__card-body">
                      <div className="compare__store">
                        <span
                          className="compare__store-name"
                          style={{ color: `var(${b.colorVar})` }}
                        >
                          {b.storeName}
                        </span>
                      </div>
                      <div className="compare__figures">
                        <span className="compare__total">
                          {money(b.total)}
                          {!b.complete && <span className="compare__partial-tag"> partial</span>}
                        </span>
                        <span className="compare__coverage">
                          {b.coveredCount} of {b.totalCount} items priced
                        </span>
                        {formatDistance(nearestByRetailer.get(b.storeId)?.distanceMiles) && (
                          <span className="compare__distance">
                            {formatDistance(nearestByRetailer.get(b.storeId)!.distanceMiles)}
                          </span>
                        )}
                        {/* Winning card: show the green savings vs the priciest
                            store when the list is fully priced (a fair full-list
                            claim). For a PARTIAL comparison, note the total
                            excludes unpriced items instead of claiming savings. */}
                        {isRec && delta === 0 ? (
                          result.anyComplete ? (
                            savingsVsHighest && (
                              <span className="compare__save compare__save--good">
                                {money(savingsVsHighest.amount)} less than {savingsVsHighest.storeName}
                              </span>
                            )
                          ) : (
                            <span className="compare__save compare__save--more">
                              Total excludes items we couldn’t price
                            </span>
                          )
                        ) : (
                          <span className="compare__save compare__save--more">
                            + {money(delta)} vs {recommended?.storeName}
                            {!result.anyComplete ? ' (priced items only)' : ''}
                          </span>
                        )}
                      </div>
                      <img className="compare__bag" src={groceryBag} alt="" aria-hidden="true" draggable={false} />
                      {/* Retailer-detail arrow — expands the itemized breakdown */}
                      <button
                        type="button"
                        className="compare__arrow"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Hide' : 'Show'} item breakdown for ${b.storeName}`}
                        onClick={(e) => {
                          e.stopPropagation() // don't open the trip; just toggle the breakdown
                          setExpandedStore(expanded ? null : b.storeId)
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                          className={`compare__arrow-icon${expanded ? ' compare__arrow-icon--open' : ''}`}>
                          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>

                    {/* Expandable itemized breakdown */}
                    {expanded && (
                      <div className="compare__breakdown">
                        <ul className="compare__breakdown-list">
                          {b.lines.map((line) => (
                            <li key={line.itemId} className="compare__breakdown-row">
                              <span className="compare__breakdown-name">
                                {line.name}
                                <span className="compare__breakdown-qty">
                                  {' '}— {formatQuantity(line.quantity, line.unit)}
                                </span>
                              </span>
                              <span className="compare__breakdown-price">
                                {line.available ? money(line.lineTotal!) : 'Not available'}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="compare__breakdown-subtotal">
                          <span>Subtotal ({b.coveredCount} matched)</span>
                          <span>{money(b.total)}</span>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* Partial-coverage limitation (kept — it's the only place that
                explains which items couldn't be priced). */}
            {!result.anyComplete && (
              <div className="compare__summary compare__summary--warn" role="note">
                No store can fulfill your full list. Totals shown are for matched items only
                {result.unpricedItemNames.length > 0 && (
                  <>
                    {' — we couldn’t price: '}
                    <strong>{result.unpricedItemNames.join(', ')}</strong>
                  </>
                )}
                .
              </div>
            )}
            {/* Compact pointer to the other real nearby stores — the full list
                lives on the Nearby Stores screen to keep Compare focused. */}
            {nearby.stores.length > 0 && (
              <button
                type="button"
                className="compare__nearby-link"
                onClick={() => {
                  persistSelection(result.recommendedId)
                  navigate('/nearby')
                }}
              >
                View all {nearby.stores.length} nearby{' '}
                {nearby.stores.length === 1 ? 'store' : 'stores'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>

      {/* Subtle distance disclosure, above the footer. Shown when at least one
          card has a distance to clarify. */}
      {ready && baskets.some((b) => nearestByRetailer.get(b.storeId)?.distanceMiles !== undefined) && (
        <p className="compare__distance-disclosure">
          Distances are approximate and measured in a straight line, not driving distance.
        </p>
      )}

      {/* ── CTA + disclaimer ── */}
      <footer className="compare__footer page-footer">
        <PrimaryButton onClick={handleViewTrip} disabled={!ready || !recommended}>
          View my shopping trip
        </PrimaryButton>
        <p className="compare__disclaimer">
          Demo price estimates · Actual store locations · Prices and inventory are not verified
          <span className="compare__attribution"> · Powered by Google</span>
        </p>
      </footer>
    </main>
  )
}

/**
 * Honest loading / empty / error / no-location states for store discovery.
 * Never falls back to hardcoded stores when discovery can't verify any.
 */
function DiscoveryState({
  status,
  unpricedNearby,
  onFixLocation,
}: {
  status: ReturnType<typeof useNearbyStores>['status']
  unpricedNearby: Store[]
  onFixLocation: () => void
}) {
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="compare__state" role="status">
        <span className="compare__spinner" aria-hidden="true" />
        Finding grocery stores near you…
      </div>
    )
  }

  if (status === 'no-location' || status === 'no-zip-coords') {
    return (
      <div className="compare__state compare__state--warn" role="alert">
        <p>We need a location to find nearby stores.</p>
        <button type="button" className="compare__state-btn" onClick={onFixLocation}>
          Set your location
        </button>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="compare__state compare__state--warn" role="alert">
        <p>We couldn’t verify nearby stores right now. Please try again in a moment.</p>
        <button type="button" className="compare__state-btn" onClick={onFixLocation}>
          Change location
        </button>
      </div>
    )
  }

  // status === 'ok' | 'empty' but no priced retailers nearby.
  return (
    <div className="compare__state compare__state--warn" role="status">
      <p>
        {unpricedNearby.length > 0
          ? 'We found nearby grocery stores, but none that Nourish has demo pricing for yet.'
          : 'No grocery stores were found within your selected radius.'}
      </p>
      {unpricedNearby.length > 0 && (
        <ul className="compare__unpriced-list">
          {unpricedNearby.slice(0, 5).map((s) => (
            <li key={s.id} className="compare__unpriced-row">
              <span className="compare__unpriced-name">{s.name}</span>
              {formatDistance(s.distanceMiles) && (
                <span className="compare__unpriced-dist">{formatDistance(s.distanceMiles)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="compare__state-btn" onClick={onFixLocation}>
        Try a different location or radius
      </button>
    </div>
  )
}

/** Compact inline clarification for items missing a weight/package size. */
function ClarifySection({
  items,
  onChange,
}: {
  items: GroceryItem[]
  onChange: (id: string, patch: Partial<GroceryItem>) => void
}) {
  return (
    <section className="compare__clarify" aria-label="Clarify items for pricing">
      <p className="compare__clarify-intro">
        Almost there — just pick an amount for these items and we’ll compare prices:
      </p>
      {items.map((item) => (
        <ClarifyRow key={item.id} item={item} onChange={onChange} />
      ))}
    </section>
  )
}

function ClarifyRow({
  item,
  onChange,
}: {
  item: GroceryItem
  onChange: (id: string, patch: Partial<GroceryItem>) => void
}) {
  // Weight items: establish an explicit weight (demo options), nothing preselected.
  if (needsWeightChoice(item)) {
    const options = [1, 2, 3]
    return (
      <div className="compare__clarify-row">
        <span className="compare__clarify-name">{item.name}</span>
        <span className="compare__clarify-prompt">How much?</span>
        <div className="compare__clarify-chips">
          {options.map((w) => (
            <button
              key={w}
              type="button"
              className="compare__clarify-chip"
              onClick={() => onChange(item.id, { quantity: w, quantitySpecified: true })}
            >
              {w} {item.unit}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Package-size items: offer the demo candidate sizes already in state.
  const candidates: ProductCandidate[] = item.candidates ?? []
  return (
    <div className="compare__clarify-row">
      <span className="compare__clarify-name">{item.name}</span>
      <span className="compare__clarify-prompt">Which size?</span>
      <div className="compare__clarify-chips">
        {candidates.slice(0, 4).map((c) => (
          <button
            key={c.name + (c.packaging ?? '')}
            type="button"
            className="compare__clarify-chip"
            onClick={() =>
              onChange(item.id, {
                name: c.name,
                brand: item.brand || c.brand,
                barcode: c.barcode,
                packageSize: c.packaging,
                packaging: item.packaging ?? c.packaging,
                recognized: true,
                needsPackageChoice: false,
                ambiguous: false,
              })
            }
          >
            {c.packaging ?? c.name}
          </button>
        ))}
      </div>
    </div>
  )
}

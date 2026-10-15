import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NourishLogo } from '../components/NourishLogo'
import { PrimaryButton } from '../components/PrimaryButton'
import { useGroceryList } from '../hooks/useGroceryList'
import { useLocation } from '../hooks/useLocation'
import { useNearbyStores } from '../hooks/useNearbyStores'
import { priceBasket } from '../lib/priceBasket'
import { formatQuantity, formatDistance } from '../lib/formatQuantity'
import { STORE_BY_ID, type StoreId } from '../data/pricing'
import type { ComparisonSelection, Store } from '../data/types'
import './NearbyStores.css'

const COMPARISON_KEY = 'nourish:comparison'

const money = (n: number) => `$${n.toFixed(2)}`

/**
 * Build a Google Maps directions URL to a verified store location. Uses the
 * official Maps URL scheme (free to open — no Maps JS/SDK billing). Prefers the
 * place_id (our Places `id`) for an exact match, falling back to coordinates.
 * Returns null when we don't have a verified location — we never guess.
 */
function directionsUrl(store: Store | null): string | null {
  if (!store || store.lat === undefined || store.lng === undefined) return null
  const params = new URLSearchParams({
    api: '1',
    destination: `${store.lat},${store.lng}`,
  })
  // Our Places `id` is the Google place_id; include it for an exact match.
  if (store.source === 'places' && store.id) {
    params.set('destination_place_id', store.id)
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** Read the comparison selection the shopper made on Compare Prices. */
function loadSelection(): ComparisonSelection | null {
  try {
    const raw = localStorage.getItem(COMPARISON_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ComparisonSelection>
    if (!parsed || typeof parsed.storeId === 'undefined') return null
    return { storeId: parsed.storeId ?? null }
  } catch {
    return null
  }
}

export function NearbyStores() {
  const navigate = useNavigate()
  const { items } = useGroceryList()
  const { location } = useLocation()
  const nearby = useNearbyStores(location)

  const [selection, setSelection] = useState<ComparisonSelection | null>(loadSelection)
  useEffect(() => {
    // Re-read on mount in case Compare persisted after this component loaded.
    setSelection(loadSelection())
  }, [])

  const selectedStoreId = selection?.storeId as StoreId | null | undefined

  // The real discovered location(s) that map to the selected retailer, nearest first.
  const selectedLocation = useMemo<Store | null>(() => {
    if (!selectedStoreId) return null
    const matches = nearby.stores
      .filter((s) => s.retailerId === selectedStoreId)
      .sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity))
    return matches[0] ?? null
  }, [nearby.stores, selectedStoreId])

  // Store-specific shopping list from the real quantities + simulated prices.
  const basket = useMemo(
    () => (selectedStoreId ? priceBasket(items, selectedStoreId) : null),
    [items, selectedStoreId]
  )

  // ALL discovered stores within the radius, closest first — including priced
  // retailers and the selected destination. This is the comprehensive list.
  const allStores = useMemo(
    () =>
      [...nearby.stores].sort(
        (a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity)
      ),
    [nearby.stores]
  )

  const storeInfo = selectedStoreId ? STORE_BY_ID[selectedStoreId] : undefined
  const storeName = storeInfo?.name ?? selectedLocation?.name ?? 'your store'

  return (
    <main className="nearby page" aria-labelledby="nearby-heading">
      <header className="nearby__header">
        <button
          type="button"
          className="nearby__back"
          onClick={() => navigate('/compare')}
          aria-label="Go back to Compare Prices"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <NourishLogo variant="compact" />
      </header>

      <div className="nearby__content page-content">
        <h1 id="nearby-heading" className="nearby__headline">Your shopping trip</h1>

        {/* No store chosen (shopper skipped Compare, or no priced retailer nearby) */}
        {!selectedStoreId && (
          <div className="nearby__state nearby__state--warn" role="alert">
            <p>No store is selected yet. Head back to Compare Prices to pick one.</p>
            <button type="button" className="nearby__state-btn" onClick={() => navigate('/compare')}>
              Go to Compare Prices
            </button>
          </div>
        )}

        {selectedStoreId && (
          <>
            {/* ── Selected store: the primary destination for this trip ── */}
            <section className="nearby__store-card" aria-label={`Your destination: ${storeName}`}>
              <span className="nearby__store-eyebrow">Your destination</span>
              <div className="nearby__store-head">
                <span
                  className="nearby__store-dot"
                  style={storeInfo ? { backgroundColor: `var(${storeInfo.colorVar})` } : undefined}
                  aria-hidden="true"
                />
                <div className="nearby__store-meta">
                  <h2 className="nearby__store-name">{storeName}</h2>
                  {selectedLocation?.address && (
                    <p className="nearby__store-addr">{selectedLocation.address}</p>
                  )}
                </div>
                {formatDistance(selectedLocation?.distanceMiles) && (
                  <span className="nearby__store-dist">
                    {formatDistance(selectedLocation!.distanceMiles)}
                  </span>
                )}
              </div>

              {directionsUrl(selectedLocation) && (
                <a
                  className="nearby__directions"
                  href={directionsUrl(selectedLocation)!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 21s-6-5.3-6-10a6 6 0 1112 0c0 4.7-6 10-6 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="11" r="2.2" stroke="currentColor" strokeWidth="2" />
                  </svg>
                  Get directions
                </a>
              )}

              {nearby.status === 'loading' && !selectedLocation && (
                <p className="nearby__store-finding">Finding this store near you…</p>
              )}
              {nearby.status !== 'loading' && !selectedLocation && (
                <p className="nearby__store-nolocation">
                  We don’t have a verified nearby location for this retailer, so we can’t open
                  directions. The shopping list below still reflects your chosen store.
                </p>
              )}
            </section>

            {/* ── Store-specific shopping list ── */}
            {basket && (
              <section className="nearby__list-section" aria-label="Your shopping list">
                <h2 className="nearby__section-title">Your list at {storeName}</h2>
                <ul className="nearby__list">
                  {basket.lines.map((line) => (
                    <li key={line.itemId} className="nearby__row">
                      <span className="nearby__row-name">
                        {line.name}
                        <span className="nearby__row-qty">
                          {formatQuantity(line.quantity, line.unit)}
                        </span>
                      </span>
                      {line.available ? (
                        <span className="nearby__row-price">{money(line.lineTotal ?? 0)}</span>
                      ) : (
                        <span className="nearby__row-missing">No demo price available</span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="nearby__total-row">
                  <span>
                    {basket.complete
                      ? 'Estimated total'
                      : `Estimated total (${basket.coveredCount} of ${basket.totalCount} items priced)`}
                  </span>
                  <strong>{money(basket.total)}</strong>
                </div>
              </section>
            )}

          </>
        )}

        {/* ── Complete list of ALL discovered stores, closest first.
            Collapsed by default (native <details>) to reduce visual clutter. ── */}
        {allStores.length > 0 && (
          <details className="nearby__others">
            <summary className="nearby__others-summary">
              <span className="nearby__section-title">
                All stores near you ({allStores.length})
              </span>
              <svg
                className="nearby__others-chevron"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <ul className="nearby__others-list">
              {allStores.map((s) => {
                const isSelected = selectedLocation ? s.id === selectedLocation.id : false
                return (
                  <li key={s.id} className="nearby__others-row">
                    <span className="nearby__others-meta">
                      <span className="nearby__others-name">
                        {s.name}
                        {isSelected && (
                          <span className="nearby__others-tag nearby__others-tag--selected">
                            Your pick
                          </span>
                        )}
                      </span>
                      {s.address && <span className="nearby__others-addr">{s.address}</span>}
                    </span>
                    <span className="nearby__others-right">
                      {formatDistance(s.distanceMiles) && (
                        <span className="nearby__others-dist">
                          {formatDistance(s.distanceMiles)}
                        </span>
                      )}
                      <span
                        className={`nearby__others-pricing${
                          s.retailerId
                            ? ' nearby__others-pricing--yes'
                            : ' nearby__others-pricing--no'
                        }`}
                      >
                        {s.retailerId ? 'Demo pricing' : 'No demo pricing'}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </details>
        )}

        <p className="nearby__disclaimer">
          Store locations and distances are real, powered by Google. Prices are simulated for
          demonstration only and may not reflect current store prices or in-stock availability.
        </p>
      </div>

      <footer className="nearby__footer page-footer">
        <PrimaryButton onClick={() => navigate('/')} withArrow={false}>
          Start a new list
        </PrimaryButton>
      </footer>
    </main>
  )
}

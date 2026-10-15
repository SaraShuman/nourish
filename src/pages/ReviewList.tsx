import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NourishLogo } from '../components/NourishLogo'
import { ProgressSteps } from '../components/ProgressSteps'
import { PrimaryButton } from '../components/PrimaryButton'
import { GroceryItemCard } from '../components/GroceryItemCard'
import { useGroceryList } from '../hooks/useGroceryList'
import { useProductEnrichment } from '../hooks/useProductEnrichment'
import './ReviewList.css'

export function ReviewList() {
  const navigate = useNavigate()
  const { items, prefs, updateItem, removeItem, addItem, setAllowSubstitutions, mergeEnriched } =
    useGroceryList()

  const count = items.length

  // Map each item id -> the original raw text it was parsed from, so OFF
  // enrichment can judge ambiguity against the user's actual words.
  const fragments = useMemo(
    () => Object.fromEntries(items.map((it) => [it.id, it.sourceText ?? it.name])),
    [items]
  )

  // Supplemental Open Food Facts enrichment. Runs in the background, once per
  // item, debounced and throttled; merges results via mergeEnriched without
  // overriding user edits or local recognition. Degrades silently if OFF is
  // unavailable. No UI/layout change.
  useProductEnrichment({ items, fragments, onEnrich: mergeEnriched })

  // Pricing guard: a GENERIC ambiguous item (e.g. "chicken") must not be
  // silently priced as a specific product, so it blocks "Continue" until the
  // shopper resolves it. A merely-deferred package size ("Diet Coke", size not
  // specified) does NOT block — it's clarified later at pricing time.
  const hasUnresolvedAmbiguous = items.some((it) => it.ambiguous)
  const [showAmbiguousPrompt, setShowAmbiguousPrompt] = useState(false)

  function handleContinue() {
    if (hasUnresolvedAmbiguous) {
      setShowAmbiguousPrompt(true)
      return
    }
    navigate('/location')
  }

  // Clear the prompt once all ambiguity is resolved.
  useEffect(() => {
    if (!hasUnresolvedAmbiguous) setShowAmbiguousPrompt(false)
  }, [hasUnresolvedAmbiguous])

  // Lock the app shell to the viewport height for this screen only, so the
  // grocery list scrolls in the middle while header + footer stay fixed.
  // Other screens keep their natural (content-driven) height.
  useEffect(() => {
    document.body.classList.add('review-locked')
    return () => document.body.classList.remove('review-locked')
  }, [])

  return (
    <main className="review page" aria-labelledby="review-heading">
      {/* ── Top nav ── */}
      <header className="review__header">
        <button
          type="button"
          className="review__back"
          onClick={() => navigate('/')}
          aria-label="Go back to Welcome"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <NourishLogo variant="compact" />
      </header>

      <ProgressSteps current="list" />

      <div className="review__content page-content">
        {/* Headline */}
        <h1 id="review-heading" className="review__headline">
          {count > 0 ? `I found ${count} item${count === 1 ? '' : 's'}!` : 'Your list is empty'}
        </h1>
        <p className="review__subhead">
          {count > 0
            ? 'Here’s your list. You can edit quantities, brands, or remove items before we compare.'
            : 'Add an item below, or go back and tell us what you need.'}
        </p>

        {/* Item cards */}
        {count > 0 && (
          <ul className="review__list">
            {items.map((item) => (
              <GroceryItemCard
                key={item.id}
                item={item}
                allowSubstitutions={prefs.allowBrandSubstitutions}
                onChange={updateItem}
                onRemove={removeItem}
              />
            ))}
          </ul>
        )}

        {/* Add another item */}
        <button type="button" className="review__add" onClick={addItem}>
          <span className="review__add-plus" aria-hidden="true">+</span>
          Add another item
        </button>
      </div>

      {/* ── CTA ── */}
      <footer className="review__footer page-footer">
        {/* Allow brand substitutions toggle */}
        <div className="review__subs">
          <div className="review__subs-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 12a8 8 0 018-8 8 8 0 017 4M20 12a8 8 0 01-8 8 8 8 0 01-7-4"
                stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <path d="M18 4v4h-4M6 20v-4h4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="review__subs-text">
            <label htmlFor="allow-subs" className="review__subs-label">
              Allow brand substitutions
            </label>
            <p id="allow-subs-desc" className="review__subs-desc">
              Show alternatives if your preferred brand isn’t available
            </p>
          </div>
          <button
            type="button"
            id="allow-subs"
            role="switch"
            aria-checked={prefs.allowBrandSubstitutions}
            aria-describedby="allow-subs-desc"
            className={`review__switch${prefs.allowBrandSubstitutions ? ' review__switch--on' : ''}`}
            onClick={() => setAllowSubstitutions(!prefs.allowBrandSubstitutions)}
          >
            <span className="review__switch-thumb" aria-hidden="true" />
          </button>
        </div>

        {/* Prompt shown only if the shopper tries to continue with an
            unresolved ambiguous item — pricing must not guess a product. */}
        {showAmbiguousPrompt && hasUnresolvedAmbiguous && (
          <p className="review__ambiguous-note" role="alert">
            Please choose a type for the highlighted item (or remove it) before comparing prices.
          </p>
        )}

        <PrimaryButton
          onClick={handleContinue}
          disabled={count === 0}
          aria-label={count === 0 ? 'Add an item to continue' : 'Continue to location'}
        >
          Continue to location
        </PrimaryButton>
      </footer>
    </main>
  )
}

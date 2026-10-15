import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NourishLogo } from '../components/NourishLogo'
import { ProgressSteps } from '../components/ProgressSteps'
import { PrimaryButton } from '../components/PrimaryButton'
import { useLocation } from '../hooks/useLocation'
import { useGeolocation, type GeolocationErrorKind } from '../hooks/useGeolocation'
import { reverseGeocodeZip } from '../lib/reverseGeocode'
import { isValidZip, normalizeZipInput } from '../lib/zip'
import type { RadiusMiles } from '../data/types'
import locationIllustration from '../assets/location-illustration.png'
import './AddLocation.css'

/** User-facing message for each geolocation error state. */
const GEO_ERROR_MESSAGES: Record<GeolocationErrorKind, string> = {
  unsupported: 'Location isn’t supported in this browser. Please enter your ZIP code instead.',
  'permission-denied': 'Location access was blocked. Enable it in your browser settings, or enter your ZIP code.',
  unavailable: 'We couldn’t determine your location. Please enter your ZIP code instead.',
  timeout: 'Finding your location took too long. Please try again or enter your ZIP code.',
  unknown: 'Something went wrong finding your location. Please enter your ZIP code instead.',
}

const RADII: RadiusMiles[] = [5, 10, 15]

export function AddLocation() {
  const navigate = useNavigate()
  const { location, setZip, setCoords, setRadius, clearLocation } = useLocation()
  const geo = useGeolocation()

  // The ZIP field is a controlled local draft; it seeds from a saved ZIP so
  // the value persists across navigation/refresh.
  const [zipDraft, setZipDraft] = useState<string>(location.zip ?? '')
  const [zipTouched, setZipTouched] = useState(false)
  const zipInputRef = useRef<HTMLInputElement>(null)

  // Reverse-geocode state: while looking up a ZIP from coordinates, and
  // whether that lookup failed (coords kept, ZIP left for manual entry).
  const [zipLookupLoading, setZipLookupLoading] = useState(false)
  const [zipLookupFailed, setZipLookupFailed] = useState(false)

  const zipValid = isValidZip(zipDraft)
  // Continue is allowed with either a successful geolocation or a valid ZIP.
  const canContinue = (location.method === 'geo' && Boolean(location.coords)) || zipValid

  async function handleUseCurrentLocation() {
    setZipLookupFailed(false)
    const coords = await geo.request()
    if (!coords) return // on failure, geo.error drives an inline message

    // Store the real coordinates immediately (Continue is now enabled even if
    // ZIP lookup fails). Then reverse-geocode to populate the ZIP field.
    setCoords(coords)
    setZipDraft('')
    setZipTouched(false)

    setZipLookupLoading(true)
    const zip = await reverseGeocodeZip(coords.latitude, coords.longitude)
    setZipLookupLoading(false)

    if (zip) {
      // Populate the ZIP field with the verified result.
      setZipDraft(zip)
      setZip(zip)
    } else {
      // Keep the coordinates; invite manual entry. Never fabricate a ZIP.
      setZipLookupFailed(true)
    }
  }

  function handleZipChange(raw: string) {
    const next = normalizeZipInput(raw)
    setZipDraft(next)
    geo.reset()
    // A manual ZIP edit takes precedence and clears any lookup-failed notice.
    setZipLookupFailed(false)
    if (isValidZip(next)) {
      setZip(next)
    } else if (location.method === 'zip') {
      // Draft no longer valid — drop the stored ZIP so Continue reflects it.
      clearLocation()
    }
  }

  function handleClearZip() {
    setZipDraft('')
    setZipTouched(false)
    if (location.method === 'zip') clearLocation()
    zipInputRef.current?.focus()
  }

  // "Use a different city": clear the selected location and focus the ZIP
  // field so the shopper can enter a different one (no city search in MVP).
  function handleUseDifferentCity() {
    clearLocation()
    setZipDraft('')
    setZipTouched(false)
    geo.reset()
    zipInputRef.current?.focus()
  }

  function handleFindStores() {
    if (!canContinue) {
      setZipTouched(true)
      return
    }
    // Ensure a valid typed ZIP is committed even if blur didn't fire.
    if (location.method !== 'geo' && zipValid) setZip(zipDraft)
    navigate('/compare')
  }

  const geoLocated = location.method === 'geo' && Boolean(location.coords)
  const errorMessage = geo.error ? GEO_ERROR_MESSAGES[geo.error] : ''
  // Busy while locating the device OR looking up the ZIP from coordinates.
  const busy = geo.loading || zipLookupLoading

  return (
    <main className="location page" aria-labelledby="location-heading">
      {/* ── Top nav ── */}
      <header className="location__header">
        <button
          type="button"
          className="location__back"
          onClick={() => navigate('/review')}
          aria-label="Go back to Review List"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <NourishLogo variant="compact" />
      </header>

      <ProgressSteps current="location" />

      <div className="location__content page-content">
        {/* Illustration (supplied asset) */}
        <div className="location__illustration" aria-hidden="true">
          <img
            src={locationIllustration}
            alt=""
            className="location__illustration-img"
            draggable={false}
          />
        </div>

        {/* Headline + supporting text */}
        <h1 id="location-heading" className="location__headline">
          Where do you shop?
        </h1>
        <p className="location__subhead">
          We’ll find grocery stores near you to compare prices.
        </p>

        {/* Use my current location */}
        <button
          type="button"
          className={`location__geo-btn${geoLocated ? ' location__geo-btn--located' : ''}`}
          onClick={handleUseCurrentLocation}
          disabled={busy}
          aria-busy={busy}
        >
          <svg className="location__geo-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {geo.loading
            ? 'Finding your location…'
            : zipLookupLoading
              ? 'Looking up your ZIP code…'
              : geoLocated
                ? 'Using your current location'
                : 'Use my current location'}
        </button>

        {/* Geolocation error (polite, non-blocking) */}
        {errorMessage && (
          <p className="location__geo-error" role="alert">
            {errorMessage}
          </p>
        )}

        {/* Reverse-geocode failed: coordinates kept, ZIP left for manual entry */}
        {zipLookupFailed && !errorMessage && (
          <p className="location__geo-notice" role="status">
            We found your location, but couldn’t determine your ZIP code. You can enter it manually.
          </p>
        )}

        {/* ZIP entry */}
        <p className="location__divider">or enter your ZIP code</p>

        <div className="location__zip-row">
          <input
            ref={zipInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            className={`location__zip-input${
              zipTouched && !zipValid && zipDraft.length > 0 ? ' location__zip-input--error' : ''
            }`}
            value={zipDraft}
            onChange={(e) => handleZipChange(e.target.value)}
            onBlur={() => setZipTouched(true)}
            placeholder="e.g. 90401"
            aria-label="ZIP code"
            aria-invalid={zipTouched && zipDraft.length > 0 && !zipValid}
            maxLength={5}
          />
          {zipDraft.length > 0 && (
            <button
              type="button"
              className="location__zip-clear"
              onClick={handleClearZip}
              aria-label="Clear ZIP code"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="var(--color-muted)" />
                <path d="M9 9l6 6M15 9l-6 6" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Inline ZIP validation hint */}
        {zipTouched && zipDraft.length > 0 && !zipValid && (
          <p className="location__zip-hint" role="alert">
            Please enter a five-digit US ZIP code.
          </p>
        )}

        {/* Use a different city — clears location & focuses the ZIP field */}
        <button type="button" className="location__city-link" onClick={handleUseDifferentCity}>
          Use a different city
        </button>

        {/* Shopping radius (secondary control) */}
        <fieldset className="location__radius">
          <legend className="location__radius-legend">Search within</legend>
          <div className="location__radius-options" role="radiogroup" aria-label="Shopping radius">
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={location.radiusMiles === r}
                className={`location__radius-chip${
                  location.radiusMiles === r ? ' location__radius-chip--selected' : ''
                }`}
                onClick={() => setRadius(r)}
              >
                {r} mi
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {/* ── CTA + privacy ── */}
      <footer className="location__footer page-footer">
        <PrimaryButton
          onClick={handleFindStores}
          disabled={!canContinue}
          aria-label={canContinue ? 'Find nearby stores' : 'Enter a location to find nearby stores'}
        >
          Find nearby stores
        </PrimaryButton>

        <p className="location__privacy">
          <svg className="location__privacy-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          Your location helps us find nearby stores. You can change it anytime.
        </p>
      </footer>
    </main>
  )
}

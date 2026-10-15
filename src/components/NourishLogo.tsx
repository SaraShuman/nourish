import './NourishLogo.css'

interface NourishLogoProps {
  /** 'full' shows logo + tagline; 'compact' shows logo only (for top nav) */
  variant?: 'full' | 'compact'
}

export function NourishLogo({ variant = 'full' }: NourishLogoProps) {
  return (
    <div className={`nourish-logo nourish-logo--${variant}`} aria-label="Nourish">
      {/*
        Two upward-pointing teardrop leaves.
        Each leaf: narrow tip at top, wide rounded body, base at bottom-center.
        Left leaf leans left (fresh green), right leaf leans right (dark green).
        Drawn by tracing each leaf outline from tip → right side → base → left side → tip.
      */}
      <svg
        className="nourish-logo__leaf"
        viewBox="0 0 24 18"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        {/* Left leaf: upward oval, leaning left, fresh green */}
        <ellipse cx="8"  cy="8" rx="4" ry="8" fill="#77BF43" transform="rotate(-22 8 8)"/>
        {/* Right leaf: upward oval, leaning right, dark green */}
        <ellipse cx="16" cy="8" rx="4" ry="8" fill="#006747" transform="rotate(22 16 8)"/>
        {/* Stem */}
        <line x1="12" y1="15" x2="12" y2="18" stroke="#006747" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>

      {/* Wordmark */}
      <span className="nourish-logo__wordmark">nourish</span>

      {/* Tagline — only in full variant */}
      {variant === 'full' && (
        <span className="nourish-logo__tagline">Eat well. Spend less.</span>
      )}
    </div>
  )
}

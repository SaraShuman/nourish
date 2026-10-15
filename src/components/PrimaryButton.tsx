import './PrimaryButton.css'
import { type ButtonHTMLAttributes } from 'react'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shows a right-facing chevron after the label */
  withArrow?: boolean
  /** Full-width (default) or inline sizing */
  fullWidth?: boolean
}

export function PrimaryButton({
  children,
  withArrow = true,
  fullWidth = true,
  className = '',
  disabled,
  ...rest
}: PrimaryButtonProps) {
  return (
    <button
      className={[
        'primary-btn',
        fullWidth ? 'primary-btn--full' : '',
        disabled  ? 'primary-btn--disabled' : '',
        className,
      ].join(' ').trim()}
      disabled={disabled}
      aria-disabled={disabled}
      {...rest}
    >
      <span className="primary-btn__label">{children}</span>
      {withArrow && (
        <svg
          className="primary-btn__arrow"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M7 4l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}

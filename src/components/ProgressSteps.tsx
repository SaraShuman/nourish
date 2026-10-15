import './ProgressSteps.css'

export type ProgressStep = 'list' | 'location' | 'compare'

interface ProgressStepsProps {
  current: ProgressStep
}

const STEPS: { key: ProgressStep; label: string }[] = [
  { key: 'list',     label: 'List'     },
  { key: 'location', label: 'Location' },
  { key: 'compare',  label: 'Compare'  },
]

const STEP_ORDER: ProgressStep[] = ['list', 'location', 'compare']

export function ProgressSteps({ current }: ProgressStepsProps) {
  const currentIndex = STEP_ORDER.indexOf(current)

  return (
    <nav className="progress-steps" aria-label="Progress">
      <ol className="progress-steps__list" role="list">
        {STEPS.map((step, index) => {
          const isCompleted = index < currentIndex
          const isActive    = index === currentIndex

          return (
            <li
              key={step.key}
              className={[
                'progress-steps__item',
                isCompleted ? 'progress-steps__item--completed' : '',
                isActive    ? 'progress-steps__item--active'    : '',
              ].join(' ').trim()}
            >
              {/* Connector line before each step (except first) */}
              {index > 0 && (
                <div
                  className={[
                    'progress-steps__connector',
                    isCompleted ? 'progress-steps__connector--filled' : '',
                  ].join(' ').trim()}
                  aria-hidden="true"
                />
              )}

              {/* Step indicator circle */}
              <div
                className="progress-steps__circle"
                aria-hidden="true"
              >
                {isCompleted ? (
                  /* Checkmark for completed steps */
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </div>

              {/* Step label */}
              <span className="progress-steps__label">
                {step.label}
                {/* Screen-reader status */}
                <span className="visually-hidden">
                  {isCompleted ? ' (completed)' : isActive ? ' (current step)' : ''}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

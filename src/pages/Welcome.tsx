import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { NourishLogo } from '../components/NourishLogo'
import { PrimaryButton } from '../components/PrimaryButton'
import { useSpeechRecognition, type SpeechRecognitionErrorKind } from '../hooks/useSpeechRecognition'
import { resetListFromInput } from '../hooks/useGroceryList'
import illustrationImg from '../assets/fresh-produce-grocery-bag.png'
import './Welcome.css'

/** User-facing message for each speech-recognition error state. */
const SPEECH_ERROR_MESSAGES: Record<SpeechRecognitionErrorKind, string> = {
  'not-supported': 'Voice input isn’t supported in this browser. Please type your list instead.',
  'permission-denied': 'Microphone access was blocked. Enable it in your browser settings, or type your list.',
  'no-speech': 'We didn’t catch that. Tap the microphone to try again.',
  'audio-capture': 'No microphone was found. Please type your list instead.',
  'network': 'Voice input needs a connection and it dropped. Please try again or type your list.',
  'aborted': '',
  'unknown': 'Voice input ran into a problem. Please try again or type your list.',
}

const EXAMPLE_LIST =
  'Bananas 3 lb, chicken breast 1.5 lb, spinach 1 bunch, whole milk 1 gal, eggs 1 dozen, avocados 4, Greek yogurt 32 oz, pasta 1 box'

const STORAGE_KEY = 'nourish:raw-input'

export function Welcome() {
  const navigate = useNavigate()
  const [input, setInput] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, input)
  }, [input])

  function handleTryExample() {
    setInput(EXAMPLE_LIST)
  }

  function handleFindSavings() {
    if (!input.trim()) return
    // Rebuild the review list from exactly what's in the box right now, so a
    // fresh submission always wins — even if the user had emptied the list or
    // retyped the same text.
    resetListFromInput(input)
    navigate('/review')
  }

  // Append recognized speech to the existing input, preserving typed text.
  const handleTranscript = useCallback((transcript: string) => {
    setInput((prev) => {
      const trimmedPrev = prev.trimEnd()
      if (!trimmedPrev) return transcript
      // Join with a comma + space so dictated items read as a list.
      const separator = /[,.]$/.test(trimmedPrev) ? ' ' : ', '
      return trimmedPrev + separator + transcript
    })
  }, [])

  const { isSupported, isListening, error, toggle } = useSpeechRecognition({
    onResult: handleTranscript,
  })

  const isEmpty = input.trim().length === 0
  const errorMessage = error ? SPEECH_ERROR_MESSAGES[error] : ''

  return (
    <main className="welcome" aria-labelledby="welcome-headline">

      {/* ── Logo ── */}
      <header className="welcome__header">
        <NourishLogo variant="full" />
      </header>

      {/* ── Headline ── */}
      <h1 id="welcome-headline" className="welcome__headline">
        Compare grocery prices across nearby stores.
      </h1>

      {/* ── Illustration ── */}
      <div className="welcome__illustration" aria-hidden="true">
        <img
          src={illustrationImg}
          alt=""
          className="welcome__illustration-img"
          draggable={false}
        />
      </div>

      {/* ── Input section ── */}
      <section className="welcome__input-section" aria-label="Grocery list entry">
        <div className="welcome__input-header">
          <span className="welcome__sparkle" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              {/* Large central four-point star */}
              <path
                d="M12.5 3 L14 10 L21 11.5 L14 13 L12.5 20 L11 13 L4 11.5 L11 10 Z"
                fill="#006747"
              />
              {/* Small accent star, top-right */}
              <path
                d="M19 3.5 L19.7 6 L22 6.7 L19.7 7.4 L19 9.9 L18.3 7.4 L16 6.7 L18.3 6 Z"
                fill="#77BF43"
              />
              {/* Tiny accent star, bottom-left */}
              <path
                d="M5 15.5 L5.5 17.3 L7.3 17.8 L5.5 18.3 L5 20.1 L4.5 18.3 L2.7 17.8 L4.5 17.3 Z"
                fill="#77BF43"
              />
            </svg>
          </span>
          <div>
            <label htmlFor="grocery-input" className="welcome__input-label">
              What groceries do you need?
            </label>
            <p className="welcome__input-subtext">
              {isSupported
                ? 'You can type or speak naturally.'
                : 'Type your list naturally.'}
            </p>
          </div>
        </div>

        <div
          className="welcome__input-row"
          onClick={() => document.getElementById('grocery-input')?.focus()}
        >
          <textarea
            id="grocery-input"
            className="welcome__textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. I need bananas, eggs, milk, chicken breast, and spinach."
            aria-describedby="grocery-input-desc"
            rows={2}
            autoComplete="off"
            spellCheck={true}
          />
          {/*
            Mic button — part of the approved design, always visible.
            Functional via the Web Speech API where supported; on
            unsupported browsers (e.g. Firefox) a tap surfaces a friendly
            "voice not available" message instead of doing nothing.
          */}
          <button
            type="button"
            className={`welcome__mic${isListening ? ' welcome__mic--listening' : ''}${!isSupported ? ' welcome__mic--unavailable' : ''}`}
            onClick={(e) => {
              e.stopPropagation() // don't trigger the row's focus handler
              toggle()
            }}
            aria-pressed={isSupported ? isListening : undefined}
            aria-label={
              !isSupported
                ? 'Voice input (not available in this browser)'
                : isListening
                  ? 'Stop voice input'
                  : 'Start voice input'
            }
          >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="9" y="2" width="6" height="13" rx="3" fill="white"/>
                <path
                  d="M5 10 C5 14.9 8.1 19 12 19 C15.9 19 19 14.9 19 10"
                  stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"
                />
                <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                <line x1="8.5" y1="23" x2="15.5" y2="23" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            </button>
        </div>

        {/* Listening indicator — visible + announced to screen readers */}
        {isListening && (
          <p className="welcome__listening" role="status">
            <span className="welcome__listening-dot" aria-hidden="true" />
            Listening…
          </p>
        )}

        {/* Error message — polite announcement, non-blocking */}
        {errorMessage && (
          <p className="welcome__voice-error" role="alert">
            {errorMessage}
          </p>
        )}

        <p id="grocery-input-desc" className="visually-hidden">
          Type your grocery list naturally. You can edit every item before comparing prices.
          {isSupported ? ' You can also use the microphone button to dictate your list.' : ''}
        </p>
      </section>

      {/* ── Try an example list ── */}
      <div className="welcome__example-row">
        <button
          type="button"
          className="welcome__example-btn"
          onClick={handleTryExample}
          aria-label="Fill in an example grocery list"
        >
          Try an example list
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* ── Primary CTA ── */}
      <div className="welcome__cta">
        <PrimaryButton
          onClick={handleFindSavings}
          disabled={isEmpty}
          aria-label={isEmpty ? 'Enter your grocery list to find savings' : 'Find my savings'}
        >
          Find my savings
        </PrimaryButton>
      </div>

    </main>
  )
}

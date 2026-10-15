import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  SpeechRecognition,
  SpeechRecognitionConstructor,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
} from '../types/speech-recognition'

/** Human-readable error states surfaced to the UI. */
export type SpeechRecognitionErrorKind =
  | 'not-supported'
  | 'permission-denied'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'aborted'
  | 'unknown'

interface UseSpeechRecognitionOptions {
  /** BCP-47 language tag. Defaults to the document language or en-US. */
  lang?: string
  /**
   * Called when a final transcript segment is recognized.
   * Receives the recognized text; the consumer decides how to merge it
   * with existing input (e.g. append to typed text).
   */
  onResult: (transcript: string) => void
}

interface UseSpeechRecognitionReturn {
  /** Whether the Web Speech API is available in this browser. */
  isSupported: boolean
  /** Whether recognition is actively listening. */
  isListening: boolean
  /** The latest error, or null. */
  error: SpeechRecognitionErrorKind | null
  /** Begin listening. No-op if unsupported or already listening. */
  start: () => void
  /** Stop listening. No-op if not listening. */
  stop: () => void
  /** Toggle listening on/off. */
  toggle: () => void
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  return window.SpeechRecognition ?? window.webkitSpeechRecognition
}

function mapError(code: SpeechRecognitionErrorEvent['error']): SpeechRecognitionErrorKind {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission-denied'
    case 'no-speech':
      return 'no-speech'
    case 'audio-capture':
      return 'audio-capture'
    case 'network':
      return 'network'
    case 'aborted':
      return 'aborted'
    default:
      return 'unknown'
  }
}

/**
 * Encapsulates browser speech-to-text via the Web Speech API.
 *
 * Design notes:
 * - Support is detected once; when unavailable, start() is a no-op and
 *   `error` is set to 'not-supported' only when the user attempts to use it.
 * - Recognition instance is created lazily and torn down on unmount so that
 *   leaving the screen stops listening (requirement 9).
 * - Only *final* transcript segments are forwarded via onResult, so the
 *   consumer appends stable text rather than flickering interim guesses.
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions
): UseSpeechRecognitionReturn {
  const { lang, onResult } = options

  const Ctor = getSpeechRecognitionCtor()
  const isSupported = Boolean(Ctor)

  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<SpeechRecognitionErrorKind | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  // Keep latest onResult without re-creating the recognition instance.
  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  // Guards against setState on an unmounted component.
  const mountedRef = useRef(true)

  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    if (recognition) {
      // abort() stops immediately without firing a final result.
      recognition.stop()
    }
  }, [])

  const start = useCallback(() => {
    if (!Ctor) {
      setError('not-supported')
      return
    }
    if (recognitionRef.current) {
      // Already listening.
      return
    }

    setError(null)

    const recognition = new Ctor()
    const docLang = typeof document !== 'undefined' ? document.documentElement.lang : ''
    recognition.lang = lang ?? (docLang || 'en-US')
    recognition.continuous = true
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      if (mountedRef.current) setIsListening(true)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Each final result segment corresponds to a natural utterance chunk the
      // engine closed at a pause. Join segments with ", " so those pause
      // boundaries become list separators — the single most reliable timing
      // signal the Web Speech API exposes. (A segment with no internal commas
      // is still recovered downstream by the parser's item segmenter.)
      const segments: string[] = []
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          const text = result[0].transcript.trim()
          if (text) segments.push(text)
        }
      }
      const joined = segments.join(', ').trim()
      if (joined) {
        onResultRef.current(joined)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (!mountedRef.current) return
      const kind = mapError(event.error)
      // 'aborted' happens on normal stop(); don't surface it as a user error.
      if (kind !== 'aborted') {
        setError(kind)
      }
    }

    recognition.onend = () => {
      recognitionRef.current = null
      if (mountedRef.current) setIsListening(false)
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch {
      // start() throws if called while already starting; reset state.
      recognitionRef.current = null
      if (mountedRef.current) {
        setIsListening(false)
        setError('unknown')
      }
    }
  }, [Ctor, lang])

  const toggle = useCallback(() => {
    if (recognitionRef.current) {
      stop()
    } else {
      start()
    }
  }, [start, stop])

  // Cleanup on unmount — stops recognition when leaving the screen.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const recognition = recognitionRef.current
      if (recognition) {
        recognition.onresult = null
        recognition.onerror = null
        recognition.onend = null
        recognition.onstart = null
        recognition.abort()
        recognitionRef.current = null
      }
    }
  }, [])

  return { isSupported, isListening, error, start, stop, toggle }
}

/**
 * Tests for the useSpeechRecognition hook.
 * Covers: unsupported browser, supported start/stop, successful transcription,
 * and error handling (permission denied, no-speech).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import type {
  SpeechRecognition,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
} from '../types/speech-recognition'

/**
 * A controllable fake SpeechRecognition implementation.
 * Tests drive lifecycle events via the exposed emit* helpers.
 */
class FakeSpeechRecognition implements SpeechRecognition {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1

  onresult: ((event: SpeechRecognitionEvent) => void) | null = null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null
  onend: ((event: Event) => void) | null = null
  onstart: ((event: Event) => void) | null = null

  startCalls = 0
  stopCalls = 0
  abortCalls = 0

  // Track the most recently constructed instance for assertions.
  static last: FakeSpeechRecognition | null = null

  constructor() {
    FakeSpeechRecognition.last = this
  }

  start() {
    this.startCalls++
    // Simulate async onstart firing.
    this.onstart?.(new Event('start'))
  }

  stop() {
    this.stopCalls++
    // Browser fires onend after stop.
    this.onend?.(new Event('end'))
  }

  abort() {
    this.abortCalls++
  }

  // ── Test helpers ──
  emitFinalResult(transcript: string) {
    const event = {
      resultIndex: 0,
      results: {
        length: 1,
        0: { isFinal: true, length: 1, 0: { transcript, confidence: 0.9 } },
      },
    } as unknown as SpeechRecognitionEvent
    this.onresult?.(event)
  }

  emitError(code: SpeechRecognitionErrorEvent['error']) {
    this.onerror?.({ error: code, message: '' } as SpeechRecognitionErrorEvent)
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true
  }
}

const originalSR = window.SpeechRecognition
const originalWebkitSR = window.webkitSpeechRecognition

afterEach(() => {
  window.SpeechRecognition = originalSR
  window.webkitSpeechRecognition = originalWebkitSR
  FakeSpeechRecognition.last = null
  vi.restoreAllMocks()
})

describe('useSpeechRecognition — unsupported browser', () => {
  beforeEach(() => {
    // Remove both the standard and prefixed constructors.
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
  })

  it('reports isSupported = false', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult: () => {} })
    )
    expect(result.current.isSupported).toBe(false)
  })

  it('sets a not-supported error when start() is called', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult: () => {} })
    )
    act(() => result.current.start())
    expect(result.current.error).toBe('not-supported')
    expect(result.current.isListening).toBe(false)
  })
})

describe('useSpeechRecognition — supported browser', () => {
  beforeEach(() => {
    window.SpeechRecognition =
      FakeSpeechRecognition as unknown as typeof window.SpeechRecognition
    window.webkitSpeechRecognition =
      FakeSpeechRecognition as unknown as typeof window.webkitSpeechRecognition
  })

  it('reports isSupported = true', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult: () => {} })
    )
    expect(result.current.isSupported).toBe(true)
  })

  it('starts listening and sets isListening = true', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult: () => {} })
    )
    act(() => result.current.start())
    expect(result.current.isListening).toBe(true)
    expect(FakeSpeechRecognition.last?.startCalls).toBe(1)
  })

  it('forwards a final transcript via onResult', () => {
    const onResult = vi.fn()
    const { result } = renderHook(() => useSpeechRecognition({ onResult }))
    act(() => result.current.start())
    act(() => FakeSpeechRecognition.last?.emitFinalResult('bananas and eggs'))
    expect(onResult).toHaveBeenCalledWith('bananas and eggs')
  })

  it('stops listening on stop()', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult: () => {} })
    )
    act(() => result.current.start())
    expect(result.current.isListening).toBe(true)
    act(() => result.current.stop())
    expect(result.current.isListening).toBe(false)
    expect(FakeSpeechRecognition.last?.stopCalls).toBe(1)
  })

  it('toggle() starts then stops', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult: () => {} })
    )
    act(() => result.current.toggle())
    expect(result.current.isListening).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.isListening).toBe(false)
  })

  it('maps a not-allowed error to permission-denied', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult: () => {} })
    )
    act(() => result.current.start())
    act(() => FakeSpeechRecognition.last?.emitError('not-allowed'))
    expect(result.current.error).toBe('permission-denied')
  })

  it('maps a no-speech error correctly', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult: () => {} })
    )
    act(() => result.current.start())
    act(() => FakeSpeechRecognition.last?.emitError('no-speech'))
    expect(result.current.error).toBe('no-speech')
  })

  it('does not surface aborted as an error', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult: () => {} })
    )
    act(() => result.current.start())
    act(() => FakeSpeechRecognition.last?.emitError('aborted'))
    expect(result.current.error).toBeNull()
  })

  it('aborts recognition on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useSpeechRecognition({ onResult: () => {} })
    )
    act(() => result.current.start())
    const instance = FakeSpeechRecognition.last
    unmount()
    expect(instance?.abortCalls).toBe(1)
  })
})

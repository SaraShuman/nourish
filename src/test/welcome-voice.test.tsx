/**
 * Integration tests for voice input on the Welcome screen.
 * Verifies the mic button appears when supported, hides when not,
 * toggles listening, transcribes into the input preserving typed text,
 * and surfaces errors.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Welcome } from '../pages/Welcome'
import type {
  SpeechRecognition,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
} from '../types/speech-recognition'

class FakeSpeechRecognition implements SpeechRecognition {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: ((e: SpeechRecognitionEvent) => void) | null = null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null = null
  onend: ((e: Event) => void) | null = null
  onstart: ((e: Event) => void) | null = null

  static last: FakeSpeechRecognition | null = null
  constructor() {
    FakeSpeechRecognition.last = this
  }
  start() {
    this.onstart?.(new Event('start'))
  }
  stop() {
    this.onend?.(new Event('end'))
  }
  abort() {}

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

  /** Emit several final segments in one event (natural pause boundaries). */
  emitFinalSegments(transcripts: string[]) {
    const results: Record<number, unknown> & { length: number } = {
      length: transcripts.length,
    }
    transcripts.forEach((t, idx) => {
      results[idx] = { isFinal: true, length: 1, 0: { transcript: t, confidence: 0.9 } }
    })
    const event = { resultIndex: 0, results } as unknown as SpeechRecognitionEvent
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

function enableSpeech() {
  window.SpeechRecognition =
    FakeSpeechRecognition as unknown as typeof window.SpeechRecognition
  window.webkitSpeechRecognition =
    FakeSpeechRecognition as unknown as typeof window.webkitSpeechRecognition
}

function disableSpeech() {
  delete window.SpeechRecognition
  delete window.webkitSpeechRecognition
}

beforeEach(() => {
  localStorage.clear()
  FakeSpeechRecognition.last = null
})

afterEach(() => {
  window.SpeechRecognition = originalSR
  window.webkitSpeechRecognition = originalWebkitSR
  vi.restoreAllMocks()
})

function renderWelcome() {
  return render(
    <MemoryRouter>
      <Welcome />
    </MemoryRouter>
  )
}

describe('Welcome voice input — unsupported', () => {
  beforeEach(disableSpeech)

  it('still renders the mic button (part of the design)', () => {
    renderWelcome()
    expect(
      screen.getByRole('button', { name: /not available in this browser/i })
    ).toBeInTheDocument()
  })

  it('shows a not-supported message when the mic is tapped', () => {
    renderWelcome()
    fireEvent.click(
      screen.getByRole('button', { name: /not available in this browser/i })
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Voice input isn.t supported in this browser/i
    )
  })

  it('shows the type-only subtext', () => {
    renderWelcome()
    expect(screen.getByText(/Type your list naturally\./i)).toBeInTheDocument()
  })
})

describe('Welcome voice input — supported', () => {
  beforeEach(enableSpeech)

  it('renders the mic button and the type-or-speak subtext', () => {
    renderWelcome()
    expect(
      screen.getByRole('button', { name: /start voice input/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/You can type or speak naturally\./i)
    ).toBeInTheDocument()
  })

  it('shows the Listening… indicator after tapping the mic', () => {
    renderWelcome()
    fireEvent.click(screen.getByRole('button', { name: /start voice input/i }))
    expect(screen.getByText(/Listening…/i)).toBeInTheDocument()
    // Button label flips to "Stop voice input"
    expect(
      screen.getByRole('button', { name: /stop voice input/i })
    ).toBeInTheDocument()
  })

  it('transcribes speech into the empty input field', () => {
    renderWelcome()
    fireEvent.click(screen.getByRole('button', { name: /start voice input/i }))
    act(() => FakeSpeechRecognition.last?.emitFinalResult('bananas and milk'))
    const textarea = screen.getByRole('textbox', {
      name: /What groceries/i,
    }) as HTMLTextAreaElement
    expect(textarea.value).toBe('bananas and milk')
  })

  it('appends speech to existing typed text, preserving it', () => {
    renderWelcome()
    const textarea = screen.getByRole('textbox', {
      name: /What groceries/i,
    }) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'eggs' } })
    fireEvent.click(screen.getByRole('button', { name: /start voice input/i }))
    act(() => FakeSpeechRecognition.last?.emitFinalResult('bananas'))
    expect(textarea.value).toBe('eggs, bananas')
  })

  it('joins pause-separated final segments with commas', () => {
    renderWelcome()
    fireEvent.click(screen.getByRole('button', { name: /start voice input/i }))
    // The engine closed three segments at natural pauses.
    act(() =>
      FakeSpeechRecognition.last?.emitFinalSegments(['bananas', 'chicken breast', 'milk'])
    )
    const textarea = screen.getByRole('textbox', {
      name: /What groceries/i,
    }) as HTMLTextAreaElement
    expect(textarea.value).toBe('bananas, chicken breast, milk')
  })

  it('stops listening when the mic is tapped again', () => {
    renderWelcome()
    fireEvent.click(screen.getByRole('button', { name: /start voice input/i }))
    expect(screen.getByText(/Listening…/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /stop voice input/i }))
    expect(screen.queryByText(/Listening…/i)).not.toBeInTheDocument()
  })

  it('shows a permission-denied message on not-allowed error', () => {
    renderWelcome()
    fireEvent.click(screen.getByRole('button', { name: /start voice input/i }))
    act(() => FakeSpeechRecognition.last?.emitError('not-allowed'))
    expect(screen.getByRole('alert')).toHaveTextContent(/Microphone access was blocked/i)
  })

  it('does not auto-submit after transcription (stays on Welcome)', () => {
    renderWelcome()
    fireEvent.click(screen.getByRole('button', { name: /start voice input/i }))
    act(() => FakeSpeechRecognition.last?.emitFinalResult('bananas and milk'))
    // Welcome headline is still present — no navigation happened.
    expect(
      screen.getByRole('heading', { name: /Compare grocery prices/i })
    ).toBeInTheDocument()
  })
})

import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'

/**
 * Continuous speech recognition: the native Capacitor plugin in packaged
 * builds, Web Speech in the browser. Both stop after each utterance, so the
 * session restarts on every stop, behind a circuit breaker for repeated failures.
 */

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'unsupported'
  | 'denied'
  /** The engine failed repeatedly and the breaker tripped. */
  | 'failed'

export interface VoiceSession {
  stop: () => Promise<void>
}

interface VoiceSessionOptions {
  /** Fires with the best guess once an utterance has settled. */
  onTranscript: (text: string) => void
  onStateChange?: (state: VoiceState) => void
}

const LANGUAGE = 'en-GB'

/** Silence after which the current partial is treated as a finished phrase. */
const SETTLE_MS = 700

/** Restarts allowed inside RESTART_WINDOW_MS before the breaker trips. */
const RESTART_LIMIT = 10
const RESTART_WINDOW_MS = 10_000

const isNative = () => Capacitor.isNativePlatform()

// ── minimal Web Speech typings (not in TS's DOM lib) ──────────────────────────

interface WebSpeechAlternative { transcript: string }
interface WebSpeechResult {
  readonly length: number
  isFinal: boolean
  [index: number]: WebSpeechAlternative
}
interface WebSpeechResultList {
  readonly length: number
  [index: number]: WebSpeechResult
}
interface WebSpeechEvent {
  resultIndex: number
  results: WebSpeechResultList
}
interface WebSpeechErrorEvent { error: string }
interface WebSpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: WebSpeechEvent) => void) | null
  onerror: ((e: WebSpeechErrorEvent) => void) | null
  onend: (() => void) | null
}

const webRecognitionCtor = (): (new () => WebSpeechRecognition) | null => {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    (new () => WebSpeechRecognition) | null
}

/** Whether this device can recognise speech at all. */
export const isVoiceSupported = async (): Promise<boolean> => {
  if (isNative()) {
    try {
      const { available } = await SpeechRecognition.available()
      return available
    } catch {
      return false
    }
  }
  return webRecognitionCtor() !== null
}

/** Ask for the microphone. The web engine has no separate call — it prompts on start. */
export const requestVoicePermission = async (): Promise<boolean> => {
  if (!isNative()) return webRecognitionCtor() !== null
  try {
    const status = await SpeechRecognition.requestPermissions()
    return status.speechRecognition === 'granted'
  } catch {
    return false
  }
}

/** Begin listening; resolves once running. `stop()` is idempotent (StrictMode-safe). */
export const startVoiceSession = async (
  options: VoiceSessionOptions
): Promise<VoiceSession> => {
  const { onTranscript, onStateChange } = options

  let active = true
  let settleTimer: ReturnType<typeof setTimeout> | null = null
  let pending = ''
  const restarts: number[] = []

  const report = (state: VoiceState) => { if (active || state !== 'listening') onStateChange?.(state) }

  /** True while the breaker still allows another restart. */
  const mayRestart = () => {
    const now = Date.now()
    while (restarts.length > 0 && now - restarts[0] > RESTART_WINDOW_MS) restarts.shift()
    if (restarts.length >= RESTART_LIMIT) return false
    restarts.push(now)
    return true
  }

  const settle = () => {
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      const text = pending.trim()
      pending = ''
      if (text && active) onTranscript(text)
    }, SETTLE_MS)
  }

  const push = (text: string) => {
    if (!active || !text) return
    pending = text
    settle()
  }

  // ── native ────────────────────────────────────────────────────────────────
  if (isNative()) {
    const granted = await requestVoicePermission()
    if (!granted) {
      report('denied')
      return { stop: async () => { active = false } }
    }

    const listener = await SpeechRecognition.addListener('partialResults', ({ matches }) => {
      if (matches?.[0]) push(matches[0])
    })

    const runOnce = async () => {
      if (!active) return
      try {
        // Resolves when the utterance ends; partials arrive via the listener
        const result = await SpeechRecognition.start({
          language: LANGUAGE,
          maxResults: 1,
          partialResults: true,
          // No system dialog
          popup: false,
        })
        if (result?.matches?.[0]) push(result.matches[0])
      } catch {
        // Also reached when stopped mid-utterance — not necessarily a fault
      }
      if (!active) return
      if (!mayRestart()) { report('failed'); return }
      void runOnce()
    }

    void runOnce()
    report('listening')

    return {
      stop: async () => {
        if (!active) return
        active = false
        if (settleTimer) clearTimeout(settleTimer)
        try { await SpeechRecognition.stop() } catch { /* already stopped */ }
        try { await listener.remove() } catch { /* already removed */ }
        report('idle')
      },
    }
  }

  // ── web ───────────────────────────────────────────────────────────────────
  const Ctor = webRecognitionCtor()
  if (!Ctor) {
    report('unsupported')
    return { stop: async () => { active = false } }
  }

  const recognition = new Ctor()
  recognition.lang = LANGUAGE
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  recognition.onresult = (event) => {
    let text = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      text += event.results[i][0]?.transcript ?? ''
    }
    push(text)
  }

  recognition.onerror = (event) => {
    // 'no-speech' and 'aborted' are routine; only permission errors are fatal
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      active = false
      report('denied')
    }
  }

  recognition.onend = () => {
    if (!active) return
    if (!mayRestart()) { report('failed'); return }
    try { recognition.start() } catch { /* already starting */ }
  }

  try {
    recognition.start()
    report('listening')
  } catch {
    report('failed')
  }

  return {
    stop: async () => {
      if (!active) return
      active = false
      if (settleTimer) clearTimeout(settleTimer)
      recognition.onend = null
      recognition.onresult = null
      recognition.onerror = null
      try { recognition.abort() } catch { /* already stopped */ }
      report('idle')
    },
  }
}

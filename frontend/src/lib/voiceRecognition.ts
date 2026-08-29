import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'

/**
 * Continuous speech recognition, native or web.
 *
 * Two engines behind one handle:
 *
 *  - **Native** (`@capacitor-community/speech-recognition`) on a packaged
 *    build, which is where hands-free logging is actually used.
 *  - **Web Speech** in the browser and PWA. The plugin's own web layer throws
 *    `unimplemented` on every method, so this file provides the fallback.
 *
 * Neither engine really listens continuously. Both stop after an utterance or a
 * stretch of silence, so "continuous" here means *restarted on every stop* —
 * which is also why the restart needs a circuit breaker: a denied mic ends up
 * in a stop/start loop that spins the CPU and drains the battery of a phone
 * that is, by definition, sitting on a bench for an hour.
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

// ── minimal Web Speech typings ──────────────────────────────────────────────
// Not in TS's DOM lib, and the full shape isn't worth vendoring for the four
// members used here.

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

/** Whether this device can recognise speech at all — checked before the UI
 *  offers a toggle, so nobody is shown a switch that cannot work. */
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

/**
 * Ask for the microphone.
 *
 * Native asks explicitly. The web engine has no separate permission call — the
 * browser prompts on the first `start()` — so this reports true and lets the
 * real answer arrive as a `denied` state.
 */
export const requestVoicePermission = async (): Promise<boolean> => {
  if (!isNative()) return webRecognitionCtor() !== null
  try {
    const status = await SpeechRecognition.requestPermissions()
    return status.speechRecognition === 'granted'
  } catch {
    return false
  }
}

/**
 * Begin listening. Resolves once the engine is running.
 *
 * The returned handle's `stop()` is idempotent and safe to call from a React
 * cleanup that may run twice under StrictMode.
 */
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
        // Resolves when this utterance ends; partials have already arrived
        // through the listener above.
        const result = await SpeechRecognition.start({
          language: LANGUAGE,
          maxResults: 1,
          partialResults: true,
          // A system dialog would defeat the entire point of hands-free.
          popup: false,
        })
        if (result?.matches?.[0]) push(result.matches[0])
      } catch {
        // A stop mid-utterance lands here too, so it is not necessarily a fault.
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
    // 'no-speech' and 'aborted' are ordinary during a workout — someone resting
    // in silence produces one every few seconds.
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

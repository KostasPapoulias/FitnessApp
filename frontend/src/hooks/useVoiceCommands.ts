import { useEffect, useRef, useState } from 'react'
import {
  startVoiceSession, VoiceSession, VoiceState,
} from '../lib/voiceRecognition'
import { parseVoiceCommand, looksLikeCommand, VoiceCommand } from '../lib/voiceGrammar'
import { hapticCommandHeard } from '../lib/haptics'

/**
 * Hands-free control of a live workout (requirement 6.1).
 *
 * Owns the microphone for as long as `enabled` is true, parses what it hears,
 * and calls back with a command. The caller decides what each command does —
 * the rest timer and the set screen answer to different ones.
 *
 * Handlers are held in a ref rather than a dependency: they close over the
 * current set and exercise and therefore change on every render, and restarting
 * the recogniser sixty times a minute would leave it permanently starting.
 */

export interface VoiceCommandHandlers {
  onCommand: (command: VoiceCommand) => void
}

interface UseVoiceCommandsResult {
  state: VoiceState
  /** The last phrase that parsed, for the on-screen indicator. Cleared after a
   *  few seconds so the UI doesn't keep showing a stale command. */
  lastHeard: string | null
  /** The last phrase that was clearly aimed at the app but didn't parse, so the
   *  UI can say so. Silence after a real attempt is what teaches people the
   *  feature is broken. */
  lastMiss: string | null
}

/** A repeat of the same command inside this window is treated as an echo of the
 *  one utterance — native engines emit a final result that repeats the last
 *  partial, and logging a set twice is exactly the bug that would cause. */
const ECHO_WINDOW_MS = 1500

export const useVoiceCommands = (
  enabled: boolean,
  handlers: VoiceCommandHandlers
): UseVoiceCommandsResult => {
  const [state, setState] = useState<VoiceState>('idle')
  const [lastHeard, setLastHeard] = useState<string | null>(null)
  const [lastMiss, setLastMiss] = useState<string | null>(null)

  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const lastCommandRef = useRef<{ signature: string; at: number } | null>(null)
  const clearHeardRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearMissRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) {
      setState('idle')
      return
    }

    let session: VoiceSession | null = null
    let cancelled = false

    const handleTranscript = (text: string) => {
      const command = parseVoiceCommand(text)
      if (!command) {
        // Only when it was plainly meant for the app. Reporting every overheard
        // sentence would turn the strip into a nag during a conversation.
        if (looksLikeCommand(text)) {
          setLastMiss(text)
          setLastHeard(null)
          if (clearMissRef.current) clearTimeout(clearMissRef.current)
          clearMissRef.current = setTimeout(() => setLastMiss(null), 5000)
        }
        return
      }
      setLastMiss(null)

      // Same command, same values, moments apart — one utterance heard twice.
      const signature = JSON.stringify(command)
      const now = Date.now()
      const previous = lastCommandRef.current
      if (previous && previous.signature === signature && now - previous.at < ECHO_WINDOW_MS) return
      lastCommandRef.current = { signature, at: now }

      void hapticCommandHeard()
      setLastHeard(text)
      if (clearHeardRef.current) clearTimeout(clearHeardRef.current)
      clearHeardRef.current = setTimeout(() => setLastHeard(null), 4000)

      handlersRef.current.onCommand(command)
    }

    startVoiceSession({
      onTranscript: handleTranscript,
      onStateChange: (next) => { if (!cancelled) setState(next) },
    })
      .then((s) => {
        session = s
        // The effect was torn down while the engine was starting — StrictMode
        // does exactly this, and without the check the session leaks and the
        // microphone stays hot after the screen is gone.
        if (cancelled) void s.stop()
      })
      .catch(() => { if (!cancelled) setState('failed') })

    return () => {
      cancelled = true
      if (clearHeardRef.current) clearTimeout(clearHeardRef.current)
      if (clearMissRef.current) clearTimeout(clearMissRef.current)
      void session?.stop()
    }
  }, [enabled])

  return { state, lastHeard, lastMiss }
}

import { useEffect, useRef, useState } from 'react'
import {
  startVoiceSession, VoiceSession, VoiceState,
} from '../lib/voiceRecognition'
import { parseVoiceCommand, looksLikeCommand, VoiceCommand } from '../lib/voiceGrammar'
import { hapticCommandHeard } from '../lib/haptics'

/**
 * Hands-free control of a live workout: owns the microphone while `enabled`,
 * parses what it hears and calls back with a command. Handlers go through a
 * ref so the recogniser is not restarted on every render.
 */

export interface VoiceCommandHandlers {
  onCommand: (command: VoiceCommand) => void
}

interface UseVoiceCommandsResult {
  state: VoiceState
  /** The last parsed phrase, for the on-screen indicator; cleared after a few seconds. */
  lastHeard: string | null
  /** The last phrase aimed at the app that did not parse, so the UI can say so. */
  lastMiss: string | null
}

/** Repeats of the same command within this window are one utterance heard twice. */
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
        // Only phrases plainly aimed at the app, not overheard conversation
        if (looksLikeCommand(text)) {
          setLastMiss(text)
          setLastHeard(null)
          if (clearMissRef.current) clearTimeout(clearMissRef.current)
          clearMissRef.current = setTimeout(() => setLastMiss(null), 5000)
        }
        return
      }
      setLastMiss(null)

      // Same command moments apart — one utterance heard twice
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
        // Torn down while starting (e.g. StrictMode): stop, or the mic stays live
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

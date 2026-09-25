import { useCallback, useRef } from 'react'
import { useSessionPrefsStore } from '../store/useSessionPrefsStore'
import { announce, alert as speakAlert, cues } from '../lib/speech'
import {
  hapticRestComplete, hapticSetLogged, hapticCountdownTick,
  hapticMilestone, hapticSwitchSide,
} from '../lib/haptics'

/**
 * Audio and haptic cues for the live screens, gated once by the session's
 * audio/haptic switches so views can call `say` / `buzz` unconditionally.
 * `interrupt` is for instructions that cannot wait (e.g. "switch side").
 */

export type BuzzKind =
  /** Something finished and the athlete has to act. The loudest pattern. */
  | 'complete'
  /** A set/pose landed. One short confirmation tap. */
  | 'logged'
  /** A split, a round, a lap — that counted, keep going. */
  | 'milestone'
  /** Change sides. The only pattern the athlete acts on with eyes shut. */
  | 'switch'
  /** Three… two… one. */
  | 'tick'

const BUZZ = {
  complete: hapticRestComplete,
  logged: hapticSetLogged,
  milestone: hapticMilestone,
  switch: hapticSwitchSide,
  tick: hapticCountdownTick,
}

export function useLiveCues() {
  const { audio, haptic } = useSessionPrefsStore()

  /** Queued speech — waits for whatever is already talking. */
  const say = useCallback((text: string) => {
    if (audio) void announce(text)
  }, [audio])

  /** Speech that clears the queue. For instruction, not commentary. */
  const interrupt = useCallback((text: string) => {
    if (audio) void speakAlert(text)
  }, [audio])

  const buzz = useCallback((kind: BuzzKind) => {
    if (haptic) void BUZZ[kind]()
  }, [haptic])

  /**
   * The last three seconds of a timer, each spoken once. Tracks the last number
   * spoken, so repeated ticks or a resume never double up.
   */
  const spokenAt = useRef<number | null>(null)
  const countdown = useCallback((secondsLeft: number) => {
    if (secondsLeft > 3 || secondsLeft < 1) {
      if (secondsLeft > 3) spokenAt.current = null
      return
    }
    if (spokenAt.current === secondsLeft) return
    spokenAt.current = secondsLeft
    buzz('tick')
    say(cues.count(secondsLeft))
  }, [buzz, say])

  /** Forget the countdown position — call when a new timer starts. */
  const resetCountdown = useCallback(() => { spokenAt.current = null }, [])

  return { say, interrupt, buzz, countdown, resetCountdown, audio, haptic }
}

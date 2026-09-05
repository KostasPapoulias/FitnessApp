import { useCallback, useRef } from 'react'
import { useSessionPrefsStore } from '../store/useSessionPrefsStore'
import { announce, alert as speakAlert, cues } from '../lib/speech'
import {
  hapticRestComplete, hapticSetLogged, hapticCountdownTick,
  hapticMilestone, hapticSwitchSide,
} from '../lib/haptics'

/**
 * The audio and haptic channel, gated once.
 *
 * Every cue in the app used to hang off the rest path — the `onDone` handler in
 * `ActiveWorkout` and the countdown inside `RestTimer`. That is the only place
 * a *strength* session waits for a clock, so it looked like the whole feature.
 * It is not: a metcon, a run and a mobility hold are the three parts of the app
 * where the phone is guaranteed to be out of your hands, and they were silent.
 *
 * The reason they were silent is that each one owns its own timer, and wiring
 * cues into three more timers means three more copies of
 * `if (audio) … if (haptic) …`. So the gate lives here instead and the views
 * call `say` / `buzz` unconditionally. A view that respects the switches by
 * construction cannot forget to.
 *
 * `speak` vs `interrupt` is the rank already established in `lib/speech.ts`:
 * a split announcement can wait its turn, "switch side" cannot — it is
 * instruction, and instruction arriving late is worse than not arriving.
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
   * The last three seconds of any timer, said once each.
   *
   * Called from a 1Hz tick, so it has to be idempotent per second — a tick that
   * fires twice in the same second (a re-render, a resumed interval) would
   * otherwise stack "two, two" into the queue. The ref remembers the last
   * number spoken rather than the last time it ran, which also makes a paused
   * and resumed countdown replay correctly instead of skipping.
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

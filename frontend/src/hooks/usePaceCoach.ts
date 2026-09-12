import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CoachCue, CoachMode, CoachState, PacePlan, PaceZone,
  evaluatePaceCoach, initialCoachState, stepIndexFor,
} from '../lib/paceCoach'
import { cues } from '../lib/speech'
import { useLiveCues } from './useLiveCues'

/**
 * The pace coach, wired to a live run.
 *
 * The rules live in `lib/paceCoach.ts`; this owns the two things that need a
 * component around them — when to evaluate, and how the athlete turns it off
 * halfway up a hill.
 *
 * Cues are QUEUED (`say`), never interrupting. The kilometre split announcement
 * fires from the same tick as a new kilometre's target, and cutting the split
 * off to say the target would lose the number the athlete was waiting for.
 */

interface Options {
  /** The switch, live. Turning it off mid-run silences it immediately. */
  enabled: boolean
  /** No coaching while paused — a pace of zero is not a pace to correct. */
  running: boolean
  plan: PacePlan
  /**
   * Which coach. 'follow' judges a measured pace, 'dial' judges a setting —
   * see CoachMode. Also decides the wording, because "pick it up" is not an
   * instruction anyone standing on a treadmill can act on.
   */
  mode: CoachMode
  /**
   * The pace being judged, seconds per km. 0 when there is nothing to judge.
   *
   * In 'follow' this is the tracker's rolling window. In 'dial' it is the
   * SETTING, not a measurement — feeding the rolling window there would have
   * the coach correcting the athlete against a number they typed, and then
   * congratulating them for changing it.
   */
  paceSec: number
  meters: number
  elapsedSec: number
}

const phraseFor = (cue: CoachCue, mode: CoachMode): string => {
  if (mode === 'dial') {
    switch (cue.kind) {
      case 'target': return cues.paceSet(cue.step, cue.unit, cue.targetSec)
      case 'faster': return cues.paceDialFaster(cue.targetSec)
      case 'easier': return cues.paceDialEasier(cue.targetSec)
      case 'good': return cues.paceHolding(cue.targetSec)
    }
  }
  switch (cue.kind) {
    case 'target': return cues.paceTarget(cue.step, cue.unit, cue.targetSec)
    case 'faster': return cues.paceFaster(cue.targetSec)
    case 'easier': return cues.paceEasier(cue.targetSec)
    case 'good': return cues.paceGood()
  }
}

export function usePaceCoach({
  enabled, running, plan, mode, paceSec, meters, elapsedSec,
}: Options) {
  const cue = useLiveCues()
  const state = useRef<CoachState>(initialCoachState())
  const [zone, setZone] = useState<PaceZone | null>(null)
  /**
   * What is being steered towards, mirrored into state.
   *
   * Derivable from the plan and the step, and kept here anyway so the screen
   * reads exactly the number the coach last spoke rather than recomputing one
   * from a `meters` that has ticked on since.
   */
  const [targetSec, setTargetSec] = useState<number | null>(null)

  // Read through a ref so the effect below can stay keyed on the run's numbers.
  // Rebuilding it whenever the plan object identity changes would re-run the
  // machine on every render of the screen that owns the plan.
  const planRef = useRef(plan)
  planRef.current = plan
  const modeRef = useRef(mode)
  modeRef.current = mode

  /**
   * Forget everything the coach has said.
   *
   * Called when it is switched off, and when it is switched back on. Without
   * the second one, re-enabling it mid-run resumes from a state describing a
   * kilometre that is long gone — it would sit silent because it thinks it
   * already said this, or announce a target from three kilometres back.
   */
  const reset = useCallback(() => {
    state.current = initialCoachState()
    setZone(null)
    setTargetSec(null)
  }, [])

  const wasEnabled = useRef(enabled)
  useEffect(() => {
    if (wasEnabled.current !== enabled) {
      wasEnabled.current = enabled
      reset()
    }
  }, [enabled, reset])

  // A plan changed mid-run is a different plan: the old dwell, the old spoken
  // zone and any automatic target belong to a target that no longer exists.
  // Keyed on the values rather than the object so a re-render does not reset it.
  // The mode is part of the key: switching a live run from GPS to the dial
  // changes what the numbers mean, so every dwell and spoken zone held against
  // the old one is stale.
  const planKey = `${plan.unit}:${plan.startSec}:${plan.deltaSec}:${mode}`
  const lastPlanKey = useRef(planKey)
  useEffect(() => {
    if (lastPlanKey.current !== planKey) {
      lastPlanKey.current = planKey
      reset()
    }
  }, [planKey, reset])

  useEffect(() => {
    if (!enabled || !running) return

    const result = evaluatePaceCoach(
      state.current,
      { now: Date.now(), paceSec, meters, elapsedSec },
      planRef.current,
      modeRef.current
    )
    state.current = result.state
    setZone(result.zone)
    setTargetSec(result.targetSec)
    if (result.cue) cue.say(phraseFor(result.cue, modeRef.current))
    // `cue` is rebuilt whenever the audio switch changes, which would re-run
    // this against the same reading and could speak the same cue twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, running, paceSec, meters, elapsedSec, planKey])

  return {
    /** Where the athlete is against target right now, for the screen. */
    zone: running ? zone : null,
    /**
     * The target being steered towards. Null only before the coach has been
     * evaluated once — after that a plan always has a number.
     */
    targetSec,
    /** Which step of the plan is underway — kilometres or minutes. */
    step: stepIndexFor(plan.unit, meters, elapsedSec),
    reset,
  }
}

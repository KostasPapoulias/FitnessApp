import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CoachCue, CoachMode, CoachState, PacePlan, PaceZone,
  evaluatePaceCoach, initialCoachState, stepIndexFor,
} from '../lib/paceCoach'
import { cues } from '../lib/speech'
import { useLiveCues } from './useLiveCues'

/**
 * The pace coach wired to a live run: when to evaluate and how it resets. The
 * rules live in lib/paceCoach.ts. Cues are queued, never interrupting (so a
 * split announcement is never cut off).
 */

interface Options {
  /** The switch; turning it off silences it immediately. */
  enabled: boolean
  /** No coaching while paused. */
  running: boolean
  plan: PacePlan
  /** 'follow' judges measured pace; 'dial' judges a machine setting (wording differs too). */
  mode: CoachMode
  /** Pace being judged (s/km): the rolling pace in 'follow', the setting in 'dial'. 0 = nothing to judge. */
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
  /** The current target, mirrored so the screen shows the number last spoken. */
  const [targetSec, setTargetSec] = useState<number | null>(null)

  // Plan read through a ref, so the effect is keyed on the run's numbers only
  const planRef = useRef(plan)
  planRef.current = plan
  const modeRef = useRef(mode)
  modeRef.current = mode

  /** Forget everything said — on switching off and on again, so stale state never resumes. */
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

  // A changed plan or mode resets the coach; keyed on values, not object identity
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
    // `cue` changes with the audio switch; excluded so a reading isn't spoken twice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, running, paceSec, meters, elapsedSec, planKey])

  return {
    /** Current zone against target. */
    zone: running ? zone : null,
    /** The target being steered towards; null until first evaluated. */
    targetSec,
    /** Which step of the plan is underway. */
    step: stepIndexFor(plan.unit, meters, elapsedSec),
    reset,
  }
}

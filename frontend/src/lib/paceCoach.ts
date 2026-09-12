// Coach decisions, pure so they can be simulated. Four rules stop it nagging:
// a tolerance band, a dwell before speaking, speak only when the verdict
// changes, and a floor between cues.

/**
 * Two coaches, not one.
 *
 * 'follow' corrects a body: the pace is a measurement, it drifts on its own,
 * and a correction takes a minute to show up. Everything has to be patient or
 * it nags.
 *
 * 'dial' instructs a machine: the athlete turns a knob and the pace IS the
 * knob, so it changes instantly and exactly. The patient constants make that
 * coach feel broken — you comply, and it sits silent for half a minute before
 * acknowledging it. Same state machine, different clock.
 */
export type CoachMode = 'follow' | 'dial'

interface Timing {
  /** Seconds per km either side of target that still counts as on target. */
  toleranceSec: number
  /** How long off-target must persist before it is worth saying. */
  offDwellMs: number
  /** How long back-on-target must persist. Shorter — this is the reward. */
  onDwellMs: number
  /** Floor between any two zone cues, however the pace behaves. */
  minGapMs: number
  /** No coaching before this. */
  warmupSec: number
  /** Whether running ahead of the target is worth a word. */
  coachFast: boolean
}

const TIMING: Record<CoachMode, Timing> = {
  // The first minute is spent getting a lock and settling into a pace, and
  // coaching it means telling everyone they are too slow at 200m.
  follow: {
    toleranceSec: 8,
    offDwellMs: 20_000,
    onDwellMs: 12_000,
    minGapMs: 30_000,
    warmupSec: 60,
    coachFast: true,
  },
  // Tighter, because a dial has no noise in it: a reading 10s off target is a
  // setting, not a wobble. No warm-up either — the speed is chosen before the
  // belt moves, so there is nothing to settle into.
  dial: {
    toleranceSec: 4,
    offDwellMs: 4_000,
    onDwellMs: 2_500,
    minGapMs: 8_000,
    warmupSec: 0,
    coachFast: true,
  },
}

/**
 * Paces outside this are not paces — a bad plan should never be spoken.
 *
 * Physical, not defensive, and much wider than a runner's range on purpose:
 * 2:30–15:00 was the running envelope and it silently broke every machine.
 * An air bike's reference speed is 28 km/h, which is 2:08 per kilometre — so
 * the old floor clamped it to 2:30, the coach told a fan-bike session to ease
 * back to a pace slower than its own baseline, and there was no way to ask for
 * anything faster.
 *
 * 45s/km is 80 km/h and 30:00/km is 2 km/h; nobody sustains either on anything
 * in the catalogue. Narrowing to something sensible for a PARTICULAR movement
 * is the sheet's job, which knows what movement it is — see PaceSheet.
 */
const MIN_TARGET_SEC = 45     // 80 km/h
const MAX_TARGET_SEC = 1800   // 2 km/h

export const clampTarget = (seconds: number): number =>
  Math.min(MAX_TARGET_SEC, Math.max(MIN_TARGET_SEC, Math.round(seconds)))

/**
 * What a step of the plan is measured in.
 *
 * 'km' is the natural unit for a run and useless on an erg that has been reset
 * — "kilometre three" means nothing there. 'min' is the natural unit for a
 * machine, for intervals, and for anyone who plans by time rather than
 * distance. Both index the same list; only the boundary differs.
 */
export type PaceUnit = 'km' | 'min'

/**
 * A pace plan: where you start, and how it moves.
 *
 * This replaced a list of one pace per unit. The list could express more, and
 * nobody wanted any of it — planning a run meant adding a kilometre, setting
 * its pace, adding another, setting that one, and the only shapes anyone
 * actually ran were "hold this" and "take five seconds off every kilometre".
 * Two numbers say both, and say them before the run rather than during it.
 *
 * `deltaSec` is signed and applies from the second unit on: negative gets
 * faster, positive eases off, zero holds. Clamped per step, so a long
 * progression flattens at the end of the range instead of asking for 1:30/km.
 */
export interface PacePlan {
  unit: PaceUnit
  /** Pace for the first unit, seconds per kilometre. */
  startSec: number
  /** Applied per unit after the first. Negative is faster. */
  deltaSec: number
}

/**
 * How far a progression may drift from where it started, either way.
 *
 * The global clamp cannot do this job. It is a physical envelope — 45s/km to
 * 30:00/km — wide enough to hold a fan bike and a swim, which means it is far
 * too wide to stop a running plan: 6:00/km losing 30s a kilometre reaches
 * 1:00/km by the twelfth and the clamp never objects.
 *
 * Relative to the athlete's own starting pace instead, which needs no knowledge
 * of the movement: nobody's planned tenth unit is 40% faster than their first.
 * Past that the progression holds, and the sheet's preview says so.
 */
const MAX_DRIFT = 0.4

export const targetForStep = (plan: PacePlan, step: number): number => {
  const drifted = plan.startSec + plan.deltaSec * (Math.max(1, step) - 1)
  const floor = plan.startSec * (1 - MAX_DRIFT)
  const ceiling = plan.startSec * (1 + MAX_DRIFT)
  return clampTarget(Math.min(ceiling, Math.max(floor, drifted)))
}

/** A plan in words, for a button that has one line to say what it will do. */
export const describePlan = (plan: PacePlan): string => {
  const unit = plan.unit === 'km' ? 'km' : 'min'
  const pace = formatPaceSec(plan.startSec)
  if (plan.deltaSec === 0) return `${pace} / km, held`
  const verb = plan.deltaSec < 0 ? 'faster' : 'easier'
  return `${pace} / km, ${Math.abs(plan.deltaSec)}s ${verb} per ${unit}`
}

/** m:ss. Duplicated from `fmtTime` so this module stays free of UI imports. */
const formatPaceSec = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * Which step is underway, 1-based.
 *
 * Distance for 'km', the clock for 'min'. Both floor-then-add-one, so the
 * first metre and the first second are already inside step 1 — a plan whose
 * opening target only applied after a kilometre had no opening target at all.
 */
export const stepIndexFor = (
  unit: PaceUnit,
  meters: number,
  elapsedSec: number
): number =>
  unit === 'km'
    ? Math.floor(Math.max(0, meters) / 1000) + 1
    : Math.floor(Math.max(0, elapsedSec) / 60) + 1

export type PaceZone = 'on' | 'fast' | 'slow'

/**
 * Null when there is no pace to judge — stopped, or not yet measured.
 *
 * The band is asymmetric on purpose, and `fastToleranceSec` is why. See
 * `fastToleranceFor`: on a plan that gets faster, running ahead of the current
 * step is running towards the next one.
 */
export const zoneFor = (
  paceSec: number,
  targetSec: number,
  toleranceSec: number,
  fastToleranceSec: number = toleranceSec
): PaceZone | null => {
  if (!Number.isFinite(paceSec) || paceSec <= 0) return null
  if (paceSec > targetSec + toleranceSec) return 'slow'
  if (paceSec < targetSec - fastToleranceSec) return 'fast'
  return 'on'
}

/**
 * How far ahead of target is still "on target".
 *
 * A simulation of a negative split made the need obvious. The athlete ran each
 * kilometre at exactly its target, but a descending plan steps on distance
 * while a body changes gear a little early — so they sat 10s ahead of the
 * current step for the last stretch of every kilometre and were told to ease
 * off, twenty seconds before the target moved to the pace they were already
 * running. Told to slow down for getting it right.
 *
 * Widening the fast side by the step size lets an athlete anticipate one step
 * and no more: on a 10s-per-km plan, 10s early is fine and 25s early is still
 * burning the plan and still worth saying. An easing plan gets no widening —
 * going faster than a plan that says ease off is exactly the mistake it is
 * there to prevent.
 */
const fastToleranceFor = (plan: PacePlan, toleranceSec: number): number =>
  toleranceSec + Math.max(0, -plan.deltaSec)

export type CoachCue =
  /** The target for a new step, or the run's opening target. */
  | { kind: 'target'; step: number; unit: PaceUnit; targetSec: number }
  | { kind: 'faster'; targetSec: number }
  | { kind: 'easier'; targetSec: number }
  | { kind: 'good'; targetSec: number }

export interface CoachState {
  /** The zone the athlete was last TOLD about — not the one they are in. */
  spoken: PaceZone
  observed: PaceZone | null
  observedSince: number
  lastCueAt: number
  /** Highest step whose target has been announced. 0 = nothing yet. */
  announcedStep: number
  /** The pace being run when the last correction was given. */
  paceWhenTold: number | null
}

export const initialCoachState = (): CoachState => ({
  spoken: 'on',
  observed: null,
  observedSince: 0,
  lastCueAt: 0,
  announcedStep: 0,
  paceWhenTold: null,
})

export interface CoachInput {
  /** Wall clock, in ms. Dwell is measured in real time, not in ticks. */
  now: number
  /** Seconds per kilometre over a rolling window — see useRunTracker. */
  paceSec: number
  meters: number
  elapsedSec: number
}

export interface CoachResult {
  state: CoachState
  cue: CoachCue | null
  zone: PaceZone | null
  /** What is being steered towards right now. Never null — a plan always has one. */
  targetSec: number
}

/**
 * Stops "good pace" going to someone who never changed anything.
 *
 * Back inside the band is only worth a word if the athlete put themselves
 * there. Without this, drifting back across the tolerance line by accident
 * earns the same acknowledgement as actually fixing it, and the cue stops
 * meaning anything.
 */
const earnedTheReward = (
  spoken: PaceZone,
  paceWhenTold: number | null,
  paceSec: number,
  toleranceSec: number
): boolean => {
  if (paceWhenTold === null) return true
  return spoken === 'slow'
    ? paceSec <= paceWhenTold - toleranceSec   // told to speed up, and did
    : paceSec >= paceWhenTold + toleranceSec   // told to ease off, and did
}

/** One reading in, at most one cue out. A new target outranks a zone cue. */
export const evaluatePaceCoach = (
  state: CoachState,
  input: CoachInput,
  plan: PacePlan,
  mode: CoachMode = 'follow'
): CoachResult => {
  const timing = TIMING[mode]
  const toleranceSec = timing.toleranceSec
  const fastToleranceSec = fastToleranceFor(plan, toleranceSec)
  const warm = input.elapsedSec >= timing.warmupSec

  const step = stepIndexFor(plan.unit, input.meters, input.elapsedSec)
  const targetSec = targetForStep(plan, step)

  // Announced when the number actually changes, so a flat plan is said once at
  // the start and a stepped plan is said whenever the next step differs.
  const targetChanged =
    state.announcedStep === 0 ||
    (step > state.announcedStep && targetSec !== targetForStep(plan, state.announcedStep))

  if (targetChanged) {
    return {
      state: {
        ...state,
        spoken: 'on',
        observed: null,
        observedSince: input.now,
        lastCueAt: input.now,
        announcedStep: step,
        paceWhenTold: null,
      },
      cue: { kind: 'target', step, unit: plan.unit, targetSec },
      zone: zoneFor(input.paceSec, targetSec, toleranceSec, fastToleranceSec),
      targetSec,
    }
  }

  // Keep the counter current on a flat plan, so switching the coach on mid-run
  // does not replay every step already covered.
  return judge(
    { ...state, announcedStep: Math.max(state.announcedStep, step) },
    input, targetSec, timing, warm, fastToleranceSec
  )
}

/** The dwell machine: four rules, and every cue after the first goes through it. */
const judge = (
  state: CoachState,
  input: CoachInput,
  targetSec: number,
  timing: Timing,
  warm: boolean,
  fastToleranceSec: number
): CoachResult => {
  const toleranceSec = timing.toleranceSec
  const zone = zoneFor(input.paceSec, targetSec, toleranceSec, fastToleranceSec)

  // Nothing to judge, or too early. The observation is dropped rather than
  // held: a dwell that spans a stop is not a dwell.
  if (zone === null || !warm) {
    return {
      state: { ...state, observed: null, observedSince: input.now },
      cue: null,
      zone,
      targetSec,
    }
  }

  // A mode that does not coach 'fast' folds it into 'on' for everything the
  // coach SAYS, while the screen still shows it honestly. Folding rather than
  // returning early is what lets someone who was told to pick it up, and
  // overshot, still hear that they fixed it. Both modes coach it today; the
  // branch stays because the zone and the cue are genuinely separate questions.
  const heard: PaceZone = zone === 'fast' && !timing.coachFast ? 'on' : zone

  const observed = heard === state.observed ? state.observed : heard
  const observedSince = heard === state.observed ? state.observedSince : input.now
  const held = input.now - observedSince
  const needed = heard === 'on' ? timing.onDwellMs : timing.offDwellMs

  const ready =
    heard !== state.spoken &&
    held >= needed &&
    input.now - state.lastCueAt >= timing.minGapMs

  if (!ready) {
    return { state: { ...state, observed, observedSince }, cue: null, zone, targetSec }
  }

  // Back in the band without having changed anything: adopt it silently, so the
  // next real departure is still worth a word.
  if (heard === 'on' && !earnedTheReward(state.spoken, state.paceWhenTold, input.paceSec, toleranceSec)) {
    return {
      state: { ...state, observed, observedSince, spoken: 'on', paceWhenTold: null },
      cue: null,
      zone,
      targetSec,
    }
  }

  return {
    state: {
      ...state,
      observed,
      observedSince,
      spoken: heard,
      lastCueAt: input.now,
      paceWhenTold: heard === 'on' ? null : input.paceSec,
    },
    cue:
      heard === 'slow' ? { kind: 'faster', targetSec }
      : heard === 'fast' ? { kind: 'easier', targetSec }
      : { kind: 'good', targetSec },
    zone,
    targetSec,
  }
}

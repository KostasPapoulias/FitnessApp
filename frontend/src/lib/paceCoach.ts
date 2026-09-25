// Coach decisions, pure so they can be simulated. Four rules stop it nagging:
// a tolerance band, a dwell before speaking, speak only when the verdict
// changes, and a floor between cues.

/**
 * 'follow' coaches a measured pace (noisy, slow to respond, so patient);
 * 'dial' coaches a machine setting (exact and instant, so quick). Same state
 * machine, different timings.
 */
export type CoachMode = 'follow' | 'dial'

interface Timing {
  /** Seconds per km either side of target that still counts as on target. */
  toleranceSec: number
  /** How long off-target must persist before it is worth saying. */
  offDwellMs: number
  /** How long back-on-target must persist (shorter — it is the reward). */
  onDwellMs: number
  /** Minimum gap between zone cues. */
  minGapMs: number
  /** No coaching before this. */
  warmupSec: number
  /** Whether running ahead of target is coached. */
  coachFast: boolean
}

const TIMING: Record<CoachMode, Timing> = {
  // No coaching in the first minute, while the GPS locks and the pace settles
  follow: {
    toleranceSec: 8,
    offDwellMs: 20_000,
    onDwellMs: 12_000,
    minGapMs: 30_000,
    warmupSec: 60,
    coachFast: true,
  },
  // Tighter and no warm-up: a dial reading has no noise
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
 * Physical pace bounds (s/km) for any movement in the catalogue. Per-movement
 * ranges are the pace sheet's job.
 */
const MIN_TARGET_SEC = 45     // 80 km/h
const MAX_TARGET_SEC = 1800   // 2 km/h

export const clampTarget = (seconds: number): number =>
  Math.min(MAX_TARGET_SEC, Math.max(MIN_TARGET_SEC, Math.round(seconds)))

/** What a plan step is measured in: kilometres (road) or minutes (machines, intervals). */
export type PaceUnit = 'km' | 'min'

/**
 * A pace plan: a starting pace and a signed per-step change from the second
 * step on (negative gets faster, 0 holds). Clamped per step.
 */
export interface PacePlan {
  unit: PaceUnit
  /** Pace for the first unit, seconds per kilometre. */
  startSec: number
  /** Applied per unit after the first. Negative is faster. */
  deltaSec: number
}

/** Max drift from the starting pace, either way — a progression holds past it. */
const MAX_DRIFT = 0.4

export const targetForStep = (plan: PacePlan, step: number): number => {
  const drifted = plan.startSec + plan.deltaSec * (Math.max(1, step) - 1)
  const floor = plan.startSec * (1 - MAX_DRIFT)
  const ceiling = plan.startSec * (1 + MAX_DRIFT)
  return clampTarget(Math.min(ceiling, Math.max(floor, drifted)))
}

/** The plan in words, for a one-line button. */
export const describePlan = (plan: PacePlan): string => {
  const unit = plan.unit === 'km' ? 'km' : 'min'
  const pace = formatPaceSec(plan.startSec)
  if (plan.deltaSec === 0) return `${pace} / km, held`
  const verb = plan.deltaSec < 0 ? 'faster' : 'easier'
  return `${pace} / km, ${Math.abs(plan.deltaSec)}s ${verb} per ${unit}`
}

/** m:ss (duplicated from fmtTime to keep this module free of UI imports). */
const formatPaceSec = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** The current step, 1-based, by distance ('km') or clock ('min'); step 1 starts at zero. */
export const stepIndexFor = (
  unit: PaceUnit,
  meters: number,
  elapsedSec: number
): number =>
  unit === 'km'
    ? Math.floor(Math.max(0, meters) / 1000) + 1
    : Math.floor(Math.max(0, elapsedSec) / 60) + 1

export type PaceZone = 'on' | 'fast' | 'slow'

/** The zone for a pace, or null when there is nothing to judge. The fast side can be wider (see below). */
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
 * How far ahead of target still counts as on target: on a plan that gets
 * faster, one step of anticipation is allowed. Easing plans get none.
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
  /** The zone the athlete was last told about. */
  spoken: PaceZone
  observed: PaceZone | null
  observedSince: number
  lastCueAt: number
  /** Highest step whose target has been announced (0 = none). */
  announcedStep: number
  /** Pace at the last correction. */
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
  /** Wall clock (ms); dwell is measured in real time. */
  now: number
  /** Rolling pace, s/km. */
  paceSec: number
  meters: number
  elapsedSec: number
}

export interface CoachResult {
  state: CoachState
  cue: CoachCue | null
  zone: PaceZone | null
  /** The current target; a plan always has one. */
  targetSec: number
}

/** "Good pace" only when the athlete actually moved back after being told. */
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

/** One reading in, at most one cue out; a new target outranks a zone cue. */
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

  // Announce a target only when its number changes
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

  // Keep the step counter current, so re-enabling mid-run doesn't replay old steps
  return judge(
    { ...state, announcedStep: Math.max(state.announcedStep, step) },
    input, targetSec, timing, warm, fastToleranceSec
  )
}

/** The dwell machine: every cue after the first goes through it. */
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

  // Nothing to judge, or too early: drop the observation (a dwell can't span a stop)
  if (zone === null || !warm) {
    return {
      state: { ...state, observed: null, observedSince: input.now },
      cue: null,
      zone,
      targetSec,
    }
  }

  // Without fast coaching, 'fast' is spoken as 'on' (the screen still shows it)
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

  // Back on target without having changed: adopt silently
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

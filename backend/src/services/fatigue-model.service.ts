// The fatigue model: pure calibration constants and scoring functions.
//
// Every modality is scored in one unit, the hard-set equivalent (HSE) — one
// working set near failure by a prime mover.
//   Muscle fatigue = HSE × impactFactor × FATIGUE_PER_HSE, accumulated with saturation.
//   Systemic load  = Foster's sRPE (minutes × RPE), weighted by modality mix.

// ── calibration constants ──────────────────────────────────────────────────
// Fatigue points a prime mover takes from one hard set (~8 hard sets ≈ 100).
export const FATIGUE_PER_HSE = 13

// sRPE units per systemic fatigue point (30 min at RPE 6 → 180 AU → ~22 points).
export const SYSTEMIC_AU_PER_POINT = 8

// Hours for whole-body fatigue to halve.
export const SYSTEMIC_HALF_LIFE_HOURS = 16

// Minutes of work per HSE; metcons are denser than steady cardio.
const CARDIO_MINUTES_PER_HSE = 11
const WOD_MINUTES_PER_HSE = 4.5

// Share of local cardio damage that accrues regardless of RPE — local damage
// tracks volume first, intensity second.
const CARDIO_VOLUME_SHARE = 0.6

// Max work a count may claim per minute, as a multiple of the reference cadence.
const MAX_CARDIO_DENSITY = 2.5

// Seconds of isometric hold treated as one rep.
export const HOLD_SECONDS_PER_REP = 3

// Cardiovascular cost per minute of each modality, for systemic load.
const MODALITY_SYSTEMIC_WEIGHT: Record<string, number> = {
  STRENGTH: 0.6,
  CALISTHENICS: 0.8,
  CARDIO: 1.0,
  WOD: 1.2,
  MOBILITY: 0.2,
}

// Recovery half-life multiplier by training level.
export const RECOVERY_RATE_BY_LEVEL: Record<string, number> = {
  beginner: 1.15,
  intermediate: 1.0,
  advanced: 0.85,
}

// Age at which the age multiplier is exactly 1.0.
const RECOVERY_REFERENCE_AGE = 30
// Added to the half-life multiplier per year past the reference age.
const RECOVERY_AGE_SLOPE = 0.006

/** Recovery multiplier from age alone, clamped to 0.92–1.25. */
export const ageRecoveryFactor = (age: number | null | undefined): number => {
  if (age == null || !Number.isFinite(age) || age <= 0) return 1
  return clamp(1 + (age - RECOVERY_REFERENCE_AGE) * RECOVERY_AGE_SLOPE, 0.92, 1.25)
}

/** The recovery multiplier for a muscle's half-life: level × age. Use this, not the table. */
export const recoveryRateFor = (
  fitnessLevel: string | null | undefined,
  age: number | null | undefined
): number => {
  const level = fitnessLevel?.toLowerCase().trim() ?? ''
  const base = RECOVERY_RATE_BY_LEVEL[level] ?? RECOVERY_RATE_BY_LEVEL.intermediate
  return base * ageRecoveryFactor(age)
}

/** Age in whole years, preferring birthDate over the stored `age`. */
export const resolveAge = (
  birthDate: Date | null | undefined,
  storedAge: number | null | undefined,
  now: Date = new Date()
): number | null => {
  if (birthDate) {
    const years = (now.getTime() - birthDate.getTime()) / (365.2425 * 24 * 60 * 60 * 1000)
    if (years > 0 && years < 120) return Math.floor(years)
  }
  return storedAge ?? null
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// ── effort ─────────────────────────────────────────────────────────────────

/** Share of a set's fatigue potential spent: RPE 10 = failure, ≤3 ≈ warm-up. Unrated sets count as 7. */
export const rpeFactor = (rpe: number | null | undefined): number =>
  clamp(((rpe ?? 7) - 3) / 7, 0.05, 1)

/** Epley 1RM adjusted for reps in reserve. */
export const estimateE1rm = (weight: number, reps: number, rpe: number | null | undefined): number => {
  if (weight <= 0 || reps <= 0) return 0
  const repsInReserve = clamp(10 - (rpe ?? 8), 0, 5)
  return weight * (1 + (reps + repsInReserve) / 30)
}

/** Heavier sets relative to the athlete's e1RM cost more at the same RPE. */
const loadFactor = (weight: number, e1rm: number): number => {
  if (e1rm <= 0 || weight <= 0) return 1
  const relative = weight / e1rm
  return 1 + 0.7 * clamp((relative - 0.5) / 0.4, 0, 1)
}

/** More reps cost more, sub-linearly. */
const repFactor = (reps: number): number =>
  reps <= 0 ? 0 : clamp(Math.pow(reps / 10, 0.35), 0.55, 1.35)

// ── per-set scoring ────────────────────────────────────────────────────────

export interface ResistanceSet {
  reps: number
  /** Total load: bar weight, or bodyweight + added for calisthenics. */
  weight: number
  rpe?: number | null
  /** Seconds under tension, for isometric holds logged without reps. */
  holdSeconds?: number | null
  /** Best known 1RM for the exercise; 0 without history. */
  e1rm?: number
}

/** Strength and calisthenics share one curve; calisthenics passes bodyweight + added load. */
export const resistanceHse = (set: ResistanceSet): number => {
  const reps = set.reps > 0
    ? set.reps
    : (set.holdSeconds ?? 0) / HOLD_SECONDS_PER_REP
  if (reps <= 0) return 0

  // History only raises the estimate, so a light day scores as light
  const e1rm = Math.max(set.e1rm ?? 0, estimateE1rm(set.weight, reps, set.rpe))

  return rpeFactor(set.rpe) * repFactor(reps) * loadFactor(set.weight, e1rm)
}

/**
 * Local muscular cost of cardio, as "minutes of typical work" from (in order
 * of preference) distance vs reference speed, count vs reference cadence, or
 * the clock. RPE is a modifier only; `systemicLoad` scores whole-body cost.
 */
export const cardioHse = (
  seconds: number,
  rpe?: number | null,
  distanceKm?: number | null,
  referenceSpeedKmh?: number | null,
  reps?: number | null,
  referenceCadenceRpm?: number | null
): number => {
  if (seconds <= 0) return 0

  const minutes = seconds / 60

  // Distance as minutes of typical work
  const byDistance =
    distanceKm && distanceKm > 0 && referenceSpeedKmh && referenceSpeedKmh > 0
      ? (distanceKm / referenceSpeedKmh) * 60
      : null

  // Count against reference cadence; working at exactly that cadence returns the duration
  const byCount =
    reps && reps > 0 && referenceCadenceRpm && referenceCadenceRpm > 0
      ? Math.min(reps / referenceCadenceRpm, minutes * MAX_CARDIO_DENSITY)
      : null

  // The clock alone — least informative, still valid
  const workMinutes = byDistance ?? byCount ?? minutes

  const intensity =
    CARDIO_VOLUME_SHARE + (1 - CARDIO_VOLUME_SHARE) * rpeFactor(rpe)

  return (workMinutes / CARDIO_MINUTES_PER_HSE) * intensity
}

/** A typical metcon turns over about this many reps per minute. */
const WOD_REFERENCE_DENSITY = 15

/** A metcon's total cost before it is split across movements; rep density scales it. */
export const wodHse = (
  seconds: number,
  rpe?: number | null,
  totalReps?: number | null
): number => {
  if (seconds <= 0) return 0
  const minutes = seconds / 60
  const base = (minutes / WOD_MINUTES_PER_HSE) * rpeFactor(rpe)
  if (!totalReps || totalReps <= 0) return base
  const density = totalReps / minutes
  return base * clamp(density / WOD_REFERENCE_DENSITY, 0.6, 2)
}

/**
 * How much heavier a loaded metcon movement is than at bodyweight, relative to
 * the athlete's bodyweight. Capped low — a metcon's cost is mostly its density
 * and duration.
 */
const WOD_LOAD_REFERENCE = 0.75
const WOD_LOAD_CEILING = 0.8

export const wodLoadFactor = (
  weightKg: number | null | undefined,
  bodyWeightKg: number
): number => {
  if (!weightKg || weightKg <= 0) return 1
  if (bodyWeightKg <= 0) return 1
  const relative = weightKg / bodyWeightKg
  return 1 + WOD_LOAD_CEILING * clamp(relative / WOD_LOAD_REFERENCE, 0, 1)
}

/** Mobility is restorative: zero fatigue. */
export const mobilityHse = (): number => 0

// ── accumulation ───────────────────────────────────────────────────────────

/** Add fatigue with saturation: approaches 100 asymptotically, keeping order. */
export const accumulate = (current: number, delta: number): number => {
  if (delta <= 0) return current
  const headroom = Math.max(0, 100 - current)
  return current + delta * (headroom / 100)
}

// ── systemic load ──────────────────────────────────────────────────────────

/** Foster's session-RPE load (AU): minutes × avgRPE, weighted by the session's modality mix. */
export const systemicLoad = (
  durationSeconds: number,
  avgRpe: number,
  setTypeCounts: Map<string, number>
): number => {
  const minutes = durationSeconds / 60
  if (minutes <= 0 || avgRpe <= 0) return 0

  const total = [...setTypeCounts.values()].reduce((a, b) => a + b, 0)
  const weight = total === 0
    ? MODALITY_SYSTEMIC_WEIGHT.STRENGTH
    : [...setTypeCounts].reduce(
        (acc, [type, count]) =>
          acc + (MODALITY_SYSTEMIC_WEIGHT[type] ?? 0.6) * (count / total),
        0
      )

  return minutes * avgRpe * weight
}

/** Systemic load (AU) → fatigue points. */
export const systemicFatigueDelta = (load: number): number =>
  load <= 0 ? 0 : load / SYSTEMIC_AU_PER_POINT

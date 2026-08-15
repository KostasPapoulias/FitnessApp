// The fatigue model.
//
// Every modality is scored into ONE unit: the hard-set equivalent (HSE), where
// 1.0 HSE is a working set taken close to failure by a prime mover. That is the
// only way strength, calisthenics, cardio and metcons can be compared, and it
// is what the previous model lacked — it multiplied kg·reps, bare reps and raw
// seconds by the same 0.1 constant, so a 5×100 kg bench set scored +40 fatigue
// while a 3-minute run scored +6.
//
// Muscle fatigue  = HSE × impactFactor × FATIGUE_PER_HSE, accumulated with
//                   saturation so it approaches 100 instead of slamming into it.
// Systemic load   = Foster's sRPE (minutes × RPE), weighted by how
//                   cardiovascularly expensive the modality mix was. This is the
//                   whole-body cost that no per-muscle number can express — the
//                   reason a long run used to leave readiness untouched.

// ── calibration constants ──────────────────────────────────────────────────
// Fatigue points a prime mover takes from one hard set. ~8 hard sets on a
// single muscle in one session drives it near 100.
export const FATIGUE_PER_HSE = 13

// sRPE arbitrary units per point of systemic fatigue. 30 min at RPE 6 → 180 AU
// → ~22 points; a 90-minute hard session → ~90.
export const SYSTEMIC_AU_PER_POINT = 8

// Hours for whole-body fatigue to halve. Systemic recovery tracks sleep and
// glycogen more than tissue repair, so it clears faster than a large muscle.
export const SYSTEMIC_HALF_LIFE_HOURS = 16

// Minutes of work per hard-set equivalent, per modality. Metcons cost more per
// minute than steady-state cardio — the work density is far higher.
const CARDIO_MINUTES_PER_HSE = 11
const WOD_MINUTES_PER_HSE = 4.5

// Share of local cardio damage that accrues regardless of how hard it felt.
//
// RPE is a cardiovascular signal, so leaning on it alone gets endurance work
// exactly backwards: a two-hour easy run feels like a 4 and shreds the legs,
// while twenty minutes of intervals feels like a 9 and barely touches them.
// Local damage tracks VOLUME first and intensity second; systemic load is where
// intensity dominates.
const CARDIO_VOLUME_SHARE = 0.6

// Seconds of isometric hold treated as one rep.
export const HOLD_SECONDS_PER_REP = 3

// How cardiovascularly costly a minute of each modality is, for systemic load.
// Strength is discounted heavily: most of a strength session is rest.
const MODALITY_SYSTEMIC_WEIGHT: Record<string, number> = {
  STRENGTH: 0.6,
  CALISTHENICS: 0.8,
  CARDIO: 1.0,
  WOD: 1.2,
  MOBILITY: 0.2,
}

// Recovery half-lives scale with training age: trained athletes clear fatigue
// faster, beginners slower.
export const RECOVERY_RATE_BY_LEVEL: Record<string, number> = {
  beginner: 1.15,
  intermediate: 1.0,
  advanced: 0.85,
}

// Chronological age at which the age multiplier is exactly 1.0. Recovery
// capacity is roughly flat through the twenties and declines gradually after.
const RECOVERY_REFERENCE_AGE = 30
// Added to the half-life multiplier per year past the reference age. Small on
// purpose — training age (the level multiplier above) explains far more of the
// variance than birth year does, and this must not overwhelm it.
const RECOVERY_AGE_SLOPE = 0.006

/**
 * How much slower (or faster) this athlete clears fatigue, from age alone.
 *
 * Clamped hard at both ends. The linear term is a reasonable approximation
 * across a normal training population and nonsense outside it — extrapolated
 * freely it would claim a 75-year-old recovers three times slower than a
 * 30-year-old, which is not what the literature supports.
 */
export const ageRecoveryFactor = (age: number | null | undefined): number => {
  if (age == null || !Number.isFinite(age) || age <= 0) return 1
  return clamp(1 + (age - RECOVERY_REFERENCE_AGE) * RECOVERY_AGE_SLOPE, 0.92, 1.25)
}

/**
 * The single recovery multiplier to apply to a muscle's half-life.
 *
 * Combines self-reported training level with age. Every caller should use this
 * rather than reaching for RECOVERY_RATE_BY_LEVEL directly, so the two inputs
 * cannot drift apart between the fatigue controller and the workout finish
 * path — which is exactly what happened when level was the only term.
 */
export const recoveryRateFor = (
  fitnessLevel: string | null | undefined,
  age: number | null | undefined
): number => {
  const level = fitnessLevel?.toLowerCase().trim() ?? ''
  const base = RECOVERY_RATE_BY_LEVEL[level] ?? RECOVERY_RATE_BY_LEVEL.intermediate
  return base * ageRecoveryFactor(age)
}

/**
 * Age in whole years from a birth date, preferring it over a stored `age`.
 *
 * A profile written before birthDate existed only has the integer, and it has
 * been going stale ever since — so the stored value is the fallback, never the
 * first choice.
 */
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

/**
 * How much of a set's fatigue potential the athlete actually spent.
 *
 * Proximity to failure dominates fatigue far more than tonnage does: RPE 10 is
 * a set to failure, RPE 7 leaves 3 reps in reserve and costs roughly half,
 * anything at or under RPE 3 is a warm-up.
 */
export const rpeFactor = (rpe: number | null | undefined): number =>
  clamp(((rpe ?? 7) - 3) / 7, 0.05, 1)

/**
 * Epley 1RM adjusted for reps left in reserve. Lets relative load be scored on
 * the very first session, before any history exists.
 */
export const estimateE1rm = (weight: number, reps: number, rpe: number | null | undefined): number => {
  if (weight <= 0 || reps <= 0) return 0
  const repsInReserve = clamp(10 - (rpe ?? 8), 0, 5)
  return weight * (1 + (reps + repsInReserve) / 30)
}

/**
 * Heavy sets cost more than light ones at the same RPE — the same 30 seconds
 * under a limit single and under a burnout set are not equivalent. Scored
 * RELATIVE to the athlete, so a 140 kg bencher and a 70 kg bencher pay the same
 * price for the same 5×5 at the same effort. That relative framing is the whole
 * point: absolute tonnage punished strong users.
 */
const loadFactor = (weight: number, e1rm: number): number => {
  if (e1rm <= 0 || weight <= 0) return 1
  const relative = weight / e1rm
  return 1 + 0.7 * clamp((relative - 0.5) / 0.4, 0, 1)
}

/**
 * Sets of 20 cost more than sets of 5, but nowhere near four times as much —
 * and the curve has to stay flat enough that a long light set never outscores a
 * heavy one taken to the same RPE.
 */
const repFactor = (reps: number): number =>
  reps <= 0 ? 0 : clamp(Math.pow(reps / 10, 0.35), 0.55, 1.35)

// ── per-set scoring ────────────────────────────────────────────────────────

export interface ResistanceSet {
  reps: number
  /** Total load moved: bar weight, or bodyweight + added for calisthenics. */
  weight: number
  rpe?: number | null
  /** Seconds under tension, for isometric holds logged without reps. */
  holdSeconds?: number | null
  /** Best known 1RM for this exercise. 0 when the athlete has no history. */
  e1rm?: number
}

/**
 * Strength and calisthenics share one curve. Calisthenics simply passes
 * bodyweight (plus any added or assisted load) as the weight, which is what
 * makes a set of push-ups and a set of bench press finally comparable — under
 * the old model the same effort scored 10 vs 40.
 */
export const resistanceHse = (set: ResistanceSet): number => {
  const reps = set.reps > 0
    ? set.reps
    : (set.holdSeconds ?? 0) / HOLD_SECONDS_PER_REP
  if (reps <= 0) return 0

  // History only ever raises the estimate, so a light day is correctly scored
  // as light instead of looking maximal to a naive per-set estimate.
  const e1rm = Math.max(set.e1rm ?? 0, estimateE1rm(set.weight, reps, set.rpe))

  return rpeFactor(set.rpe) * repFactor(reps) * loadFactor(set.weight, e1rm)
}

/**
 * Local muscular cost of cardio — what the legs actually absorb.
 *
 * Volume comes from distance where the activity has a meaningful speed, so 15 km
 * on a bike and 15 km on foot are not counted as equal work; otherwise it falls
 * back to duration (treadmill without GPS, jump rope, anything logged on a
 * clock). Intensity still matters, but only as a modifier — see
 * CARDIO_VOLUME_SHARE.
 *
 * The whole-body cost of the same session is scored separately by
 * `systemicLoad`, where intensity leads instead.
 */
export const cardioHse = (
  seconds: number,
  rpe?: number | null,
  distanceKm?: number | null,
  referenceSpeedKmh?: number | null
): number => {
  if (seconds <= 0) return 0

  const minutes = seconds / 60
  // Distance expressed as "minutes of typical work", which is comparable across
  // activities in a way that raw kilometres never are.
  const workMinutes =
    distanceKm && distanceKm > 0 && referenceSpeedKmh && referenceSpeedKmh > 0
      ? (distanceKm / referenceSpeedKmh) * 60
      : minutes

  const intensity =
    CARDIO_VOLUME_SHARE + (1 - CARDIO_VOLUME_SHARE) * rpeFactor(rpe)

  return (workMinutes / CARDIO_MINUTES_PER_HSE) * intensity
}

/** A typical metcon turns over about this many reps per minute. */
const WOD_REFERENCE_DENSITY = 15

/**
 * A metcon's total cost, before it is split across its movements.
 *
 * `totalReps` is what the athlete actually completed (movement reps × rounds).
 * Work density is what separates eight rounds from three inside the same time
 * cap — under the old model both scored identically, because only the clock was
 * ever recorded.
 */
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
 * Mobility is restorative, not fatiguing. It scores zero rather than the
 * rounding noise the old model produced (a 30-second hold moved a muscle by
 * 0.07 points), and contributes almost nothing systemically.
 */
export const mobilityHse = (): number => 0

// ── accumulation ───────────────────────────────────────────────────────────

/**
 * Add fatigue with saturation. A hard cap at 100 threw away everything past the
 * limit, so a session three times too hard and a merely hard one both read
 * exactly 100. This approaches 100 asymptotically and keeps the ordering.
 */
export const accumulate = (current: number, delta: number): number => {
  if (delta <= 0) return current
  const headroom = Math.max(0, 100 - current)
  return current + delta * (headroom / 100)
}

// ── systemic load ──────────────────────────────────────────────────────────

/**
 * Foster's session-RPE training load, in arbitrary units: minutes × RPE,
 * weighted by the modality mix. `setTypeCounts` is how many sets of each type
 * the session held — a session that is 80% cardio is weighted accordingly.
 */
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

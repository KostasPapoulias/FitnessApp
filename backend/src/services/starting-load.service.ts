import { FitnessLevel, normalizeFitnessLevel } from './readiness.service'

// What to put on the bar the FIRST time someone logs a movement.
//
// Everything before this used one hardcoded table — 60/70/80 kg for every
// strength exercise — which offered a 60 kg lateral raise and a 60 kg squat to
// the same person on the same day. Once an exercise has history the progression
// service takes over; this only fills the gap before that exists.
//
// The model is: a per-exercise fraction of bodyweight (Exercise.loadFactor,
// calibrated for a trained adult male), scaled by the things that actually move
// that number for an individual — sex, training level, experience and age.
// Height is deliberately NOT a term; it changes leverage and range of motion,
// but bodyweight already carries almost all of the signal, and taller athletes
// are not stronger at a given bodyweight.

/** Reference bodyweight the loadFactor table is calibrated against. */
export const REFERENCE_BODYWEIGHT_KG = 80

/**
 * Strength does not scale linearly with bodyweight — it scales roughly with
 * cross-sectional area, so a 100 kg athlete is stronger than an 80 kg one but
 * not by 25%. The classic allometric exponent is about 2/3.
 */
const ALLOMETRIC_EXPONENT = 2 / 3

/**
 * Upper-body strength differs between sexes far more than lower-body, but a
 * single factor per sex is all this data supports. Unknown and
 * 'prefer_not_to_say' deliberately sit at the midpoint rather than defaulting
 * to male — an unanswered question is not an answer.
 */
const SEX_FACTOR: Record<string, number> = {
  male: 1.0,
  female: 0.65,
  other: 0.82,
  prefer_not_to_say: 0.82,
}

/** The loadFactor table describes an intermediate athlete. */
const LEVEL_FACTOR: Record<FitnessLevel, number> = {
  beginner: 0.62,
  intermediate: 1.0,
  advanced: 1.28,
}

/**
 * Years of training, as a small correction on top of the level.
 *
 * Level is self-reported and coarse; someone who calls themselves intermediate
 * at six months and someone who does at six years are not lifting the same
 * weight. Capped tightly because level is already doing most of the work and
 * the two must not compound into something absurd.
 */
const experienceFactor = (years: number | null | undefined): number => {
  if (years == null || !Number.isFinite(years) || years <= 0) return 0.92
  // Saturates: most of the newbie gains are in the first two or three years.
  return clamp(0.92 + 0.16 * Math.log10(1 + years * 3), 0.92, 1.12)
}

/**
 * Strength holds up well into the thirties and declines gradually after.
 * Clamped at both ends — extrapolated freely the linear term would claim an
 * 80-year-old lifts nothing.
 */
const AGE_PLATEAU = 35
const ageFactor = (age: number | null | undefined): number => {
  if (age == null || !Number.isFinite(age) || age <= 0) return 1
  if (age >= AGE_PLATEAU) return clamp(1 - (age - AGE_PLATEAU) * 0.007, 0.72, 1)
  // Under-20s are typically still developing; a light nudge down, not a cliff.
  if (age < 20) return clamp(0.88 + (age - 13) * 0.017, 0.88, 1)
  return 1
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Round to something you can actually load.
 *
 * A suggestion of 7.3 kg is worse than useless on a dumbbell rack that goes up
 * in 2s — the athlete has to do the rounding themselves, every time. Bigger
 * loads round coarser because that is how plates work.
 */
export const roundToLoadable = (kg: number): number => {
  if (kg <= 0) return 0
  if (kg < 10) return Math.round(kg)           // 1 kg steps on light dumbbells
  if (kg < 40) return Math.round(kg / 2.5) * 2.5
  return Math.round(kg / 5) * 5
}

export interface LoadProfile {
  weight?: number | null
  gender?: string | null
  fitnessLevel?: string | null
  experienceYears?: number | null
  age?: number | null
}

/**
 * The working weight to offer for a set of ~10 reps.
 *
 * Returns null when there is nothing sensible to say — an unloaded movement,
 * or an exercise the loadFactor table has never been given a figure for. The
 * caller must treat null as "no suggestion" rather than substituting a
 * number of its own, which is the mistake this whole service exists to undo.
 */
export const startingWorkingLoad = (
  loadFactor: number | null | undefined,
  profile: LoadProfile
): number | null => {
  if (loadFactor == null || loadFactor <= 0) return null

  const bodyweight = profile.weight && profile.weight > 0
    ? profile.weight
    : REFERENCE_BODYWEIGHT_KG

  const base = loadFactor * REFERENCE_BODYWEIGHT_KG
  const bodyweightScale = Math.pow(bodyweight / REFERENCE_BODYWEIGHT_KG, ALLOMETRIC_EXPONENT)

  const sex = profile.gender?.toLowerCase().trim() ?? ''
  const level = normalizeFitnessLevel(profile.fitnessLevel)

  const kg =
    base *
    bodyweightScale *
    (SEX_FACTOR[sex] ?? SEX_FACTOR.prefer_not_to_say) *
    LEVEL_FACTOR[level] *
    experienceFactor(profile.experienceYears) *
    ageFactor(profile.age)

  return roundToLoadable(kg)
}

/**
 * A full three-set opener built around that working weight.
 *
 * Ascending load across descending reps, matching the shape the app already
 * used — the numbers change, the structure does not, so nothing downstream has
 * to learn a new format.
 */
export const startingSets = (
  workingLoad: number,
  restSeconds = 90
): { reps: number; weight: number; rpe: number; restSeconds: number }[] => [
  { reps: 12, weight: roundToLoadable(workingLoad * 0.85), rpe: 7, restSeconds },
  { reps: 10, weight: workingLoad,                          rpe: 8, restSeconds },
  { reps: 8,  weight: roundToLoadable(workingLoad * 1.08),  rpe: 9, restSeconds },
]

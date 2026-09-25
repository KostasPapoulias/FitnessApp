import { FitnessLevel, normalizeFitnessLevel } from './readiness.service'

// Suggested weight for the first time an exercise is logged: the exercise's
// loadFactor (fraction of bodyweight, calibrated for a trained adult male)
// scaled by bodyweight, sex, level, experience and age. Once history exists
// the progression service takes over.

/** Reference bodyweight the loadFactor table is calibrated against. */
export const REFERENCE_BODYWEIGHT_KG = 80

/** Strength scales with bodyweight^(2/3), not linearly. */
const ALLOMETRIC_EXPONENT = 2 / 3

/** Per-sex factor. Unknown and 'prefer_not_to_say' sit at the midpoint. */
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

/** Small, capped correction for years of training on top of the level. */
const experienceFactor = (years: number | null | undefined): number => {
  if (years == null || !Number.isFinite(years) || years <= 0) return 0.92
  // Saturates after the first few years
  return clamp(0.92 + 0.16 * Math.log10(1 + years * 3), 0.92, 1.12)
}

/** Flat until 35, then a gradual decline; clamped at both ends. */
const AGE_PLATEAU = 35
const ageFactor = (age: number | null | undefined): number => {
  if (age == null || !Number.isFinite(age) || age <= 0) return 1
  if (age >= AGE_PLATEAU) return clamp(1 - (age - AGE_PLATEAU) * 0.007, 0.72, 1)
  // A light reduction for under-20s
  if (age < 20) return clamp(0.88 + (age - 13) * 0.017, 0.88, 1)
  return 1
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Round a first-time estimate to a loadable weight; coarser as loads grow. */
export const roundToLoadable = (kg: number): number => {
  if (kg <= 0) return 0
  if (kg < 10) return Math.round(kg)           // 1 kg steps on light dumbbells
  if (kg < 40) return Math.round(kg / 2.5) * 2.5
  return Math.round(kg / 5) * 5
}

export type PlateRounding = 'nearest' | 'up' | 'down'

/**
 * Snap a history-derived weight to the gym grid: 1 kg steps under 10 kg,
 * 2.5 kg above. The caller picks the direction — progressions round up,
 * deloads down. Signed, so for assisted work `up` means less assistance.
 */
export const roundToPlates = (kg: number, mode: PlateRounding = 'nearest'): number => {
  if (!Number.isFinite(kg) || kg === 0) return 0
  const step = Math.abs(kg) < 10 ? 1 : 2.5
  const units = kg / step
  // Nudge so float noise (22.5 / 2.5 = 9.000000000000002) cannot flip the direction
  const n = mode === 'up' ? Math.ceil(units - 1e-9)
    : mode === 'down' ? Math.floor(units + 1e-9)
    : Math.round(units)
  // `+ 0` turns -0 into 0
  return n * step + 0
}

export interface LoadProfile {
  weight?: number | null
  gender?: string | null
  fitnessLevel?: string | null
  experienceYears?: number | null
  age?: number | null
}

/**
 * Working weight for a set of ~10 reps, or null when the exercise has no
 * loadFactor. Callers must treat null as "no suggestion".
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

/** A three-set opener around the working weight: ascending load, descending reps. */
export const startingSets = (
  workingLoad: number,
  restSeconds = 90
): { reps: number; weight: number; rpe: number; restSeconds: number }[] => [
  { reps: 12, weight: roundToLoadable(workingLoad * 0.85), rpe: 7, restSeconds },
  { reps: 10, weight: workingLoad,                          rpe: 8, restSeconds },
  { reps: 8,  weight: roundToLoadable(workingLoad * 1.08),  rpe: 9, restSeconds },
]

import prisma from '../lib/prisma'
import { getEffectiveFatigueLevel } from './fatigue.service'
import {
  SleepReadiness, describeSleepReadiness, resolveSleepReadiness,
} from './sleep-readiness.service'

// Single source of truth for "how ready is this user to train".
// Both GET /api/fatigue/current and the AI system prompt read from here —
// they used to roll their own average and drifted apart.
//
// The score is muscle fatigue and systemic fatigue, shifted by last night's
// sleep. Sleep is a bounded modifier rather than a weighted term, and the
// reasoning for that is in `sleep-readiness.service.ts` — it is the whole
// design of the feature and it is not obvious from the arithmetic here.

export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced'

export const DEFAULT_FITNESS_LEVEL: FitnessLevel = 'intermediate'

export interface ReadinessModel {
  // Average fatigue is multiplied by this before being subtracted from 100.
  // Advanced athletes tolerate more accumulated fatigue, beginners less.
  fatiguePenalty: number
  // Score thresholds for the traffic-light banding.
  bands: { ready: number; caution: number }
}

export const READINESS_MODELS: Record<FitnessLevel, ReadinessModel> = {
  beginner:     { fatiguePenalty: 1.15, bands: { ready: 70, caution: 40 } },
  intermediate: { fatiguePenalty: 1.0,  bands: { ready: 70, caution: 40 } },
  advanced:     { fatiguePenalty: 0.85, bands: { ready: 70, caution: 40 } },
}

export const normalizeFitnessLevel = (raw: string | null | undefined): FitnessLevel => {
  const key = raw?.toLowerCase().trim()
  return key === 'beginner' || key === 'advanced' || key === 'intermediate'
    ? key
    : DEFAULT_FITNESS_LEVEL
}

export type ReadinessStatus = 'ready' | 'caution' | 'rest'

export const bandReadiness = (score: number, model: ReadinessModel): ReadinessStatus =>
  score >= model.bands.ready ? 'ready' :
  score >= model.bands.caution ? 'caution' : 'rest'

// How many of the worst-hit muscles define the "peak" term below.
const PEAK_MUSCLE_COUNT = 3

// Split between local muscle damage and whole-body cost. Systemic fatigue is
// what a hard run or metcon actually loads, so it has to carry real weight.
const MUSCLE_SHARE = 0.7
const SYSTEMIC_SHARE = 0.3

/**
 * How loaded the athlete's muscles are, as one number.
 *
 * A flat mean across all 15 muscles buries every session: a leg day that pins
 * quads, hams and glutes at 80 averaged out to 16, and the app called it
 * "ready". Half the weight now goes to the worst-hit muscles, so training three
 * muscles hard registers as training hard.
 *
 * `fatigueLevels` must still cover the ENTIRE muscle set — untrained muscles
 * count as 0, or the score gets worse the less you have trained.
 */
export const aggregateMuscleFatigue = (fatigueLevels: number[]): number => {
  if (fatigueLevels.length === 0) return 0

  const mean = fatigueLevels.reduce((sum, f) => sum + f, 0) / fatigueLevels.length

  const worst = [...fatigueLevels].sort((a, b) => b - a).slice(0, PEAK_MUSCLE_COUNT)
  const peak = worst.reduce((sum, f) => sum + f, 0) / worst.length

  return mean * 0.5 + peak * 0.5
}

/**
 * Pure scoring function. Blends local muscle load with whole-body fatigue —
 * without the systemic term, an hour of running left every muscle reading
 * "fresh" and readiness essentially untouched.
 *
 * `sleepAdjustment` is a signed shift in readiness points, already bounded by
 * `sleep-readiness.service`. It is added rather than blended in so that an
 * athlete who has logged nothing scores exactly what the fatigue model says —
 * see that file for why a default value would have been worse than no value.
 */
export const computeReadinessScore = (
  fatigueLevels: number[],
  model: ReadinessModel = READINESS_MODELS[DEFAULT_FITNESS_LEVEL],
  systemicFatigue = 0,
  sleepAdjustment = 0
): number => {
  const clamp = (score: number) => Math.round(Math.min(100, Math.max(0, score)))

  // Nothing trained yet. Still not necessarily 100: four hours' sleep is a real
  // reason not to be ready, and returning a flat 100 here would have made the
  // modifier silently inapplicable to exactly the athletes who train least.
  if (fatigueLevels.length === 0 && systemicFatigue <= 0) return clamp(100 + sleepAdjustment)

  const load =
    aggregateMuscleFatigue(fatigueLevels) * MUSCLE_SHARE +
    systemicFatigue * SYSTEMIC_SHARE
  const score = 100 - load * model.fatiguePenalty + sleepAdjustment

  // Round once, at the end — rounding per-muscle first skews the average.
  return clamp(score)
}

export interface MuscleReadiness {
  muscleId: string
  muscleName: string
  fatigueLevel: number          // rounded, for display
  effectiveLevel: number        // raw, for further math
  status: 'high' | 'moderate' | 'recovered'
  color: string
  recoveryTargetAt: Date | null
  lastUpdated: Date | null
}

export interface UserReadiness {
  readinessScore: number
  status: ReadinessStatus
  fitnessLevel: FitnessLevel
  muscles: MuscleReadiness[]
  /** Whole-body fatigue, decayed to now. Cardio and metcons load this. */
  systemicFatigue: number
  systemicRecoveryTargetAt: Date | null
  /**
   * What last night's sleep did to the score, and whether it did anything at
   * all. The UI has to be able to say which — a score that moved for an unseen
   * reason is worse than one that never moved.
   */
  sleep: SleepReadiness
  /** One line naming the above, so every surface phrases it the same way. */
  sleepNote: string
}

/**
 * Resolves a user's full readiness picture: every muscle in the catalogue,
 * decayed to `now`, plus the level-weighted overall score.
 */
export const getUserReadiness = async (
  userId: string,
  now: Date = new Date()
): Promise<UserReadiness> => {
  // One round trip, not five. At ~290ms to Railway the sequential version of
  // this was the difference between a readiness call and a readiness wait.
  const [allMuscles, fatigueCurrent, profile, systemic, lastSleep] = await Promise.all([
    prisma.muscle.findMany(),
    prisma.muscleFatigueCurrent.findMany({ where: { userId } }),
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.systemicFatigue.findUnique({ where: { userId } }),
    prisma.sleepLog.findFirst({
      where: { userId },
      orderBy: { sleepDate: 'desc' },
      select: { sleepDate: true, durationMin: true, sleepScore: true },
    }),
  ])

  const fatigueMap = new Map(fatigueCurrent.map(f => [f.muscleId, f]))

  const muscles: MuscleReadiness[] = allMuscles.map(muscle => {
    const record = fatigueMap.get(muscle.id) ?? null
    const effectiveLevel = getEffectiveFatigueLevel(record, now)
    const rounded = Math.round(effectiveLevel)

    return {
      muscleId: muscle.id,
      muscleName: muscle.name,
      fatigueLevel: rounded,
      effectiveLevel,
      // SVG colors
      status: rounded >= 70 ? 'high' :
              rounded >= 35 ? 'moderate' : 'recovered',
      color: rounded >= 70 ? '#EF4444' :
             rounded >= 35 ? '#FACC15' : '#4ADE80',
      recoveryTargetAt: record?.recoveryTargetAt ?? null,
      lastUpdated: record?.updatedAt ?? null,
    }
  })

  const systemicFatigue = getEffectiveFatigueLevel(
    systemic
      ? {
          fatigueLevel: systemic.level,
          updatedAt: systemic.updatedAt,
          recoveryTargetAt: systemic.recoveryTargetAt,
        }
      : null,
    now
  )

  const sleep = resolveSleepReadiness(lastSleep, now)

  const fitnessLevel = normalizeFitnessLevel(profile?.fitnessLevel)
  const model = READINESS_MODELS[fitnessLevel]
  const readinessScore = computeReadinessScore(
    muscles.map(m => m.effectiveLevel), model, systemicFatigue, sleep.adjustment
  )

  return {
    readinessScore,
    // Banded from the final score, sleep included — the traffic light has to
    // agree with the number printed next to it.
    status: bandReadiness(readinessScore, model),
    fitnessLevel,
    muscles,
    systemicFatigue: Math.round(systemicFatigue),
    systemicRecoveryTargetAt: systemic?.recoveryTargetAt ?? null,
    sleep,
    sleepNote: describeSleepReadiness(sleep),
  }
}

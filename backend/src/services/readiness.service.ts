import prisma from '../lib/prisma'
import { getEffectiveFatigueLevel } from './fatigue.service'
import {
  SleepReadiness, describeSleepReadiness, resolveSleepReadiness,
} from './sleep-readiness.service'

// Single source of truth for "how ready is this user to train", read by both
// GET /api/fatigue/current and the AI system prompt. The score combines muscle
// and systemic fatigue, shifted by last night's sleep.

export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced'

export const DEFAULT_FITNESS_LEVEL: FitnessLevel = 'intermediate'

export interface ReadinessModel {
  // Multiplies fatigue before it is subtracted from 100; advanced athletes tolerate more
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

// How many of the worst-hit muscles form the "peak" term.
const PEAK_MUSCLE_COUNT = 3

// Split between local muscle damage and whole-body (systemic) cost.
const MUSCLE_SHARE = 0.7
const SYSTEMIC_SHARE = 0.3

/**
 * Muscle load as one number: half the mean, half the worst three, so a hard
 * session on a few muscles is not averaged away. `fatigueLevels` must cover
 * every muscle, untrained ones as 0.
 */
export const aggregateMuscleFatigue = (fatigueLevels: number[]): number => {
  if (fatigueLevels.length === 0) return 0

  const mean = fatigueLevels.reduce((sum, f) => sum + f, 0) / fatigueLevels.length

  const worst = [...fatigueLevels].sort((a, b) => b - a).slice(0, PEAK_MUSCLE_COUNT)
  const peak = worst.reduce((sum, f) => sum + f, 0) / worst.length

  return mean * 0.5 + peak * 0.5
}

/**
 * Readiness score (0–100) from muscle and systemic fatigue, plus the signed,
 * already-bounded sleep adjustment.
 */
export const computeReadinessScore = (
  fatigueLevels: number[],
  model: ReadinessModel = READINESS_MODELS[DEFAULT_FITNESS_LEVEL],
  systemicFatigue = 0,
  sleepAdjustment = 0
): number => {
  const clamp = (score: number) => Math.round(Math.min(100, Math.max(0, score)))

  // Nothing trained — sleep can still move the score
  if (fatigueLevels.length === 0 && systemicFatigue <= 0) return clamp(100 + sleepAdjustment)

  const load =
    aggregateMuscleFatigue(fatigueLevels) * MUSCLE_SHARE +
    systemicFatigue * SYSTEMIC_SHARE
  const score = 100 - load * model.fatiguePenalty + sleepAdjustment

  // Round once at the end
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
  /** What last night's sleep did to the score, and whether it applied. */
  sleep: SleepReadiness
  /** One line describing the above. */
  sleepNote: string
}

/** Every muscle's fatigue decayed to `now`, plus the overall score. */
export const getUserReadiness = async (
  userId: string,
  now: Date = new Date()
): Promise<UserReadiness> => {
  // Independent reads, batched
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
    // Banded from the final score, sleep included
    status: bandReadiness(readinessScore, model),
    fitnessLevel,
    muscles,
    systemicFatigue: Math.round(systemicFatigue),
    systemicRecoveryTargetAt: systemic?.recoveryTargetAt ?? null,
    sleep,
    sleepNote: describeSleepReadiness(sleep),
  }
}

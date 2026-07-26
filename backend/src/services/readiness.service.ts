import prisma from '../lib/prisma'
import { getEffectiveFatigueLevel } from './fatigue.service'

// Single source of truth for "how ready is this user to train".
// Both GET /api/fatigue/current and the AI system prompt read from here —
// they used to roll their own average and drifted apart.

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

/**
 * Pure scoring function.
 *
 * `fatigueLevels` must cover the user's ENTIRE muscle set — untrained muscles
 * count as 0. Averaging over only the muscles with a fatigue row makes the
 * score worse the less you have trained, which is backwards.
 */
export const computeReadinessScore = (
  fatigueLevels: number[],
  model: ReadinessModel = READINESS_MODELS[DEFAULT_FITNESS_LEVEL]
): number => {
  if (fatigueLevels.length === 0) return 100

  const avgFatigue = fatigueLevels.reduce((sum, f) => sum + f, 0) / fatigueLevels.length
  const score = 100 - avgFatigue * model.fatiguePenalty

  // Round once, at the end — rounding per-muscle first skews the average.
  return Math.round(Math.min(100, Math.max(0, score)))
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
}

/**
 * Resolves a user's full readiness picture: every muscle in the catalogue,
 * decayed to `now`, plus the level-weighted overall score.
 */
export const getUserReadiness = async (
  userId: string,
  now: Date = new Date()
): Promise<UserReadiness> => {
  const [allMuscles, fatigueCurrent, profile] = await Promise.all([
    prisma.muscle.findMany(),
    prisma.muscleFatigueCurrent.findMany({ where: { userId } }),
    prisma.userProfile.findUnique({ where: { userId } }),
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

  const fitnessLevel = normalizeFitnessLevel(profile?.fitnessLevel)
  const model = READINESS_MODELS[fitnessLevel]
  const readinessScore = computeReadinessScore(muscles.map(m => m.effectiveLevel), model)

  return {
    readinessScore,
    status: bandReadiness(readinessScore, model),
    fitnessLevel,
    muscles,
  }
}

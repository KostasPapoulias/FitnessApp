import prisma from '../lib/prisma'

// What the athlete can and cannot train, resolved once and shared by every
// caller that suggests or lists exercises.
//
// Both constraints are OPT-IN by absence: a user who has never opened the
// optional onboarding stage has no equipment rows and no injury rows, and must
// see the full catalogue. Treating "unanswered" as "owns nothing" would filter
// their exercise list down to zero, which is the worst possible reading of a
// question they were explicitly allowed to skip.

export interface TrainingConstraints {
  /** Empty means unanswered — apply no equipment filter at all. */
  equipmentIds: Set<string>
  /** Muscle ids the athlete wants hidden entirely. */
  avoidMuscleIds: Set<string>
  /** Muscle ids to flag but still show. */
  cautionMuscleIds: Set<string>
  /** True when the user has actually chosen equipment. */
  hasEquipmentFilter: boolean
}

export const getTrainingConstraints = async (
  userId: string
): Promise<TrainingConstraints> => {
  const [equipment, injuries] = await Promise.all([
    prisma.userEquipment.findMany({
      where: { userId },
      select: { equipmentId: true },
    }),
    prisma.userInjury.findMany({
      where: { userId, resolvedAt: null },
      select: { muscleId: true, severity: true },
    }),
  ])

  const equipmentIds = new Set(equipment.map(e => e.equipmentId))

  const avoidMuscleIds = new Set<string>()
  const cautionMuscleIds = new Set<string>()
  for (const injury of injuries) {
    if (!injury.muscleId) continue
    ;(injury.severity === 'avoid' ? avoidMuscleIds : cautionMuscleIds).add(injury.muscleId)
  }

  return {
    equipmentIds,
    avoidMuscleIds,
    cautionMuscleIds,
    hasEquipmentFilter: equipmentIds.size > 0,
  }
}

// The shape any exercise needs to be testable against the constraints. Kept
// structural so callers can pass their own Prisma selections without casting.
export interface ConstrainableExercise {
  equipmentLinks: { equipmentId: string }[]
  muscleLinks: { muscleId: string }[]
}

/**
 * Can this exercise be performed with the equipment the athlete has?
 *
 * Requires ALL of the exercise's equipment, not any of it: a barbell bench
 * press needs the barbell AND the bench, and offering it to someone with only
 * a barbell is how a suggestion becomes useless.
 *
 * An exercise with no equipment links at all is always performable — that is
 * how the seed represents movements needing nothing.
 */
export const canPerform = (
  exercise: ConstrainableExercise,
  constraints: TrainingConstraints
): boolean => {
  if (!constraints.hasEquipmentFilter) return true
  if (exercise.equipmentLinks.length === 0) return true
  return exercise.equipmentLinks.every(link =>
    constraints.equipmentIds.has(link.equipmentId)
  )
}

/**
 * Whether an exercise touches a muscle the athlete is avoiding entirely.
 *
 * Any overlap disqualifies it. A movement is not safe because the injured
 * muscle is only a secondary mover — a bad shoulder is loaded by a bench press
 * whether or not the chest is doing most of the work.
 */
export const hitsAvoidedMuscle = (
  exercise: ConstrainableExercise,
  constraints: TrainingConstraints
): boolean =>
  exercise.muscleLinks.some(link => constraints.avoidMuscleIds.has(link.muscleId))

/**
 * Whether an exercise should carry a warning without being hidden.
 */
export const hitsCautionMuscle = (
  exercise: ConstrainableExercise,
  constraints: TrainingConstraints
): boolean =>
  exercise.muscleLinks.some(link => constraints.cautionMuscleIds.has(link.muscleId))

/**
 * Orders the catalogue by what the athlete can actually do, and hides only
 * what they asked to never see.
 *
 * Equipment RANKS, it does not filter. Someone who ticked "Dumbbell" has not
 * declared that barbells do not exist — they may be travelling, or at a
 * different gym next week, or willing to substitute. Hiding those exercises
 * makes the catalogue look broken and gives them no way to notice the setting
 * is what's doing it. So unavailable movements sort to the bottom, flagged.
 *
 * Injuries marked 'avoid' DO filter, because that is exactly what the athlete
 * asked for and what the setup screen promised them.
 */
export const rankByConstraints = <T extends ConstrainableExercise>(
  exercises: T[],
  constraints: TrainingConstraints
): {
  ranked: (T & { caution: boolean; needsMissingEquipment: boolean })[]
  hiddenCount: number
  missingEquipmentCount: number
} => {
  const ranked: (T & { caution: boolean; needsMissingEquipment: boolean })[] = []
  let hiddenCount = 0
  let missingEquipmentCount = 0

  for (const exercise of exercises) {
    if (hitsAvoidedMuscle(exercise, constraints)) {
      hiddenCount++
      continue
    }
    const needsMissingEquipment = !canPerform(exercise, constraints)
    if (needsMissingEquipment) missingEquipmentCount++

    ranked.push({
      ...exercise,
      caution: hitsCautionMuscle(exercise, constraints),
      needsMissingEquipment,
    })
  }

  // Stable within each group: the caller already ordered by name, and a sort
  // that only compares the flag preserves that ordering underneath.
  ranked.sort((a, b) => Number(a.needsMissingEquipment) - Number(b.needsMissingEquipment))

  return { ranked, hiddenCount, missingEquipmentCount }
}

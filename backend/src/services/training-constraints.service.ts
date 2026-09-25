import prisma from '../lib/prisma'

// What the athlete can train: owned equipment and injury restrictions. Both are
// opt-in — no rows means "unanswered", which must show the full catalogue,
// never an empty one.

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

// Structural shape so callers can pass their own Prisma selections.
export interface ConstrainableExercise {
  equipmentLinks: { equipmentId: string }[]
  muscleLinks: { muscleId: string }[]
}

/**
 * Whether the athlete owns ALL of the exercise's equipment. Exercises with no
 * equipment links need nothing and are always performable.
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

/** Whether the exercise works any muscle marked 'avoid' — any overlap counts. */
export const hitsAvoidedMuscle = (
  exercise: ConstrainableExercise,
  constraints: TrainingConstraints
): boolean =>
  exercise.muscleLinks.some(link => constraints.avoidMuscleIds.has(link.muscleId))

/** Whether the exercise should carry a caution flag. */
export const hitsCautionMuscle = (
  exercise: ConstrainableExercise,
  constraints: TrainingConstraints
): boolean =>
  exercise.muscleLinks.some(link => constraints.cautionMuscleIds.has(link.muscleId))

/**
 * Orders exercises for the athlete: movements needing missing equipment sort
 * last (flagged, not hidden); muscles marked 'avoid' are filtered out.
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

  // Stable sort keeps the caller's name order within each group
  ranked.sort((a, b) => Number(a.needsMissingEquipment) - Number(b.needsMissingEquipment))

  return { ranked, hiddenCount, missingEquipmentCount }
}

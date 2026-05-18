export interface FatigueRecord {
  muscleId: string
  fatigueLevel: number
  recoveryTargetAt: Date | null
  updatedAt: Date
}

export type FatigueRecordLike = Pick<
  FatigueRecord,
  'muscleId' | 'fatigueLevel' | 'recoveryTargetAt' | 'updatedAt'
>

export const getEffectiveFatigueLevel = (
  record: Pick<FatigueRecord, 'fatigueLevel' | 'recoveryTargetAt' | 'updatedAt'> | null,
  now: Date = new Date()
): number => {
  if (!record) {
    return 0
  }

  let fatigueLevel = record.fatigueLevel
  const recoveryTargetAt = record.recoveryTargetAt

  // Apply real-time recovery interpolation
  if (recoveryTargetAt) {
    const totalDuration = recoveryTargetAt.getTime() - record.updatedAt.getTime()
    const elapsed = now.getTime() - record.updatedAt.getTime()

    if (elapsed > 0 && totalDuration > 0) {
      const recoveryRatio = Math.min(elapsed / totalDuration, 1)
      fatigueLevel = Math.max(0, record.fatigueLevel * (1 - recoveryRatio))
    }

    if (now >= recoveryTargetAt) {
      fatigueLevel = 0
    }
  }

  return fatigueLevel
}

export const buildEffectiveFatigueMap = <T extends FatigueRecordLike>(
  records: T[],
  now: Date = new Date()
): Map<string, number> => {
  return new Map(
    records.map(record => [record.muscleId, getEffectiveFatigueLevel(record, now)])
  )
}

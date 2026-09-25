// Fatigue decay. Recovery is exponential; the half-life is not stored but
// implied by (fatigueLevel, updatedAt, recoveryTargetAt), where
// `recoveryTargetAt` is the moment the level reaches RECOVERED_BELOW.

// At or below this a muscle reads as fully recovered.
export const RECOVERED_BELOW = 5

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

// Anything with a level and a recovery window — muscle rows and the systemic row.
export type DecayableFatigue = {
  fatigueLevel: number
  recoveryTargetAt: Date | null
  updatedAt: Date
}

/** Half-life implied by a level and the window it recovers across. */
const impliedHalfLifeMs = (level: number, updatedAt: Date, recoveryTargetAt: Date): number => {
  const window = recoveryTargetAt.getTime() - updatedAt.getTime()
  const halfLives = Math.log2(level / RECOVERED_BELOW)
  return halfLives > 0 ? window / halfLives : 0
}

export const getEffectiveFatigueLevel = (
  record: DecayableFatigue | null,
  now: Date = new Date()
): number => {
  if (!record) {
    return 0
  }

  const level = record.fatigueLevel
  const { recoveryTargetAt, updatedAt } = record

  if (level <= RECOVERED_BELOW) return 0
  if (!recoveryTargetAt) return level

  const elapsed = now.getTime() - updatedAt.getTime()
  if (elapsed <= 0) return level
  if (now >= recoveryTargetAt) return 0

  const halfLifeMs = impliedHalfLifeMs(level, updatedAt, recoveryTargetAt)
  if (halfLifeMs <= 0) return 0

  const decayed = level * Math.pow(0.5, elapsed / halfLifeMs)
  return decayed <= RECOVERED_BELOW ? 0 : decayed
}

/**
 * When a muscle at `level` will read as recovered, given its half-life — the
 * inverse of the decay above. Written to `recoveryTargetAt`.
 */
export const recoveryTargetFor = (
  level: number,
  halfLifeHours: number,
  from: Date = new Date()
): Date | null => {
  if (level <= RECOVERED_BELOW || halfLifeHours <= 0) return null
  const halfLives = Math.log2(level / RECOVERED_BELOW)
  return new Date(from.getTime() + halfLives * halfLifeHours * 60 * 60 * 1000)
}

export const buildEffectiveFatigueMap = <T extends FatigueRecordLike>(
  records: T[],
  now: Date = new Date()
): Map<string, number> => {
  return new Map(
    records.map(record => [record.muscleId, getEffectiveFatigueLevel(record, now)])
  )
}

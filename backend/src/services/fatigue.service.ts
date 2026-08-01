// Fatigue decay.
//
// Recovery is exponential, not linear: a muscle sheds most of its fatigue in
// the first hours and then tails off. The old linear ramp cleared fatigue at a
// flat ~2 points/hour for every muscle regardless of size, so calves and the
// lower back recovered at exactly the same rate.
//
// The half-life is not stored on the row. It is *implied* by the recovery
// window: `recoveryTargetAt` is written as the moment the muscle drops to
// RECOVERED_BELOW, so the number of half-lives across that window is fixed and
// the curve can be reconstructed from (fatigueLevel, updatedAt,
// recoveryTargetAt) alone. That keeps every existing caller and record shape
// working, and lets systemic fatigue reuse the identical curve.

// A muscle at or below this reads as fully recovered. Exponential decay never
// truly reaches zero, so it needs a floor to land on.
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

// Anything carrying a level and a recovery window — muscle rows and the
// user's systemic row both satisfy this.
export type DecayableFatigue = {
  fatigueLevel: number
  recoveryTargetAt: Date | null
  updatedAt: Date
}

/**
 * Hours for a level to halve, given the window it was told to recover across.
 * Exposed so callers can invert it — see `recoveryTargetFor`.
 */
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

  // Already spent, or never given a recovery window to decay along
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
 * When a muscle sitting at `level` will read as recovered, given its own
 * half-life. This is the inverse of the decay above — write the result to
 * `recoveryTargetAt` and the curve reconstructs itself on read.
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

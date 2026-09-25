import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { getEffectiveFatigueLevel, recoveryTargetFor } from './fatigue.service'
import {
  SYSTEMIC_HALF_LIFE_HOURS,
  accumulate,
  estimateE1rm,
  recoveryRateFor,
  resolveAge,
  systemicFatigueDelta,
} from './fatigue-model.service'
import { HOLD_SECONDS_PER_REP } from './fatigue-model.service'
import { scoreSession } from './session-scoring.service'

/**
 * Rebuilds a user's fatigue state by replaying history. Saturating
 * accumulation makes a session's contribution impossible to subtract, so
 * edits and deletions replay every MuscleFatigueLog delta and every session's
 * systemic load instead.
 */

export interface FatigueReplayEvent {
  at: Date
  delta: number
  id?: string
}

export interface FatigueReplayResult {
  level: number
  recoveryTargetAt: Date | null
  trace: { id: string; levelAfter: number }[]
  /** Level at each requested sample time, in the order they were given. */
  samples: number[]
}

/**
 * Replay one decay curve (a muscle, or systemic): decay between events, then
 * accumulate each delta. `sampleAt` (sorted ascending) reads the curve at given
 * instants without changing it — used for the progress fatigue chart.
 */
export const replayFatigueCurve = (
  events: FatigueReplayEvent[],
  halfLifeHours: number,
  now: Date,
  sampleAt: Date[] = []
): FatigueReplayResult => {
  let level = 0
  let updatedAt: Date | null = null
  let recoveryTargetAt: Date | null = null
  const trace: { id: string; levelAfter: number }[] = []
  const samples: number[] = []
  let nextSample = 0

  // Level at `when` without advancing the walk
  const peek = (when: Date) =>
    updatedAt ? getEffectiveFatigueLevel({ fatigueLevel: level, updatedAt, recoveryTargetAt }, when) : 0

  for (const event of events) {
    // Samples before this event read the pre-event state
    while (nextSample < sampleAt.length && sampleAt[nextSample] < event.at) {
      samples.push(peek(sampleAt[nextSample]))
      nextSample++
    }

    if (updatedAt) {
      level = getEffectiveFatigueLevel({ fatigueLevel: level, updatedAt, recoveryTargetAt }, event.at)
    }
    level = accumulate(level, event.delta)
    updatedAt = event.at
    recoveryTargetAt = recoveryTargetFor(level, halfLifeHours, event.at)
    if (event.id) trace.push({ id: event.id, levelAfter: level })
  }

  while (nextSample < sampleAt.length) {
    samples.push(peek(sampleAt[nextSample]))
    nextSample++
  }

  if (!updatedAt) return { level: 0, recoveryTargetAt: null, trace, samples }

  // Decay to now and re-anchor the window, matching a row written by finishSession
  level = getEffectiveFatigueLevel({ fatigueLevel: level, updatedAt, recoveryTargetAt }, now)
  return {
    level,
    recoveryTargetAt: recoveryTargetFor(level, halfLifeHours, now),
    trace,
    samples,
  }
}

const replay = replayFatigueCurve

/** Recompute MuscleFatigueCurrent and SystemicFatigue from history. Call after any session change. */
export const recomputeUserFatigue = async (userId: string): Promise<void> => {
  const now = new Date()

  const [profile, muscles, logs, sessions, existing] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.muscle.findMany({ select: { id: true, recoveryHalfLifeHours: true } }),
    prisma.muscleFatigueLog.findMany({
      where: { userId },
      select: { id: true, muscleId: true, delta: true, createdAt: true, fatigueLevelAfter: true },
      orderBy: { createdAt: 'asc' },
    }),
    // Only finished sessions carry systemic load
    prisma.workoutSession.findMany({
      where: { userId, duration: { not: null }, systemicLoad: { not: null } },
      select: { dateTime: true, systemicLoad: true },
      orderBy: { dateTime: 'asc' },
    }),
    // Existing rows too, so a muscle whose only session was deleted is reset
    prisma.muscleFatigueCurrent.findMany({
      where: { userId },
      select: { muscleId: true },
    }),
  ])

  // Today's level × age multiplier, as finishSession applies
  const recoveryRate = recoveryRateFor(
    profile?.fitnessLevel,
    resolveAge(profile?.birthDate, profile?.age)
  )

  const halfLifeByMuscle = new Map(muscles.map(m => [m.id, m.recoveryHalfLifeHours]))

  const eventsByMuscle = new Map<string, { at: Date; delta: number; id: string }[]>()
  for (const log of logs) {
    const list = eventsByMuscle.get(log.muscleId) ?? []
    list.push({ at: log.createdAt, delta: log.delta, id: log.id })
    eventsByMuscle.set(log.muscleId, list)
  }
  const storedLevelAfter = new Map(logs.map(l => [l.id, l.fatigueLevelAfter]))

  const muscleIds = new Set<string>([...eventsByMuscle.keys(), ...existing.map(e => e.muscleId)])

  const systemic = replay(
    sessions.map(s => ({ at: s.dateTime, delta: systemicFatigueDelta(s.systemicLoad ?? 0) })),
    SYSTEMIC_HALF_LIFE_HOURS * recoveryRate,
    now
  )

  // `fatigueLevelAfter` colours the calendar's day maps, so later logs whose
  // level changed are corrected too (only rows that actually moved).
  const levelFixes: { id: string; levelAfter: number }[] = []

  // Replay outside the transaction; the writes go as one batched array
  // transaction (one round trip, still atomic).
  const writes: Prisma.PrismaPromise<unknown>[] = []

  for (const muscleId of muscleIds) {
    const events = eventsByMuscle.get(muscleId) ?? []
    const halfLife = (halfLifeByMuscle.get(muscleId) ?? 15) * recoveryRate
    const { level, recoveryTargetAt, trace } = replay(events, halfLife, now)

    for (const step of trace) {
      // Ignore sub-half-point float noise
      if (Math.abs((storedLevelAfter.get(step.id) ?? 0) - step.levelAfter) > 0.5) {
        levelFixes.push(step)
      }
    }

    writes.push(prisma.muscleFatigueCurrent.upsert({
      where: { userId_muscleId: { userId, muscleId } },
      update: { fatigueLevel: level, recoveryTargetAt },
      create: { userId, muscleId, fatigueLevel: level, recoveryTargetAt },
    }))
  }

  for (const fix of levelFixes) {
    writes.push(prisma.muscleFatigueLog.update({
      where: { id: fix.id },
      data: { fatigueLevelAfter: fix.levelAfter },
    }))
  }

  writes.push(prisma.systemicFatigue.upsert({
    where: { userId },
    update: { level: systemic.level, recoveryTargetAt: systemic.recoveryTargetAt },
    create: { userId, level: systemic.level, recoveryTargetAt: systemic.recoveryTargetAt },
  }))

  await prisma.$transaction(writes)
}

/** The includes `scoreSession` needs. */
const SCORABLE_INCLUDE = {
  workoutExercises: {
    include: {
      exercise: { include: { muscleLinks: { include: { muscle: true } } } },
      sets: {
        include: {
          strength: true, calisthenics: true, cardio: true, wod: true, mobility: true,
        },
      },
    },
  },
} as const

/**
 * Re-score a finished session and replace its MuscleFatigueLog rows, dated to
 * the session. Current levels are left to `recomputeUserFatigue`. Returns the
 * exercise ids touched (their e1RM needs recomputing).
 */
export const rescoreSession = async (
  userId: string,
  sessionId: string
): Promise<string[]> => {
  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, userId },
    include: SCORABLE_INCLUDE,
  })

  if (!session) return []

  const exerciseIds = [...new Set(session.workoutExercises.map(we => we.exerciseId))]

  // Unfinished sessions have no logs or totals to rewrite
  if (session.duration == null) return exerciseIds

  const [profile, estimates] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.exerciseStrengthEstimate.findMany({
      where: { userId, exerciseId: { in: exerciseIds } },
    }),
  ])

  const score = scoreSession(session, {
    bodyWeight: profile?.weight ?? 70,
    // Today's estimates — a close enough approximation for a re-score
    e1rmByExercise: new Map(estimates.map(e => [e.exerciseId, e.e1rm])),
    duration: session.duration,
  })

  const freshLogs = [...score.muscleDeltas].map(([muscleId, { delta }]) => ({
    userId,
    muscleId,
    workoutSessionId: sessionId,
    delta,
    // Provisional; corrected by recomputeUserFatigue right after
    fatigueLevelAfter: 0,
    source: 'workout',
    createdAt: session.dateTime,
  }))

  // Batched array transaction; the delete runs before the insert
  await prisma.$transaction([
    prisma.workoutSession.update({
      where: { id: sessionId },
      data: {
        totalVolume: score.totalVolume,
        avgRpe: score.avgRpe,
        systemicLoad: score.sessionLoad,
      },
    }),
    prisma.muscleFatigueLog.deleteMany({ where: { workoutSessionId: sessionId } }),
    ...(freshLogs.length
      ? [prisma.muscleFatigueLog.createMany({ data: freshLogs })]
      : []),
  ])

  return exerciseIds
}

/**
 * Recompute the best e1RM for the given exercises from finished sessions —
 * needed because the stored estimate is a running maximum that deletions can
 * invalidate.
 */
export const recomputeStrengthEstimates = async (
  userId: string,
  exerciseIds: string[]
): Promise<void> => {
  if (exerciseIds.length === 0) return

  const [profile, workoutExercises] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId }, select: { weight: true } }),
    prisma.workoutExercise.findMany({
      where: {
        exerciseId: { in: exerciseIds },
        // Finished sessions only
        session: { userId, duration: { not: null } },
      },
      select: {
        exerciseId: true,
        sets: {
          select: {
            rpe: true,
            strength: { select: { reps: true, weight: true } },
            calisthenics: { select: { reps: true, addedWeight: true, time: true } },
          },
        },
      },
    }),
  ])

  const bodyWeight = profile?.weight ?? 70

  const bestByExercise = new Map<string, number>()
  for (const workoutExercise of workoutExercises) {
    for (const set of workoutExercise.sets) {
      let estimate = 0

      if (set.strength) {
        estimate = estimateE1rm(set.strength.weight, set.strength.reps, set.rpe)
      } else if (set.calisthenics) {
        const load = bodyWeight + set.calisthenics.addedWeight
        const repEquivalent = set.calisthenics.reps > 0
          ? set.calisthenics.reps
          : (set.calisthenics.time ?? 0) / HOLD_SECONDS_PER_REP
        estimate = estimateE1rm(load, repEquivalent, set.rpe)
      }

      if (estimate > (bestByExercise.get(workoutExercise.exerciseId) ?? 0)) {
        bestByExercise.set(workoutExercise.exerciseId, estimate)
      }
    }
  }

  // Batched as one transaction
  const stale = exerciseIds.filter(id => (bestByExercise.get(id) ?? 0) <= 0)
  const scored = exerciseIds.filter(id => (bestByExercise.get(id) ?? 0) > 0)

  await prisma.$transaction([
    // No history left: delete, so starting-load falls back to its table
    ...(stale.length
      ? [prisma.exerciseStrengthEstimate.deleteMany({
          where: { userId, exerciseId: { in: stale } },
        })]
      : []),
    ...scored.map(exerciseId => prisma.exerciseStrengthEstimate.upsert({
      where: { userId_exerciseId: { userId, exerciseId } },
      update: { e1rm: bestByExercise.get(exerciseId)! },
      create: { userId, exerciseId, e1rm: bestByExercise.get(exerciseId)! },
    })),
  ])
}

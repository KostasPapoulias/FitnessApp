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
 * Rebuild a user's fatigue state from their history.
 *
 * Needed because a completed session could never be removed or corrected. The
 * obvious fix — subtract the session's stored deltas back out — does not work:
 * `accumulate` SATURATES as it approaches the ceiling, so a session's
 * contribution is not linearly separable from the ones around it. Two sessions
 * whose deltas sum to 90 do not leave 90 behind, and subtracting either one
 * afterwards lands somewhere arbitrary.
 *
 * So the state is replayed instead of patched. `MuscleFatigueLog` holds every
 * delta ever applied with its timestamp, and `WorkoutSession.systemicLoad`
 * holds the whole-body side, which makes the current levels a pure function of
 * history — exactly reproducible, and correct by construction rather than by
 * the arithmetic happening to commute.
 *
 * It is also cheap: two queries, an in-memory replay, and about sixteen upserts
 * regardless of how much history there is.
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
 * Replay one muscle's (or the systemic) curve.
 *
 * Between two events the level decays along the same implied curve everything
 * else reads, then the new delta accumulates on top. `recoveryTargetAt` has to
 * be recomputed at each step because the decay is reconstructed FROM it — a
 * level without a matching window would decay along the old one and drift.
 *
 * `sampleAt` reads the curve at arbitrary instants without changing it, which
 * is how the progress screen draws a fatigue history. Sampling lives here
 * rather than in a charting service on purpose: a second implementation of
 * this walk would disagree with the stored state in exactly the cases that are
 * hardest to notice — a saturating session, or a long gap between events.
 * Sample times must be sorted ascending.
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

  // The level at `when`, decayed from the last event but WITHOUT advancing the
  // walk — a sample must not become an event.
  const peek = (when: Date) =>
    updatedAt ? getEffectiveFatigueLevel({ fatigueLevel: level, updatedAt, recoveryTargetAt }, when) : 0

  for (const event of events) {
    // Every sample that falls before this event reads the decay so far. Taken
    // before the delta lands, so a sample timestamped the same instant as a
    // session shows the state going into it, not the spike out of it.
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

  // Decay from the last event to now, then re-anchor the window to now so the
  // stored row means the same thing as one written by finishSession.
  level = getEffectiveFatigueLevel({ fatigueLevel: level, updatedAt, recoveryTargetAt }, now)
  return {
    level,
    recoveryTargetAt: recoveryTargetFor(level, halfLifeHours, now),
    trace,
    samples,
  }
}

const replay = replayFatigueCurve

/**
 * Recompute `MuscleFatigueCurrent` and `SystemicFatigue` from what remains in
 * the athlete's history. Call after anything that changes, removes or re-scores
 * a finished session.
 */
export const recomputeUserFatigue = async (userId: string): Promise<void> => {
  const now = new Date()

  const [profile, muscles, logs, sessions] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.muscle.findMany({ select: { id: true, recoveryHalfLifeHours: true } }),
    prisma.muscleFatigueLog.findMany({
      where: { userId },
      select: { id: true, muscleId: true, delta: true, createdAt: true, fatigueLevelAfter: true },
      orderBy: { createdAt: 'asc' },
    }),
    // Only finished sessions carry systemic load; an abandoned one never
    // reached the scoring path and has none.
    prisma.workoutSession.findMany({
      where: { userId, duration: { not: null }, systemicLoad: { not: null } },
      select: { dateTime: true, systemicLoad: true },
      orderBy: { dateTime: 'asc' },
    }),
  ])

  // The same level × age multiplier finishSession applies. Recovery speed is a
  // property of the athlete, not of the session, so replaying with today's
  // value is right even for deltas logged before their profile changed.
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

  // Every muscle that has a row OR has history — a muscle whose only session
  // was just deleted still has a stale row to clear, and skipping it would
  // leave fatigue the athlete no longer has any record of.
  const existing = await prisma.muscleFatigueCurrent.findMany({
    where: { userId },
    select: { muscleId: true },
  })
  const muscleIds = new Set<string>([...eventsByMuscle.keys(), ...existing.map(e => e.muscleId)])

  const systemic = replay(
    sessions.map(s => ({ at: s.dateTime, delta: systemicFatigueDelta(s.systemicLoad ?? 0) })),
    SYSTEMIC_HALF_LIFE_HOURS * recoveryRate,
    now
  )

  // `fatigueLevelAfter` is history, not a cache — the calendar's per-day muscle
  // map colours itself from it. Removing a session changes what every LATER log
  // was "after", so those rows are corrected too, or the calendar keeps showing
  // a day as red because of a workout that no longer exists.
  //
  // Only rows that actually moved are written. A deletion typically shifts the
  // handful of logs after it and nothing before, so this stays small even for
  // an athlete with years of history.
  const levelFixes: { id: string; levelAfter: number }[] = []

  await prisma.$transaction(async tx => {
    for (const muscleId of muscleIds) {
      const events = eventsByMuscle.get(muscleId) ?? []
      const halfLife = (halfLifeByMuscle.get(muscleId) ?? 15) * recoveryRate
      const { level, recoveryTargetAt, trace } = replay(events, halfLife, now)

      for (const step of trace) {
        // Half a fatigue point is far below anything the UI can render, and
        // rewriting rows that only differ by float noise would turn a cheap
        // correction into a full-history write on every delete.
        if (Math.abs((storedLevelAfter.get(step.id) ?? 0) - step.levelAfter) > 0.5) {
          levelFixes.push(step)
        }
      }

      await tx.muscleFatigueCurrent.upsert({
        where: { userId_muscleId: { userId, muscleId } },
        update: { fatigueLevel: level, recoveryTargetAt },
        create: { userId, muscleId, fatigueLevel: level, recoveryTargetAt },
      })
    }

    for (const fix of levelFixes) {
      await tx.muscleFatigueLog.update({
        where: { id: fix.id },
        data: { fatigueLevelAfter: fix.levelAfter },
      })
    }

    await tx.systemicFatigue.upsert({
      where: { userId },
      update: { level: systemic.level, recoveryTargetAt: systemic.recoveryTargetAt },
      create: { userId, level: systemic.level, recoveryTargetAt: systemic.recoveryTargetAt },
    })
  })
}

/** The includes `scoreSession` needs, in one place so callers cannot under-fetch. */
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
 * Re-score a finished session and replace the fatigue it logged.
 *
 * Called after a set inside it is edited or removed. The session's own
 * `MuscleFatigueLog` rows are deleted and rewritten from the new score, dated
 * to the session rather than to now — an edit made a week later must not land
 * a week's worth of fresh fatigue on the athlete.
 *
 * Does NOT touch MuscleFatigueCurrent. `recomputeUserFatigue` does that from
 * the rewritten logs, so there is exactly one place that decides what the
 * current level is.
 *
 * Returns the exercise ids the session touched, since their strength estimates
 * need recomputing too.
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

  // An unfinished session never reached the scoring path, so it has no logs to
  // replace and no totals worth writing. Editing its sets is just editing rows.
  if (session.duration == null) return exerciseIds

  const [profile, estimates] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.exerciseStrengthEstimate.findMany({
      where: { userId, exerciseId: { in: exerciseIds } },
    }),
  ])

  const score = scoreSession(session, {
    bodyWeight: profile?.weight ?? 70,
    // The estimate as it stands today, not as it stood when the session was
    // first scored. Reconstructing the historical value would mean replaying
    // every session's e1RM as well, and the difference only shifts how costly
    // a set is judged to have been by a few percent.
    e1rmByExercise: new Map(estimates.map(e => [e.exerciseId, e.e1rm])),
    duration: session.duration,
  })

  await prisma.$transaction(async tx => {
    await tx.workoutSession.update({
      where: { id: sessionId },
      data: {
        totalVolume: score.totalVolume,
        avgRpe: score.avgRpe,
        systemicLoad: score.sessionLoad,
      },
    })

    await tx.muscleFatigueLog.deleteMany({ where: { workoutSessionId: sessionId } })

    for (const [muscleId, { delta }] of score.muscleDeltas) {
      await tx.muscleFatigueLog.create({
        data: {
          userId,
          muscleId,
          workoutSessionId: sessionId,
          delta,
          // Provisional. recomputeUserFatigue replays the whole series and
          // corrects every row's level, including these, immediately after.
          fatigueLevelAfter: 0,
          source: 'workout',
          createdAt: session.dateTime,
        },
      })
    }
  })

  return exerciseIds
}

/**
 * Recompute the rolling best e1RM for specific exercises.
 *
 * `ExerciseStrengthEstimate` is a running maximum — `finishSession` only ever
 * raises it. That is correct while history only grows, and wrong the moment a
 * session can be removed: delete the day someone hit a PR and the estimate
 * keeps claiming it, which then inflates every future starting weight and makes
 * every subsequent set score as easier than it was.
 *
 * Scoped to the exercises actually touched rather than the whole catalogue —
 * a delete affects a handful, and rescanning everything on every edit would
 * read the athlete's entire training history each time.
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
        // Only sessions that were actually completed. An abandoned session's
        // sets are not training history and must not set a personal best.
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

  await prisma.$transaction(async tx => {
    for (const exerciseId of exerciseIds) {
      const best = bestByExercise.get(exerciseId) ?? 0

      if (best <= 0) {
        // Nothing left to base an estimate on. Deleted rather than left at its
        // old value: a stale estimate is worse than none, because
        // starting-load.service treats its absence as "no history" and falls
        // back to the calibrated table instead of a number that is now fiction.
        await tx.exerciseStrengthEstimate.deleteMany({ where: { userId, exerciseId } })
        continue
      }

      await tx.exerciseStrengthEstimate.upsert({
        where: { userId_exerciseId: { userId, exerciseId } },
        update: { e1rm: best },
        create: { userId, exerciseId, e1rm: best },
      })
    }
  })
}

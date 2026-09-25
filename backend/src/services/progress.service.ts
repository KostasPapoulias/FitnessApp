// Reads for the progress screen: weekly volume, strength estimates, per-exercise
// e1RM series and muscle fatigue history. Reuses the model's own arithmetic
// (`estimateE1rm`, `replayFatigueCurve`) so charts match the numbers that drove training.

import prisma from '../lib/prisma'
import { estimateE1rm, HOLD_SECONDS_PER_REP, recoveryRateFor, resolveAge } from './fatigue-model.service'
import { replayFatigueCurve } from './fatigue-recompute.service'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Weeks of volume history. */
export const DEFAULT_VOLUME_WEEKS = 12
export const MAX_VOLUME_WEEKS = 52

export const DEFAULT_FATIGUE_DAYS = 30
export const MAX_FATIGUE_DAYS = 180

/** Monday of the week containing `date`, at local midnight. */
const startOfWeek = (date: Date): Date => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // getDay() is 0 for Sunday, which belongs to the previous week
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d
}

/** YYYY-MM-DD from local date parts (toISOString would shift west-of-UTC dates back a day). */
const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export interface VolumeWeek {
  /** ISO date of the Monday. */
  weekStart: string
  /** Mechanical tonnage (sum of `totalVolume`). */
  volumeKg: number
  /** Whole-body load (sum of `systemicLoad`, sRPE units). */
  load: number
  sessions: number
  sets: number
}

export interface VolumeTrend {
  weeks: VolumeWeek[]
  /** The current week and the one before. */
  thisWeek: VolumeWeek | null
  previousWeek: VolumeWeek | null
  /** Weeks in the window that had at least one session. */
  activeWeeks: number
}

/**
 * Weekly training volume: tonnage, systemic load and set count — tonnage alone
 * reads as zero for bodyweight and cardio athletes.
 */
export const getVolumeTrend = async (
  userId: string,
  weeks = DEFAULT_VOLUME_WEEKS,
  now: Date = new Date()
): Promise<VolumeTrend> => {
  const windowWeeks = Math.min(Math.max(Math.trunc(weeks) || DEFAULT_VOLUME_WEEKS, 1), MAX_VOLUME_WEEKS)
  const firstWeekStart = startOfWeek(new Date(now.getTime() - (windowWeeks - 1) * 7 * MS_PER_DAY))

  const sessions = await prisma.workoutSession.findMany({
    where: {
      userId,
      // Finished sessions only
      duration: { not: null },
      dateTime: { gte: firstWeekStart },
    },
    select: {
      dateTime: true,
      totalVolume: true,
      systemicLoad: true,
      // Counted, not fetched
      workoutExercises: { select: { _count: { select: { sets: true } } } },
    },
    orderBy: { dateTime: 'asc' },
  })

  // Pre-seed every week so weeks off show as zeros
  const buckets = new Map<string, VolumeWeek>()
  for (let i = 0; i < windowWeeks; i++) {
    const weekStart = new Date(firstWeekStart.getTime() + i * 7 * MS_PER_DAY)
    const key = localDateKey(weekStart)
    buckets.set(key, { weekStart: key, volumeKg: 0, load: 0, sessions: 0, sets: 0 })
  }

  for (const session of sessions) {
    const key = localDateKey(startOfWeek(session.dateTime))
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.volumeKg += session.totalVolume ?? 0
    bucket.load += session.systemicLoad ?? 0
    bucket.sessions += 1
    bucket.sets += session.workoutExercises.reduce((sum, we) => sum + we._count.sets, 0)
  }

  const ordered = [...buckets.values()].map(week => ({
    ...week,
    volumeKg: Math.round(week.volumeKg),
    load: Math.round(week.load),
  }))

  return {
    weeks: ordered,
    thisWeek: ordered[ordered.length - 1] ?? null,
    previousWeek: ordered[ordered.length - 2] ?? null,
    activeWeeks: ordered.filter(w => w.sessions > 0).length,
  }
}

export interface StrengthEntry {
  exerciseId: string
  exerciseName: string
  modality: string
  /** Best estimated one-rep max, in kg. */
  e1rm: number
  /** When the estimate last moved. */
  achievedAt: string
  /** Most recent session containing this exercise, finished or not. */
  lastPerformedAt: string | null
  /** Sessions containing the exercise; below 2 there is no trend. */
  sessionCount: number
}

/**
 * Every exercise with a strength estimate, best first (the PR list). For
 * calisthenics the e1RM includes bodyweight.
 */
export const getStrengthProgress = async (userId: string): Promise<StrengthEntry[]> => {
  const estimates = await prisma.exerciseStrengthEstimate.findMany({
    where: { userId },
    include: {
      exercise: { select: { id: true, name: true, modality: { select: { name: true } } } },
    },
    orderBy: { e1rm: 'desc' },
  })

  if (estimates.length === 0) return []

  // Session count and last-performed for every exercise, from one query
  const appearances = await prisma.workoutExercise.findMany({
    where: {
      exerciseId: { in: estimates.map(e => e.exerciseId) },
      session: { userId, duration: { not: null } },
    },
    select: { exerciseId: true, session: { select: { dateTime: true } } },
    orderBy: { session: { dateTime: 'desc' } },
  })

  const countByExercise = new Map<string, number>()
  const lastByExercise = new Map<string, Date>()
  for (const row of appearances) {
    countByExercise.set(row.exerciseId, (countByExercise.get(row.exerciseId) ?? 0) + 1)
    // Newest first, so the first row per exercise is its latest session
    if (!lastByExercise.has(row.exerciseId)) lastByExercise.set(row.exerciseId, row.session.dateTime)
  }

  return estimates.map(estimate => ({
    exerciseId: estimate.exerciseId,
    exerciseName: estimate.exercise.name,
    modality: estimate.exercise.modality.name,
    e1rm: Math.round(estimate.e1rm * 10) / 10,
    achievedAt: estimate.updatedAt.toISOString(),
    lastPerformedAt: lastByExercise.get(estimate.exerciseId)?.toISOString() ?? null,
    sessionCount: countByExercise.get(estimate.exerciseId) ?? 0,
  }))
}

export interface E1rmPoint {
  sessionId: string
  at: string
  /** Best e1RM implied by that session's sets. */
  e1rm: number
  /** The set the estimate came from. */
  bestSet: { reps: number; weight: number; rpe: number | null } | null
  /** True where this point set a new all-time best. */
  isPr: boolean
}

/**
 * One exercise's e1RM per session, recomputed from its sets. Not monotonic —
 * regressions stay visible; PRs are flagged.
 */
export const getExerciseE1rmSeries = async (
  userId: string,
  exerciseId: string
): Promise<E1rmPoint[]> => {
  const [profile, workoutExercises] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId }, select: { weight: true } }),
    prisma.workoutExercise.findMany({
      where: { exerciseId, session: { userId, duration: { not: null } } },
      select: {
        session: { select: { id: true, dateTime: true } },
        sets: {
          select: {
            rpe: true,
            strength: { select: { reps: true, weight: true } },
            calisthenics: { select: { reps: true, addedWeight: true, time: true } },
          },
        },
      },
      orderBy: { session: { dateTime: 'asc' } },
    }),
  ])

  const bodyWeight = profile?.weight ?? 70

  // One point per session, even if the exercise appears twice in it
  const bySession = new Map<string, E1rmPoint>()

  for (const workoutExercise of workoutExercises) {
    for (const set of workoutExercise.sets) {
      let estimate = 0
      let bestSet: E1rmPoint['bestSet'] = null

      if (set.strength) {
        estimate = estimateE1rm(set.strength.weight, set.strength.reps, set.rpe)
        bestSet = { reps: set.strength.reps, weight: set.strength.weight, rpe: set.rpe }
      } else if (set.calisthenics) {
        const load = bodyWeight + set.calisthenics.addedWeight
        const repEquivalent = set.calisthenics.reps > 0
          ? set.calisthenics.reps
          : (set.calisthenics.time ?? 0) / HOLD_SECONDS_PER_REP
        estimate = estimateE1rm(load, repEquivalent, set.rpe)
        bestSet = { reps: Math.round(repEquivalent), weight: load, rpe: set.rpe }
      }

      // Sets with no e1RM (cardio, mobility, metcon) are skipped, not scored as 0
      if (estimate <= 0) continue

      const sessionId = workoutExercise.session.id
      const current = bySession.get(sessionId)
      if (!current || estimate > current.e1rm) {
        bySession.set(sessionId, {
          sessionId,
          at: workoutExercise.session.dateTime.toISOString(),
          e1rm: Math.round(estimate * 10) / 10,
          bestSet,
          isPr: false,
        })
      }
    }
  }

  const points = [...bySession.values()].sort((a, b) => a.at.localeCompare(b.at))

  let best = 0
  for (const point of points) {
    if (point.e1rm > best) {
      point.isPr = true
      best = point.e1rm
    }
  }

  return points
}

export interface MuscleFatigueHistory {
  muscleId: string
  muscleName: string
  /** Daily samples, oldest first. */
  points: { at: string; level: number }[]
  /** Sessions that loaded this muscle inside the window. */
  hits: { at: string; delta: number; sessionId: string | null }[]
  /** Mean level across the window. */
  averageLevel: number
  peakLevel: number
}

/**
 * Each muscle's fatigue over time, replayed from its delta log with
 * `replayFatigueCurve` and sampled daily — the last sample equals the body map.
 */
export const getMuscleFatigueHistory = async (
  userId: string,
  days = DEFAULT_FATIGUE_DAYS,
  now: Date = new Date()
): Promise<MuscleFatigueHistory[]> => {
  const window = Math.min(Math.max(Math.trunc(days) || DEFAULT_FATIGUE_DAYS, 2), MAX_FATIGUE_DAYS)
  const windowStart = new Date(now.getTime() - (window - 1) * MS_PER_DAY)

  const [profile, muscles, logs] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.muscle.findMany({ select: { id: true, name: true, recoveryHalfLifeHours: true } }),
    // The full log, so fatigue carried into the window is included
    prisma.muscleFatigueLog.findMany({
      where: { userId },
      select: { muscleId: true, delta: true, createdAt: true, workoutSessionId: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  if (logs.length === 0) return []

  const recoveryRate = recoveryRateFor(
    profile?.fitnessLevel,
    resolveAge(profile?.birthDate, profile?.age)
  )

  // One sample per day at the current clock time; the last is now
  const sampleTimes: Date[] = []
  for (let i = window - 1; i >= 0; i--) {
    sampleTimes.push(new Date(now.getTime() - i * MS_PER_DAY))
  }

  const logsByMuscle = new Map<string, typeof logs>()
  for (const log of logs) {
    const list = logsByMuscle.get(log.muscleId) ?? []
    list.push(log)
    logsByMuscle.set(log.muscleId, list)
  }

  const histories: MuscleFatigueHistory[] = []

  for (const muscle of muscles) {
    const muscleLogs = logsByMuscle.get(muscle.id)
    // Never-trained muscles are omitted
    if (!muscleLogs || muscleLogs.length === 0) continue

    const { samples } = replayFatigueCurve(
      muscleLogs.map(l => ({ at: l.createdAt, delta: l.delta })),
      muscle.recoveryHalfLifeHours * recoveryRate,
      now,
      sampleTimes
    )

    const points = samples.map((level, i) => ({
      at: sampleTimes[i].toISOString(),
      level: Math.round(level),
    }))

    const hits = muscleLogs
      .filter(l => l.createdAt >= windowStart)
      .map(l => ({
        at: l.createdAt.toISOString(),
        delta: Math.round(l.delta * 10) / 10,
        sessionId: l.workoutSessionId,
      }))

    const levels = points.map(p => p.level)
    histories.push({
      muscleId: muscle.id,
      muscleName: muscle.name,
      points,
      hits,
      averageLevel: Math.round(levels.reduce((a, b) => a + b, 0) / (levels.length || 1)),
      peakLevel: Math.max(0, ...levels),
    })
  }

  // Most-loaded first
  return histories.sort((a, b) => b.averageLevel - a.averageLevel)
}

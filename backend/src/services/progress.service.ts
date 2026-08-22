// Reads for the progress screen.
//
// Nothing here computes anything new. Every number the app needed to show
// progress was already in Postgres and had never been read back: e1RM per
// exercise, session volume, systemic load, and a full log of muscle fatigue
// deltas. This file is the read side of datasets that only ever had a write
// side.
//
// Two rules it sticks to:
//
//   - Aggregate in SQL where the row count is unbounded (sets, sessions),
//     in memory where it is not (weeks in a window, muscles in the catalogue).
//   - Reuse the same arithmetic the model uses. e1RM comes from
//     `estimateE1rm` and the fatigue curve from `replayFatigueCurve`, so a
//     chart cannot quietly disagree with the number that drove training.

import prisma from '../lib/prisma'
import { estimateE1rm, HOLD_SECONDS_PER_REP, recoveryRateFor, resolveAge } from './fatigue-model.service'
import { replayFatigueCurve } from './fatigue-recompute.service'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Weeks of volume history. A quarter is enough to see a block; a year is noise on a phone. */
export const DEFAULT_VOLUME_WEEKS = 12
export const MAX_VOLUME_WEEKS = 52

export const DEFAULT_FATIGUE_DAYS = 30
export const MAX_FATIGUE_DAYS = 180

/** Monday of the week containing `date`, at local midnight. */
const startOfWeek = (date: Date): Date => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // getDay() is 0 for Sunday, which belongs to the week that started six days
  // earlier — not to the one about to start.
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d
}

/**
 * YYYY-MM-DD from the LOCAL date parts, not via toISOString.
 *
 * `startOfWeek` returns local midnight, and local midnight west of UTC is the
 * previous day in UTC — so `toISOString().slice(0, 10)` labelled the Monday
 * bucket as the Sunday before it. The bucketing itself was consistent either
 * way, since both sides went through the same function; only the label the
 * client renders was wrong, which is the kind of off-by-one nobody reports.
 */
const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export interface VolumeWeek {
  /** ISO date of the Monday. */
  weekStart: string
  /** Mechanical tonnage: sum of the sessions' `totalVolume`. */
  volumeKg: number
  /** Whole-body cost: sum of `systemicLoad`, the same sRPE units training load uses. */
  load: number
  sessions: number
  sets: number
}

export interface VolumeTrend {
  weeks: VolumeWeek[]
  /** Totals for the most recent complete-or-current week and the one before. */
  thisWeek: VolumeWeek | null
  previousWeek: VolumeWeek | null
  /** Weeks in the window that had at least one session. */
  activeWeeks: number
}

/**
 * Weekly training volume.
 *
 * Both a tonnage and a load series, because they answer different questions and
 * disagree usefully: a week of running moves `load` a long way and `volumeKg`
 * barely at all. Set count comes along because tonnage is meaningless for
 * anyone whose training is mostly bodyweight or cardio — for them the bar chart
 * would read as zero work done.
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
      // Finished sessions only. An abandoned one has no volume and no load, so
      // it would contribute a session to the count and nothing to the bars.
      duration: { not: null },
      dateTime: { gte: firstWeekStart },
    },
    select: {
      dateTime: true,
      totalVolume: true,
      systemicLoad: true,
      // Counted rather than fetched — the set rows themselves are not wanted
      // here, and including them would pull every modality relation for a
      // quarter of training to produce one integer per session.
      workoutExercises: { select: { _count: { select: { sets: true } } } },
    },
    orderBy: { dateTime: 'asc' },
  })

  // Pre-seed every week in the window. A missing week is a real zero — weeks
  // off are the part of a volume chart that explains the rest of it — and
  // bucketing only the weeks that have data would silently close the gaps.
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
  /** When the estimate last moved — i.e. when the best set was logged. */
  achievedAt: string
  /** Most recent session containing this exercise, finished or not. */
  lastPerformedAt: string | null
  /** Sessions this exercise appears in. Below 2 there is no trend to draw. */
  sessionCount: number
}

/**
 * Every exercise the athlete has a strength estimate for, best first.
 *
 * `ExerciseStrengthEstimate` is the app's own running best — computed on every
 * finish, corrected on every edit, and shown nowhere. This is the PR list: for
 * a strength app it is the single most conspicuous thing that was missing.
 *
 * Calisthenics appears here too. Its e1RM includes bodyweight, so the number is
 * a total load rather than something loaded on a bar — the modality is returned
 * so the client can say which.
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

  // Session count and last-performed in ONE query for every exercise at once.
  // Two grouped queries would be tidier to read, but `_max` cannot reach
  // through the session relation, so one of them had to be this scan anyway —
  // and a second round trip to the remote database costs more than folding both
  // out of the same rows here.
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
    // Rows arrive newest first, so the first one seen for an exercise is its
    // most recent session.
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
  /** The set it came from, so the point can be read as something that happened. */
  bestSet: { reps: number; weight: number; rpe: number | null } | null
  /** True where this point set a new all-time best. */
  isPr: boolean
}

/**
 * One exercise's estimated strength, session by session.
 *
 * Recomputed from the sets rather than read from a stored series: the estimate
 * table is a single running maximum with one timestamp, so it cannot say what
 * the athlete's e1RM was in March. The sets can, and they are the same input
 * the estimate was built from.
 *
 * Deliberately NOT monotonic. A best-so-far line only ever goes up and would
 * hide the whole point of a progress chart — a block where the numbers went
 * backwards. PRs are flagged instead.
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

  // One point per SESSION, not per workoutExercise row: the same exercise can
  // legitimately appear twice in a session, and two points on the same day
  // would draw as a vertical spike.
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

      // Cardio, mobility and metcon sets have no e1RM at all. Skipped rather
      // than scored as zero, which would drag the line to the floor on any day
      // the exercise was logged for time.
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
  /** Mean level across the window — how much load this muscle actually carries. */
  averageLevel: number
  peakLevel: number
}

/**
 * A muscle's fatigue over time, reconstructed from its delta log.
 *
 * The stored rows are events, not a series: `fatigueLevelAfter` is the spike
 * immediately after a session and says nothing about the four days of recovery
 * that followed. Drawing the events alone would show peaks joined by straight
 * lines through territory the athlete was actually recovering across, which is
 * the opposite of what this app claims to model.
 *
 * So the curve is replayed through `replayFatigueCurve` — the same walk that
 * rebuilds `MuscleFatigueCurrent` — and sampled once a day. Today's last
 * sample therefore equals what the body map is showing, by construction.
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
    // The FULL log, not just the window. A session three days before the window
    // opens is still sitting on the muscle on day one, and starting the replay
    // at the window edge would show every athlete beginning from zero.
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

  // Sampled at the same clock time each day so the spacing is even. Anchored to
  // `now` rather than to midnight, so the last point is the current state.
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
    // Never trained, in this athlete's entire history. Omitted rather than
    // returned as a flat zero line — fifteen empty charts is not information.
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

  // Most-loaded first. The muscles carrying the most fatigue across the window
  // are the ones worth looking at, and an alphabetical list buries them.
  return histories.sort((a, b) => b.averageLevel - a.averageLevel)
}

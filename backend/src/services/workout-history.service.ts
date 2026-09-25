// Training history: a cursor-paged list of finished sessions, and one
// exercise's own history. Both are lean reads; a session's sets are fetched
// only when it is opened.

import prisma from '../lib/prisma'
import { estimateE1rm, HOLD_SECONDS_PER_REP } from './fatigue-model.service'

export const DEFAULT_HISTORY_PAGE = 20
export const MAX_HISTORY_PAGE = 50

export interface HistoryRow {
  id: string
  dateTime: string
  /** Seconds. Never null — unfinished sessions are excluded. */
  duration: number
  totalVolume: number
  avgRpe: number | null
  systemicLoad: number
  templateName: string | null
  exercises: { name: string; modality: string; sets: number }[]
  setCount: number
  /** Total cardio distance in km. */
  distanceKm: number
  /** Modalities present in the session. */
  modalities: string[]
}

export interface HistoryPage {
  sessions: HistoryRow[]
  /** Pass as `cursor` for the next page; null on the last page. */
  nextCursor: string | null
}

/**
 * A page of finished sessions, newest first. Cursor-paged (by id) so rows do
 * not shift when a new session finishes between requests.
 */
export const getHistoryPage = async (
  userId: string,
  options: { cursor?: string; limit?: number; modality?: string } = {}
): Promise<HistoryPage> => {
  const take = Math.min(
    Math.max(Math.trunc(options.limit ?? DEFAULT_HISTORY_PAGE) || DEFAULT_HISTORY_PAGE, 1),
    MAX_HISTORY_PAGE
  )

  const where: any = { userId, duration: { not: null } }
  if (options.modality) {
    // Sessions containing the modality, not made only of it
    where.workoutExercises = {
      some: { exercise: { modality: { name: { equals: options.modality, mode: 'insensitive' } } } },
    }
  }

  const rows = await prisma.workoutSession.findMany({
    where,
    select: {
      id: true,
      dateTime: true,
      duration: true,
      totalVolume: true,
      avgRpe: true,
      systemicLoad: true,
      template: { select: { name: true } },
      workoutExercises: {
        orderBy: { orderIndex: 'asc' },
        select: {
          exercise: { select: { name: true, modality: { select: { name: true } } } },
          _count: { select: { sets: true } },
          // Only the cardio distance of each set
          sets: { select: { cardio: { select: { distance: true } } } },
        },
      },
    },
    // id breaks ties so the cursor never skips or repeats rows
    orderBy: [{ dateTime: 'desc' }, { id: 'desc' }],
    // One extra row reveals whether another page exists
    take: take + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  })

  const hasMore = rows.length > take
  const page = hasMore ? rows.slice(0, take) : rows

  const sessions: HistoryRow[] = page.map(session => {
    const exercises = session.workoutExercises.map(we => ({
      name: we.exercise.name,
      modality: we.exercise.modality.name,
      sets: we._count.sets,
    }))

    const distanceKm = session.workoutExercises.reduce(
      (total, we) => total + we.sets.reduce((sum, set) => sum + (set.cardio?.distance ?? 0), 0),
      0
    )

    return {
      id: session.id,
      dateTime: session.dateTime.toISOString(),
      duration: session.duration ?? 0,
      totalVolume: Math.round(session.totalVolume ?? 0),
      avgRpe: session.avgRpe == null ? null : Math.round(session.avgRpe * 10) / 10,
      systemicLoad: Math.round(session.systemicLoad ?? 0),
      templateName: session.template?.name ?? null,
      exercises,
      setCount: exercises.reduce((sum, e) => sum + e.sets, 0),
      distanceKm: Math.round(distanceKm * 100) / 100,
      modalities: [...new Set(exercises.map(e => e.modality))],
    }
  })

  return {
    sessions,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  }
}

export interface ExerciseHistorySet {
  setNumber: number
  rpe: number | null
  reps: number | null
  /** kg. For calisthenics, total load (bodyweight plus added). */
  weight: number | null
  /** Seconds, for holds and timed work. */
  timeSec: number | null
  distanceKm: number | null
  rounds: number | null
}

export interface ExerciseHistoryEntry {
  sessionId: string
  dateTime: string
  sets: ExerciseHistorySet[]
  /** Best e1RM implied by this entry's sets, if the modality has one. */
  e1rm: number | null
  topWeight: number | null
  totalVolume: number
  /** The athlete's note on the exercise that day. */
  notes: string | null
}

export interface ExerciseHistory {
  exerciseId: string
  entries: ExerciseHistoryEntry[]
  lastPerformedAt: string | null
  /** All-time best e1RM, not just within `entries`. */
  bestE1rm: number | null
  /** Total finished sessions containing the exercise (may exceed `entries`). */
  sessionCount: number
  /** The most recent note on this exercise from any session — often not the last one. */
  lastNote: { text: string; dateTime: string } | null
}

/** One exercise's history, newest first, plus its note and e1RM summary. */
export const getExerciseHistory = async (
  userId: string,
  exerciseId: string,
  limit = 10
): Promise<ExerciseHistory> => {
  const take = Math.min(Math.max(Math.trunc(limit) || 10, 1), MAX_HISTORY_PAGE)

  const [profile, estimate, sessionCount, workoutExercises, lastNoted] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId }, select: { weight: true } }),
    prisma.exerciseStrengthEstimate.findUnique({
      where: { userId_exerciseId: { userId, exerciseId } },
      select: { e1rm: true },
    }),
    prisma.workoutExercise.count({
      where: { exerciseId, session: { userId, duration: { not: null } } },
    }),
    prisma.workoutExercise.findMany({
      where: { exerciseId, session: { userId, duration: { not: null } } },
      select: {
        notes: true,
        session: { select: { id: true, dateTime: true } },
        sets: {
          orderBy: { setNumber: 'asc' },
          select: {
            setNumber: true,
            rpe: true,
            strength: true,
            calisthenics: true,
            cardio: true,
            wod: true,
            mobility: true,
          },
        },
      },
      orderBy: { session: { dateTime: 'desc' } },
      take,
    }),
    // Separate query: the note may sit past the `take` cap
    prisma.workoutExercise.findFirst({
      where: { exerciseId, notes: { not: null }, session: { userId, duration: { not: null } } },
      select: { notes: true, session: { select: { dateTime: true } } },
      orderBy: { session: { dateTime: 'desc' } },
    }),
  ])

  const bodyWeight = profile?.weight ?? 70

  const entries: ExerciseHistoryEntry[] = workoutExercises.map(workoutExercise => {
    let bestE1rm = 0
    let topWeight = 0
    let totalVolume = 0

    const sets: ExerciseHistorySet[] = workoutExercise.sets.map(set => {
      const row: ExerciseHistorySet = {
        setNumber: set.setNumber,
        rpe: set.rpe,
        reps: null,
        weight: null,
        timeSec: null,
        distanceKm: null,
        rounds: null,
      }

      if (set.strength) {
        row.reps = set.strength.reps
        row.weight = set.strength.weight
        totalVolume += set.strength.reps * set.strength.weight
        bestE1rm = Math.max(bestE1rm, estimateE1rm(set.strength.weight, set.strength.reps, set.rpe))
      } else if (set.calisthenics) {
        // Total load, matching how the fatigue model scores it
        const load = bodyWeight + set.calisthenics.addedWeight
        const repEquivalent = set.calisthenics.reps > 0
          ? set.calisthenics.reps
          : (set.calisthenics.time ?? 0) / HOLD_SECONDS_PER_REP
        row.reps = set.calisthenics.reps || null
        row.weight = load
        row.timeSec = set.calisthenics.time ?? null
        totalVolume += repEquivalent * load
        bestE1rm = Math.max(bestE1rm, estimateE1rm(load, repEquivalent, set.rpe))
      } else if (set.cardio) {
        row.distanceKm = set.cardio.distance ?? null
        row.timeSec = set.cardio.time ?? null
      } else if (set.wod) {
        row.reps = set.wod.reps ?? null
        row.rounds = set.wod.rounds ?? null
        row.distanceKm = set.wod.distance ?? null
        row.timeSec = set.wod.time ?? null
      } else if (set.mobility) {
        row.timeSec = set.mobility.time ?? null
      }

      if (row.weight != null) topWeight = Math.max(topWeight, row.weight)
      return row
    })

    return {
      sessionId: workoutExercise.session.id,
      dateTime: workoutExercise.session.dateTime.toISOString(),
      sets,
      e1rm: bestE1rm > 0 ? Math.round(bestE1rm * 10) / 10 : null,
      topWeight: topWeight > 0 ? Math.round(topWeight * 10) / 10 : null,
      totalVolume: Math.round(totalVolume),
      notes: workoutExercise.notes,
    }
  })

  return {
    exerciseId,
    entries,
    lastPerformedAt: entries[0]?.dateTime ?? null,
    bestE1rm: estimate ? Math.round(estimate.e1rm * 10) / 10 : null,
    sessionCount,
    lastNote: lastNoted?.notes
      ? { text: lastNoted.notes, dateTime: lastNoted.session.dateTime.toISOString() }
      : null,
  }
}

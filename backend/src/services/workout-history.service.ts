// Training history: "what have I been doing", and "when did I last squat".
//
// The calendar could already answer "what did I do on the 14th". These are
// different questions and neither was answerable — one needs a list ordered by
// time with no month boundary, the other needs a list ordered by time filtered
// to one movement.
//
// Both are deliberately LEAN reads. They replaced `GET /api/workout/sessions`,
// which deep-included every set with all five modality relations for up to
// fifty sessions and had no cursor — measured at 122 KB and ~12 s for twenty,
// which is what made paging it impossible. A list row needs the exercise names
// and a couple of totals, and nothing else; the sets are fetched when a session
// is opened. That endpoint has since been deleted.

import prisma from '../lib/prisma'
import { estimateE1rm, HOLD_SECONDS_PER_REP } from './fatigue-model.service'

export const DEFAULT_HISTORY_PAGE = 20
export const MAX_HISTORY_PAGE = 50

export interface HistoryRow {
  id: string
  dateTime: string
  /** Minutes. Never null here — unfinished sessions are excluded. */
  duration: number
  totalVolume: number
  avgRpe: number | null
  systemicLoad: number
  /** The plan it came from, when it came from one. */
  templateName: string | null
  exercises: { name: string; modality: string; sets: number }[]
  setCount: number
  /** Kilometres, summed across every cardio set. 0 for a session with none. */
  distanceKm: number
  /** Modalities present, so a row can be labelled without reading the sets. */
  modalities: string[]
}

export interface HistoryPage {
  sessions: HistoryRow[]
  /**
   * Pass as `cursor` for the next page. Null means this was the last one —
   * distinct from an empty page, which the client would otherwise have to
   * distinguish by guessing.
   */
  nextCursor: string | null
}

/**
 * A page of finished sessions, newest first.
 *
 * Cursor-paged rather than offset-paged: a new session finishing between two
 * requests shifts every offset by one and duplicates a row across the seam.
 * The cursor is the last row's id, which is stable regardless.
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
    // Sessions CONTAINING the modality, not sessions made only of it — a lifting
    // session that finished with a treadmill walk is still a lifting session,
    // and filtering to pure sessions would hide most real training.
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
          // Only the cardio leg of each set. A distance total should not cost a
          // join against all five modality tables.
          sets: { select: { cardio: { select: { distance: true } } } },
        },
      },
    },
    // id breaks ties. Two sessions can share a dateTime — a manually dated
    // entry, or two finishes inside the same second — and an unstable sort
    // makes a cursor skip or repeat rows.
    orderBy: [{ dateTime: 'desc' }, { id: 'desc' }],
    // One extra row, purely to find out whether another page exists. Asking for
    // `take` and then issuing a count would be a second round trip to say the
    // same thing.
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
  /** kg. Total load for calisthenics, i.e. bodyweight plus anything added. */
  weight: number | null
  /** Seconds, for holds and clock-based work. */
  timeSec: number | null
  distanceKm: number | null
  rounds: number | null
}

export interface ExerciseHistoryEntry {
  sessionId: string
  dateTime: string
  sets: ExerciseHistorySet[]
  /** Best e1RM implied by this entry's sets, or null where the modality has none. */
  e1rm: number | null
  /** Heaviest single set, for the one-line summary. */
  topWeight: number | null
  totalVolume: number
}

export interface ExerciseHistory {
  exerciseId: string
  entries: ExerciseHistoryEntry[]
  lastPerformedAt: string | null
  /** All-time best e1RM as the app records it, not just within `entries`. */
  bestE1rm: number | null
  /** Total finished sessions containing this exercise, which may exceed `entries`. */
  sessionCount: number
}

/**
 * One exercise's own history, newest first.
 *
 * This is what ExerciseDetail was missing — it renders a description and
 * nothing else, so the screen you open immediately before performing a movement
 * could not tell you what you did last time. That is the moment the data is
 * worth the most.
 *
 * `sessionCount` is counted separately from `entries.length` on purpose: the
 * list is capped, and letting the count be the length of a truncated page
 * would tell an athlete with fifty squat sessions that they had ten.
 */
export const getExerciseHistory = async (
  userId: string,
  exerciseId: string,
  limit = 10
): Promise<ExerciseHistory> => {
  const take = Math.min(Math.max(Math.trunc(limit) || 10, 1), MAX_HISTORY_PAGE)

  const [profile, estimate, sessionCount, workoutExercises] = await Promise.all([
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
        // Reported as total load, matching how the fatigue model scores it — a
        // weighted pull-up logged as "+10kg" is not a 10kg lift.
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
    }
  })

  return {
    exerciseId,
    entries,
    lastPerformedAt: entries[0]?.dateTime ?? null,
    bestE1rm: estimate ? Math.round(estimate.e1rm * 10) / 10 : null,
    sessionCount,
  }
}

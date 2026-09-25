import prisma from '../lib/prisma'
import { roundToPlates } from './starting-load.service'

/**
 * Suggested sets for an exercise with history: double progression with an
 * RPE-governed deload — repeat a load until it is comfortable, then add.
 */

/** Below this, the last session was comfortable enough to add load. */
const EASY_RPE = 8
/** At or above this it was a grind — hold, do not add. */
const HARD_RPE = 9.5
/** Consecutive hard-or-missed sessions before backing the load off. */
const MISSES_BEFORE_DELOAD = 2
const DELOAD_FRACTION = 0.9
/** Past this many days, come back under what you left off at. */
const STALE_DAYS = 14
const STALE_FRACTION = 0.9

/** Smallest worthwhile jump for a lift of this weight, on the `roundToPlates` grid. */
const loadIncrement = (weight: number): number => {
  if (weight >= 100) return 5
  if (weight >= 10) return 2.5
  return 1
}

/**
 * Back a load off by `fraction`, rounded down onto the plate grid. Assisted
 * (negative) loads get more assistance; a positive load never drops to 0.
 */
const backOff = (weight: number, fraction: number): number => {
  const lighter = roundToPlates(weight - Math.abs(weight) * (1 - fraction), 'down')
  return weight > 0 ? Math.max(lighter, Math.min(weight, 1)) : lighter
}

export type ProgressionBasis =
  | 'progression'   // built from the last session, adjusted
  | 'repeat'        // last session repeated as-is
  | 'deload'        // backed off after repeated misses
  | 'return'        // coming back after a layoff
  | 'estimate'      // no session history, derived from a known 1RM
  | 'default'       // nothing known about this exercise yet

export interface SuggestedSet {
  reps: number
  weight: number
  rpe: number
  restSeconds: number
}

export interface ExerciseSuggestion {
  exerciseId: string
  sets: SuggestedSet[]
  basis: ProgressionBasis
  /** One line explaining the suggestion, shown under the exercise. */
  note: string
  e1rm: number | null
  lastPerformed: string | null
}

interface HistoricSet {
  reps: number
  weight: number
  rpe: number | null
}

interface HistoricSession {
  date: Date
  sets: HistoricSet[]
}

/** The last N performances of the exercise in finished sessions only. */
const recentSessions = async (
  userId: string,
  exerciseId: string,
  take: number
): Promise<HistoricSession[]> => {
  const workoutExercises = await prisma.workoutExercise.findMany({
    where: {
      exerciseId,
      session: { userId, systemicLoad: { not: null } },
    },
    orderBy: { session: { dateTime: 'desc' } },
    take,
    select: {
      session: { select: { dateTime: true } },
      sets: {
        orderBy: { setNumber: 'asc' },
        select: {
          rpe: true,
          strength: { select: { reps: true, weight: true } },
          calisthenics: { select: { reps: true, addedWeight: true } },
        },
      },
    },
  })

  return workoutExercises
    .map(we => ({
      date: we.session.dateTime,
      sets: we.sets
        .map(set => {
          if (set.strength) {
            return { reps: set.strength.reps, weight: set.strength.weight, rpe: set.rpe }
          }
          if (set.calisthenics) {
            // Added load only — bodyweight is not chosen by the athlete
            return { reps: set.calisthenics.reps, weight: set.calisthenics.addedWeight, rpe: set.rpe }
          }
          return null
        })
        .filter((s): s is HistoricSet => s !== null && s.reps > 0),
    }))
    .filter(session => session.sets.length > 0)
}

const avgRpe = (sets: HistoricSet[]): number | null => {
  const rated = sets.filter(s => s.rpe != null)
  if (rated.length === 0) return null
  return rated.reduce((sum, s) => sum + (s.rpe ?? 0), 0) / rated.length
}

const topWeight = (sets: HistoricSet[]) => Math.max(...sets.map(s => s.weight))

/** A session counts as hard if it averaged a grind or the athlete faded badly. */
const wasHard = (session: HistoricSession): boolean => {
  const rpe = avgRpe(session.sets)
  if (rpe != null && rpe >= HARD_RPE) return true

  // Reps collapsing across sets at the top weight also counts as a miss
  const heaviest = topWeight(session.sets)
  const atTopWeight = session.sets.filter(s => s.weight === heaviest)
  if (atTopWeight.length >= 2) {
    const first = atTopWeight[0].reps
    const last = atTopWeight[atTopWeight.length - 1].reps
    if (first > 0 && last <= Math.floor(first / 2)) return true
  }
  return false
}

const round = (n: number) => Math.round(n * 100) / 100
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86_400_000)

/**
 * The next session's sets from history: add load when the last session was
 * easy, deload after two hard sessions in a row, ease back in after a layoff,
 * otherwise repeat.
 */
export const suggestForExercise = async (
  userId: string,
  exerciseId: string,
  modality: string,
  fallback: SuggestedSet[]
): Promise<ExerciseSuggestion> => {
  const [history, estimate] = await Promise.all([
    recentSessions(userId, exerciseId, MISSES_BEFORE_DELOAD + 1),
    prisma.exerciseStrengthEstimate.findUnique({
      where: { userId_exerciseId: { userId, exerciseId } },
    }),
  ])

  const e1rm = estimate?.e1rm ?? null
  const base = {
    exerciseId,
    e1rm: e1rm == null ? null : round(e1rm),
    lastPerformed: history[0]?.date.toISOString() ?? null,
  }

  // ── never performed ──
  if (history.length === 0) {
    if (e1rm && e1rm > 0 && (modality === 'Strength' || modality === 'Calisthenics')) {
      // ~70% of max is a normal working load
      const working = Math.max(1, roundToPlates(e1rm * 0.7))
      return {
        ...base,
        basis: 'estimate',
        note: `First time logging this. Starting from your estimated ${round(e1rm)} kg max.`,
        sets: fallback.map(set => ({ ...set, weight: working })),
      }
    }
    return {
      ...base,
      basis: 'default',
      note: 'No history yet — adjust these and they’ll be remembered next time.',
      // A client fallback may be off the grid
      sets: fallback.map(set => ({ ...set, weight: roundToPlates(set.weight) })),
    }
  }

  const last = history[0]
  const lastSets = last.sets
  const heaviest = topWeight(lastSets)
  const rpe = avgRpe(lastSets)
  const idleDays = daysBetween(new Date(), last.date)

  // Shape the next session on what was performed, snapped to the grid
  const shape = lastSets.map(set => ({
    reps: set.reps,
    weight: roundToPlates(set.weight),
    rpe: set.rpe ?? 8,
    restSeconds: fallback[0]?.restSeconds ?? 90,
  }))

  // ── coming back from a layoff ──
  if (idleDays >= STALE_DAYS) {
    return {
      ...base,
      basis: 'return',
      note: `${idleDays} days since you last did this — starting ~10% under to ease back in.`,
      sets: shape.map(set => ({ ...set, weight: backOff(set.weight, STALE_FRACTION) })),
    }
  }

  // ── repeated misses: back off ──
  const recentHard = history.slice(0, MISSES_BEFORE_DELOAD)
  if (recentHard.length >= MISSES_BEFORE_DELOAD && recentHard.every(wasHard)) {
    return {
      ...base,
      basis: 'deload',
      note: `Two hard sessions in a row at ${heaviest} kg. Dropping 10% to rebuild.`,
      sets: shape.map(set => ({ ...set, weight: backOff(set.weight, DELOAD_FRACTION) })),
    }
  }

  // ── comfortable: add load ──
  if (rpe != null && rpe <= EASY_RPE && !wasHard(last)) {
    const bump = loadIncrement(heaviest)

    // Bodyweight movements with no added load progress by reps
    if (heaviest === 0) {
      return {
        ...base,
        basis: 'progression',
        note: `Last time felt like RPE ${round(rpe)} — one more rep per set this time.`,
        sets: shape.map(set => ({ ...set, reps: set.reps + 1 })),
      }
    }

    return {
      ...base,
      basis: 'progression',
      note: `You hit this at RPE ${round(rpe)} — up ${bump} kg.`,
      // Rounded up so the result is always heavier than last time
      sets: shape.map(set => ({ ...set, weight: roundToPlates(set.weight + bump, 'up') })),
    }
  }

  // ── everything else: repeat and try to own it ──
  return {
    ...base,
    basis: 'repeat',
    note: rpe != null
      ? `Last time averaged RPE ${round(rpe)}. Same load until it moves easier.`
      : 'Repeating your last session — log RPE and this starts adapting.',
    sets: shape,
  }
}

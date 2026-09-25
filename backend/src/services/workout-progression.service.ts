import prisma from '../lib/prisma'
import { roundToPlates } from './starting-load.service'

/**
 * What to put in front of the athlete when they plan an exercise.
 *
 * Until now every strength movement was offered the same 60/70/80 kg regardless
 * of which lift it was or what the athlete had ever done — so bicep curls and
 * back squats opened identically. Meanwhile `ExerciseStrengthEstimate` was being
 * written on every finished session and read back nowhere except to score that
 * same session's fatigue. The data for progression already existed and was
 * thrown away.
 *
 * The model here is double progression with an RPE-governed deload: repeat a
 * load until it is comfortably completed, then add. RPE is what makes it
 * autoregulated — the same 80 kg is a different stimulus on a bad week, and the
 * athlete already tells us which it was when they log the set.
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

/**
 * Smallest jump worth making, by how heavy the lift already is.
 *
 * Kept on the grid `roundToPlates` snaps to. There used to be a 1.25 kg tier
 * for 15–40 kg, which is not a load anyone can put on a bar or pick off a
 * rack — it produced 21.25 kg suggestions. Below 10 kg the grid is 1 kg, so
 * light isolation work still moves in small steps.
 */
const loadIncrement = (weight: number): number => {
  if (weight >= 100) return 5
  if (weight >= 10) return 2.5
  return 1
}

/**
 * Back a load off by `fraction`, rounded DOWN onto the plate grid.
 *
 * Down, because the point is to be lighter — rounding to nearest could land
 * a 10% deload straight back on the weight it was backing off. Taken off the
 * magnitude, so an assisted movement (negative load) gets more assistance
 * rather than less. A positive load never rounds away to nothing: a 1 kg
 * raise backed off is still a 1 kg raise, not an empty hand.
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

/**
 * The last N times this exercise was performed in a FINISHED session.
 *
 * Unfinished sessions are excluded: an abandoned warm-up set is not evidence of
 * what the athlete can do, and letting it drive the next suggestion would walk
 * the load down every time someone starts a session and quits.
 */
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
            // Added load only — bodyweight is not a number the athlete picks
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

  // Reps falling off a cliff across sets at the same load is a miss even when
  // the RPE was never entered
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
 * Turn history into the next session's plan.
 *
 * Deliberately conservative in both directions. Adding too fast buries someone
 * under a load they cannot recover from — which the ACWR warning would then
 * scold them for — and deloading on a single bad night throws away real
 * progress, so it takes two.
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
      // A working set around 70% of a max is a normal hypertrophy load
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
      // The fallback can come from the client, whose placeholder is not
      // guaranteed to sit on the grid.
      sets: fallback.map(set => ({ ...set, weight: roundToPlates(set.weight) })),
    }
  }

  const last = history[0]
  const lastSets = last.sets
  const heaviest = topWeight(lastSets)
  const rpe = avgRpe(lastSets)
  const idleDays = daysBetween(new Date(), last.date)

  // Shape the next session on what was actually performed, not on a template.
  // Snapped to the grid even when repeated as-is: a weight typed on the live
  // screen can be anything, and "same as last time, 20.9 kg" is not a number
  // anyone can load.
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

    // Bodyweight movements with no added load progress by reps, not kilos
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
      // Up, so a set that sat between grid steps still ends up heavier than
      // last time rather than rounding back onto it.
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

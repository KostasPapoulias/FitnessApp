import {
  FATIGUE_PER_HSE,
  HOLD_SECONDS_PER_REP,
  cardioHse,
  estimateE1rm,
  mobilityHse,
  resistanceHse,
  systemicLoad,
  wodHse,
} from './fatigue-model.service'

/**
 * Turn a session's logged sets into the numbers the rest of the app derives
 * from: mechanical volume, average RPE, whole-body load, and the per-muscle
 * fatigue deltas.
 *
 * Lifted verbatim out of `finishSession`, which was the only caller while a
 * completed session could never change. Now that sets can be edited and
 * sessions deleted, a session has to be re-scorable — and a second copy of this
 * arithmetic would be the worst thing in the codebase to maintain, because the
 * two would disagree silently and only in the fatigue numbers, which is exactly
 * the output nobody can eyeball.
 *
 * Pure: it reads the session it is handed and returns numbers. Every database
 * decision — what to persist, what to reverse, what to replay — stays with the
 * caller.
 */

/** The shape the scorer needs. A superset of this is fine. */
export interface ScorableSession {
  workoutExercises: {
    exercise: {
      id: string
      damageFactor: number
      referenceSpeedKmh: number | null
      muscleLinks: {
        muscleId: string
        impactFactor: number
        muscle: { name: string; recoveryHalfLifeHours: number }
      }[]
    }
    sets: {
      setType: string
      rpe: number | null
      strength: { reps: number; weight: number } | null
      calisthenics: { reps: number; addedWeight: number; time: number | null } | null
      cardio: { distance: number | null; time: number | null } | null
      wod: { reps: number | null; rounds: number | null; time: number | null; distance: number | null } | null
      mobility: { time: number | null } | null
    }[]
  }[]
}

export interface SessionScore {
  totalVolume: number
  avgRpe: number
  /** Foster's sRPE for the session — its whole-body cost. */
  sessionLoad: number
  /** muscleId -> accumulated fatigue delta for this session. */
  muscleDeltas: Map<string, { delta: number; muscleName: string; halfLifeHours: number }>
  /** exerciseId -> best e1RM implied by this session's sets. */
  newE1rm: Map<string, number>
}

export const scoreSession = (
  session: ScorableSession,
  {
    bodyWeight,
    e1rmByExercise,
    duration,
  }: {
    bodyWeight: number
    e1rmByExercise: Map<string, number>
    /** Minutes. Drives systemic load. */
    duration: number | null
  }
): SessionScore => {
  // Calculate session totals
  // totalVolume is mechanical load in KG (strength + calisthenics only).
  // Cardio distance and mobility seconds are different units and are
  // deliberately excluded — whole-body cost is carried by systemicLoad.
  let totalVolume = 0
  let totalRpe = 0
  let rpeCount = 0

  // muscleDeltas accumulates fatigue per muscle across ALL exercises
  // Map: muscleId -> { delta, muscle }
  const muscleDeltas = new Map<string, {
    delta: number
    muscleName: string
    halfLifeHours: number
  }>()

  // How many sets of each modality — weights the session's systemic load
  const setTypeCounts = new Map<string, number>()
  // Best e1RM seen this session, to fold back into the estimate afterwards
  const newE1rm = new Map<string, number>()

  type MuscleLink = ScorableSession['workoutExercises'][number]['exercise']['muscleLinks']
  // A metcon is one effort spread over several movements, so it cannot be
  // scored set by set — collected here and split after the main loop.
  const wodEntries: {
    links: MuscleLink
    damage: number
    repsPerRound: number
    seconds: number
    rounds: number
    rpe: number | null
  }[] = []

  // `damageFactor` is the movement's mechanical cost per unit of work, kept
  // separate from impactFactor (which only says which muscles are recruited).
  // Without it, cycling scored higher on quads than running of the same
  // length, because cycling happens to carry a higher impactFactor.
  const addMuscleDelta = (links: MuscleLink, hse: number, damageFactor: number) => {
    if (hse <= 0 || damageFactor <= 0) return
    for (const muscleLink of links) {
      const fatigueDelta = hse * muscleLink.impactFactor * damageFactor * FATIGUE_PER_HSE
      const existing = muscleDeltas.get(muscleLink.muscleId)
      if (existing) {
        existing.delta += fatigueDelta
      } else {
        muscleDeltas.set(muscleLink.muscleId, {
          delta: fatigueDelta,
          muscleName: muscleLink.muscle.name,
          halfLifeHours: muscleLink.muscle.recoveryHalfLifeHours
        })
      }
    }
  }

  for (const workoutExercise of session.workoutExercises) {
    const exercise = workoutExercise.exercise
    const muscleLinks = exercise.muscleLinks
    const knownE1rm = e1rmByExercise.get(exercise.id) ?? 0
    const damage = exercise.damageFactor

    for (const set of workoutExercise.sets) {
      setTypeCounts.set(set.setType, (setTypeCounts.get(set.setType) ?? 0) + 1)

      if (set.rpe) {
        totalRpe += set.rpe
        rpeCount++
      }

      if (set.strength) {
        const { reps, weight } = set.strength
        totalVolume += reps * weight
        addMuscleDelta(muscleLinks, resistanceHse({
          reps, weight, rpe: set.rpe, e1rm: knownE1rm
        }), damage)
        const estimate = estimateE1rm(weight, reps, set.rpe)
        newE1rm.set(exercise.id, Math.max(newE1rm.get(exercise.id) ?? 0, estimate))

      } else if (set.calisthenics) {
        // Load is the user's own bodyweight plus any added/assisted weight.
        // Feeding it through the same curve as barbell work is what finally
        // makes a hard set of push-ups cost the same as a hard bench set.
        const load = bodyWeight + set.calisthenics.addedWeight
        const holdSeconds = set.calisthenics.time
        const repEquivalent = set.calisthenics.reps > 0
          ? set.calisthenics.reps
          : (holdSeconds ?? 0) / HOLD_SECONDS_PER_REP
        totalVolume += repEquivalent * load
        addMuscleDelta(muscleLinks, resistanceHse({
          reps: set.calisthenics.reps, weight: load, rpe: set.rpe,
          holdSeconds, e1rm: knownE1rm
        }), damage)
        const estimate = estimateE1rm(load, repEquivalent, set.rpe)
        newE1rm.set(exercise.id, Math.max(newE1rm.get(exercise.id) ?? 0, estimate))

      } else if (set.cardio) {
        // distance/time are not kilograms — no volume, but a real load.
        // Distance drives the local cost where the activity has a reference
        // speed, so ground actually covered counts rather than time on foot.
        addMuscleDelta(muscleLinks, cardioHse(
          set.cardio.time ?? 0,
          set.rpe,
          set.cardio.distance,
          exercise.referenceSpeedKmh
        ), damage)

      } else if (set.wod) {
        wodEntries.push({
          links: muscleLinks,
          damage,
          repsPerRound: set.wod.reps ?? 0,
          seconds: set.wod.time ?? 0,
          rounds: set.wod.rounds ?? 0,
          rpe: set.rpe,
        })

      } else if (set.mobility) {
        addMuscleDelta(muscleLinks, mobilityHse(), damage)
      }
    }
  }

  //  Score the metcon as a whole, then split it across its movements
  // Every movement's set carries the same elapsed clock, so scoring them
  // individually would multiply the workout by the number of movements.
  if (wodEntries.length > 0) {
    const seconds = Math.max(...wodEntries.map(w => w.seconds))
    const rounds = Math.max(...wodEntries.map(w => w.rounds))
    const rated = wodEntries.filter(w => w.rpe != null)
    const rpe = rated.length > 0
      ? rated.reduce((sum, w) => sum + (w.rpe ?? 0), 0) / rated.length
      : null
    const totalReps = wodEntries.reduce((sum, w) => sum + w.repsPerRound * rounds, 0)
    const totalHse = wodHse(seconds, rpe, totalReps)

    // Share out by rep contribution; fall back to an even split when the
    // movements were logged without rep counts.
    const repShareBase = wodEntries.reduce((sum, w) => sum + w.repsPerRound, 0)
    for (const entry of wodEntries) {
      const share = repShareBase > 0
        ? entry.repsPerRound / repShareBase
        : 1 / wodEntries.length
      addMuscleDelta(entry.links, totalHse * share, entry.damage)
    }
  }

  const avgRpe = rpeCount > 0 ? totalRpe / rpeCount : 0

  // Whole-body cost of the session. A long run leaves every individual muscle
  // reading fine, which is exactly why readiness never used to move for it.
  const sessionLoad = systemicLoad(duration ?? 0, avgRpe, setTypeCounts)

  return { totalVolume, avgRpe, sessionLoad, muscleDeltas, newE1rm }
}

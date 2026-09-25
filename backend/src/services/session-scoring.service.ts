import {
  FATIGUE_PER_HSE,
  HOLD_SECONDS_PER_REP,
  cardioHse,
  estimateE1rm,
  mobilityHse,
  resistanceHse,
  systemicLoad,
  wodHse,
  wodLoadFactor,
} from './fatigue-model.service'

/**
 * Scores a session's sets into volume, average RPE, systemic load, per-muscle
 * fatigue deltas and e1RM estimates. Pure — the single copy used both when a
 * session finishes and when an edited one is re-scored.
 */

/** The fields the scorer reads. */
export interface ScorableSession {
  workoutExercises: {
    exercise: {
      id: string
      damageFactor: number
      referenceSpeedKmh: number | null
      referenceCadenceRpm: number | null
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
      cardio: { distance: number | null; time: number | null; reps: number | null } | null
      wod: { reps: number | null; rounds: number | null; time: number | null; distance: number | null; weight: number | null } | null
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
    /** Session duration; drives systemic load. */
    duration: number | null
  }
): SessionScore => {
  // totalVolume is mechanical kg only (strength + calisthenics); whole-body
  // cost is carried by systemicLoad
  let totalVolume = 0
  let totalRpe = 0
  let rpeCount = 0

  // Fatigue per muscle, accumulated across every exercise
  const muscleDeltas = new Map<string, {
    delta: number
    muscleName: string
    halfLifeHours: number
  }>()

  const setTypeCounts = new Map<string, number>()
  const newE1rm = new Map<string, number>()

  type MuscleLink = ScorableSession['workoutExercises'][number]['exercise']['muscleLinks']
  // Metcon sets are collected and scored as one effort after the loop
  const wodEntries: {
    links: MuscleLink
    damage: number
    repsPerRound: number
    seconds: number
    rounds: number
    rpe: number | null
    /** `wodLoadFactor` for this movement; 1 at bodyweight. */
    load: number
  }[] = []

  // damageFactor is the movement's mechanical cost per unit of work;
  // impactFactor only says which muscles are recruited
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
        // Load is bodyweight plus added (or minus assisted) weight
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
        // No volume, but real load: distance (or count) where the activity has
        // a reference rate, else the clock
        addMuscleDelta(muscleLinks, cardioHse(
          set.cardio.time ?? 0,
          set.rpe,
          set.cardio.distance,
          exercise.referenceSpeedKmh,
          set.cardio.reps,
          exercise.referenceCadenceRpm
        ), damage)

      } else if (set.wod) {
        wodEntries.push({
          links: muscleLinks,
          damage,
          repsPerRound: set.wod.reps ?? 0,
          seconds: set.wod.time ?? 0,
          rounds: set.wod.rounds ?? 0,
          rpe: set.rpe,
          // Relative to the athlete's bodyweight
          load: wodLoadFactor(set.wod.weight, bodyWeight),
        })

      } else if (set.mobility) {
        addMuscleDelta(muscleLinks, mobilityHse(), damage)
      }
    }
  }

  // Score the metcon as a whole, then split it across its movements — each
  // movement's set carries the same clock, so scoring them separately multiplies it
  if (wodEntries.length > 0) {
    const seconds = Math.max(...wodEntries.map(w => w.seconds))
    const rounds = Math.max(...wodEntries.map(w => w.rounds))
    const rated = wodEntries.filter(w => w.rpe != null)
    const rpe = rated.length > 0
      ? rated.reduce((sum, w) => sum + (w.rpe ?? 0), 0) / rated.length
      : null
    const totalReps = wodEntries.reduce((sum, w) => sum + w.repsPerRound * rounds, 0)

    // Load multiplier weighted by each movement's rep contribution
    const repBase = wodEntries.reduce((sum, w) => sum + w.repsPerRound, 0)
    const loadMultiplier = repBase > 0
      ? wodEntries.reduce((sum, w) => sum + w.load * (w.repsPerRound / repBase), 0)
      : 1

    const totalHse = wodHse(seconds, rpe, totalReps) * loadMultiplier

    // Split by rep contribution × load; even split when reps were not logged
    const shareBase = wodEntries.reduce((sum, w) => sum + w.repsPerRound * w.load, 0)
    for (const entry of wodEntries) {
      const share = shareBase > 0
        ? (entry.repsPerRound * entry.load) / shareBase
        : 1 / wodEntries.length
      addMuscleDelta(entry.links, totalHse * share, entry.damage)
    }
  }

  const avgRpe = rpeCount > 0 ? totalRpe / rpeCount : 0

  // Whole-body cost of the session
  const sessionLoad = systemicLoad(duration ?? 0, avgRpe, setTypeCounts)

  return { totalVolume, avgRpe, sessionLoad, muscleDeltas, newE1rm }
}

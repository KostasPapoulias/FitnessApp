/**
 * Request shapes for the workout endpoints. Logged sets feed the fatigue
 * model, so these bounds are what keep bad values out of training history.
 */

import {
  z, id, kg, addedKg, reps, count, rpe, seconds, distanceKm, rounds, restSeconds, notes,
} from '../lib/validate'

/** Sets per exercise. */
const setNumber = z.number().int().min(1).max(200)

/** Fields every set carries. RPE and rest are nullish: unrecorded differs from a default. */
const setBase = {
  workoutExerciseId: id,
  setNumber,
  rpe: rpe.nullish(),
  restSeconds: restSeconds.nullish(),
}

/** A logged set, discriminated by `setType` so each modality accepts only its own fields. */
export const logSetSchema = z.discriminatedUnion('setType', [
  z.object({
    ...setBase,
    setType: z.literal('STRENGTH'),
    reps: reps.optional(),
    weight: kg.optional(),
  }),
  z.object({
    ...setBase,
    setType: z.literal('CALISTHENICS'),
    reps: reps.optional(),
    // Negative is assistance (band or machine)
    addedWeight: addedKg.optional(),
    /** Seconds under tension for an isometric hold logged without reps. */
    duration: seconds.nullish(),
  }),
  z.object({
    ...setBase,
    setType: z.literal('CARDIO'),
    distance: distanceKm.nullish(),
    time: seconds.nullish(),
    /** Counted work with no distance (skips, floors) — bounded by `count`. */
    reps: count.nullish(),
    /** The recorded route; validated by `validateRun` in the controller. */
    run: z.unknown().optional(),
  }),
  z.object({
    ...setBase,
    setType: z.literal('WOD'),
    distance: distanceKm.nullish(),
    time: seconds.nullish(),
    /** Reps per round — with `rounds`, this is the metcon's score. */
    reps: reps.nullish(),
    rounds: rounds.nullish(),
    /** External load, never negative. */
    weight: kg.nullish(),
  }),
  z.object({
    ...setBase,
    setType: z.literal('MOBILITY'),
    /** Hold time in seconds. */
    duration: seconds.nullish(),
  }),
])

export type LogSetBody = z.infer<typeof logSetSchema>

/**
 * Editing a recorded set. Absent leaves a field alone, `null` clears it, a
 * number replaces it. Out-of-range values are rejected, not clamped.
 */
export const updateSetSchema = z.object({
  rpe: rpe.nullish(),
  restSeconds: restSeconds.nullish(),
  /** `count`, not `reps`: this shape edits every set type, including rope counts. */
  reps: count.nullish(),
  weight: kg.nullish(),
  addedWeight: addedKg.nullish(),
  distance: distanceKm.nullish(),
  time: seconds.nullish(),
  rounds: rounds.nullish(),
})

export type UpdateSetBody = z.infer<typeof updateSetSchema>

export const startSessionSchema = z.object({
  notes: notes.nullish(),
  weatherCondition: z.string().trim().max(60).nullish(),
})

export const addExerciseSchema = z.object({
  exerciseId: id,
  // Bounded position in the session's exercise list
  orderIndex: z.number().int().min(0).max(500),
  notes: notes.nullish(),
})

/** An exercise's note in a session; `null` clears it. */
export const updateExerciseNotesSchema = z.object({
  notes: notes.nullable(),
})

export type UpdateExerciseNotesBody = z.infer<typeof updateExerciseNotesSchema>

export const finishSessionSchema = z.object({
  /** Elapsed seconds from the client clock; feeds systemic load, so bounded to 24 h. */
  duration: seconds.nullish(),
})

/**
 * Request shapes for the workout endpoints.
 *
 * These are the highest-stakes bodies in the app. A WorkoutSet is not a record
 * that can be corrected later and forgotten about — it is the input to the
 * fatigue model, so a bad one moves the athlete's readiness score, the colours
 * on the body map, tomorrow's suggested weights and the AI coach's advice. The
 * value of validating here is not that it prevents a crash; nothing crashed
 * before. It is that it stops nonsense becoming history.
 */

import {
  z, id, kg, addedKg, reps, rpe, seconds, metres, rounds, restSeconds, notes,
} from '../lib/validate'

/** Sets per exercise. High enough for a long EMOM, low enough to bound a loop. */
const setNumber = z.number().int().min(1).max(200)

/**
 * Fields every set carries, whatever the modality.
 *
 * RPE and rest are `nullish` rather than optional-with-a-default: an unrecorded
 * effort is genuinely different from an effort of 7, and the fatigue model
 * treats it that way (see `rpeFactor`). Defaulting here would erase that.
 */
const setBase = {
  workoutExerciseId: id,
  setNumber,
  rpe: rpe.nullish(),
  restSeconds: restSeconds.nullish(),
}

/**
 * A logged set, discriminated by modality.
 *
 * A discriminated union rather than one object with every field optional. The
 * flat version cannot say that a CARDIO set has no `weight` and a STRENGTH set
 * has no `rounds`, so it would validate `{ setType: 'CARDIO', weight: 200 }`
 * and hand it to the controller intact, to be ignored somewhere further down.
 * Here the field is dropped at the boundary and, more usefully, TypeScript
 * narrows on `setType` — reading `body.weight` in the cardio branch stops
 * compiling rather than silently being undefined.
 */
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
    // Negative is assistance (a band, a machine), so this is the one load that
    // is allowed below zero.
    addedWeight: addedKg.optional(),
    /** Seconds under tension for an isometric hold logged without reps. */
    duration: seconds.nullish(),
  }),
  z.object({
    ...setBase,
    setType: z.literal('CARDIO'),
    distance: metres.nullish(),
    time: seconds.nullish(),
    /**
     * The recorded route. Left unchecked here on purpose — `validateRun` in the
     * controller already owns it, and it is the only thing that knows the point
     * budget and the coordinate rules. Duplicating those here would give two
     * places to change and one of them would be missed.
     */
    run: z.unknown().optional(),
  }),
  z.object({
    ...setBase,
    setType: z.literal('WOD'),
    distance: metres.nullish(),
    time: seconds.nullish(),
    /** Reps per round — with `rounds`, this is the metcon's score. */
    reps: reps.nullish(),
    rounds: rounds.nullish(),
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
 * Editing a recorded set.
 *
 * Three states per field, and they mean different things: absent leaves the
 * value alone, `null` clears it, a number replaces it. `.nullish()` is what
 * preserves that distinction — `.optional()` alone would make "clear this
 * field" unexpressible.
 *
 * This replaced a clamp. Clamping looked safer and was not: a weight typed as
 * 10000 was silently stored as 1000, so the athlete's history gained a lift
 * they never did and nothing told them. Out of range now fails loudly.
 */
export const updateSetSchema = z.object({
  rpe: rpe.nullish(),
  restSeconds: restSeconds.nullish(),
  reps: reps.nullish(),
  weight: kg.nullish(),
  addedWeight: addedKg.nullish(),
  distance: metres.nullish(),
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
  // Position in the session's exercise list. Bounded so a client bug cannot
  // write an index Postgres has to sort around forever.
  orderIndex: z.number().int().min(0).max(500),
  notes: notes.nullish(),
})

export const finishSessionSchema = z.object({
  /**
   * Elapsed seconds, from the client's own clock.
   *
   * Optional because the server can fall back to the session's timestamps, and
   * bounded by `seconds` (24h) because this feeds Foster's sRPE directly —
   * a stray duration is a stray systemic load, and systemic load is the term
   * that carries a hard run into the readiness score.
   */
  duration: seconds.nullish(),
})

/**
 * The bounds that stop nonsense becoming training history.
 *
 * Worth testing for a reason the fatigue tests are not: these assertions are
 * about values that are *rejected*, and a schema that silently stops rejecting
 * something looks exactly like a schema that is working. Loosening a bound by
 * accident — an `.optional()` where `.nullish()` was meant, a `z.number()` that
 * lost its `.min()` in a refactor — produces no error anywhere until bad data
 * is already in Postgres.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { logSetSchema, updateSetSchema } from './workout.schema'
import { overrideFatigueSchema } from './fatigue.schema'
import { logNutritionSchema, logSleepSchema, updateProfileSchema } from './profile.schema'

const accepts = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  assert.ok(schema.safeParse(value).success, `should have accepted ${JSON.stringify(value)}`)

const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  assert.ok(!schema.safeParse(value).success, `should have rejected ${JSON.stringify(value)}`)

const strengthSet = {
  workoutExerciseId: 'we_123',
  setNumber: 1,
  setType: 'STRENGTH' as const,
  reps: 8,
  weight: 100,
  rpe: 8,
}

describe('logSetSchema', () => {
  test('accepts an ordinary strength set', () => {
    accepts(logSetSchema, strengthSet)
  })

  test('rejects a negative weight', () => {
    // The example from the TODO. Accepted before, and it became fatigue input.
    rejects(logSetSchema, { ...strengthSet, weight: -50 })
  })

  test('rejects a weight past anything ever lifted', () => {
    rejects(logSetSchema, { ...strengthSet, weight: 5000 })
  })

  test('rejects a ten-hour rest between sets', () => {
    rejects(logSetSchema, { ...strengthSet, restSeconds: 36_000 })
  })

  test('rejects an RPE outside 1..10', () => {
    rejects(logSetSchema, { ...strengthSet, rpe: 0 })
    rejects(logSetSchema, { ...strengthSet, rpe: 11 })
    rejects(logSetSchema, { ...strengthSet, rpe: -3 })
  })

  test('accepts an absent RPE — not recording effort is information', () => {
    accepts(logSetSchema, { ...strengthSet, rpe: undefined })
    accepts(logSetSchema, { ...strengthSet, rpe: null })
  })

  test('rejects fractional reps', () => {
    rejects(logSetSchema, { ...strengthSet, reps: 8.5 })
  })

  test('rejects an unknown modality', () => {
    rejects(logSetSchema, { ...strengthSet, setType: 'YOGA' })
  })

  test('rejects a missing or empty workoutExerciseId', () => {
    rejects(logSetSchema, { ...strengthSet, workoutExerciseId: '' })
    const { workoutExerciseId: _omitted, ...withoutId } = strengthSet
    rejects(logSetSchema, withoutId)
  })

  test('rejects setNumber 0 — sets are 1-indexed', () => {
    rejects(logSetSchema, { ...strengthSet, setNumber: 0 })
  })

  test('rejects a string where a number belongs', () => {
    // `'80' > 100` is false, which is how a string used to pass a range check.
    rejects(logSetSchema, { ...strengthSet, weight: '100' })
    rejects(logSetSchema, { ...strengthSet, rpe: '8' })
  })

  test('allows negative addedWeight on calisthenics — that is assistance', () => {
    const assisted = {
      workoutExerciseId: 'we_1',
      setNumber: 1,
      setType: 'CALISTHENICS' as const,
      reps: 6,
      addedWeight: -20,
    }
    accepts(logSetSchema, assisted)
    rejects(logSetSchema, { ...assisted, addedWeight: -900 })
  })

  test('distance is kilometres, so a client sending metres is rejected', () => {
    // SetCardio.distance is km rounded to 2dp (RunTrack.distanceM is the metre
    // one). The bound inherited from the old clamp table read it as metres and
    // allowed 500_000, so a 5 km run sent as 5000 was stored as 5000 km.
    accepts(logSetSchema, {
      workoutExerciseId: 'we_1', setNumber: 1, setType: 'CARDIO', time: 1800, distance: 5,
    })
    rejects(logSetSchema, {
      workoutExerciseId: 'we_1', setNumber: 1, setType: 'CARDIO', time: 1800, distance: 5000,
    })
  })

  test('drops a field that does not belong to the modality', () => {
    const parsed = logSetSchema.safeParse({
      workoutExerciseId: 'we_1',
      setNumber: 1,
      setType: 'CARDIO',
      time: 1800,
      distance: 5,
      weight: 200,
    })
    assert.ok(parsed.success)
    assert.ok(!('weight' in parsed.data))
  })

  test('leaves a run track for validateRun rather than checking it twice', () => {
    accepts(logSetSchema, {
      workoutExerciseId: 'we_1',
      setNumber: 1,
      setType: 'CARDIO',
      time: 1800,
      run: { points: [{ lat: 1, lng: 2 }], anythingElse: true },
    })
  })

  test('rejects a run longer than a day on the clock', () => {
    rejects(logSetSchema, {
      workoutExerciseId: 'we_1',
      setNumber: 1,
      setType: 'CARDIO',
      time: 90_000,
    })
  })
})

describe('updateSetSchema', () => {
  test('distinguishes absent from null — leave alone vs clear', () => {
    const untouched = updateSetSchema.safeParse({ reps: 10 })
    assert.ok(untouched.success)
    assert.equal(untouched.data.rpe, undefined)

    const cleared = updateSetSchema.safeParse({ reps: 10, rpe: null })
    assert.ok(cleared.success)
    assert.equal(cleared.data.rpe, null)
  })

  test('rejects out of range rather than clamping it', () => {
    // The old clampField stored 10000 kg as 1000 and told nobody, so the
    // athlete's history gained a lift they never did.
    rejects(updateSetSchema, { weight: 10_000 })
    rejects(updateSetSchema, { rpe: 99 })
  })

  test('an empty edit is valid — every field is optional', () => {
    accepts(updateSetSchema, {})
  })
})

describe('overrideFatigueSchema', () => {
  test('accepts 0..100', () => {
    accepts(overrideFatigueSchema, { fatigueLevel: 0 })
    accepts(overrideFatigueSchema, { fatigueLevel: 100 })
  })

  test('rejects what the old hand-written check let through', () => {
    // `undefined < 0` is false and `undefined > 100` is false, so an absent
    // field passed the range test and reached Prisma. So did a string.
    rejects(overrideFatigueSchema, {})
    rejects(overrideFatigueSchema, { fatigueLevel: undefined })
    rejects(overrideFatigueSchema, { fatigueLevel: '80' })
    rejects(overrideFatigueSchema, { fatigueLevel: null })
  })

  test('still rejects an out-of-range number', () => {
    rejects(overrideFatigueSchema, { fatigueLevel: -1 })
    rejects(overrideFatigueSchema, { fatigueLevel: 101 })
  })
})

describe('profile schemas', () => {
  test('bodyweight is bounded, because calisthenics load is scored against it', () => {
    accepts(updateProfileSchema, { weight: 82 })
    rejects(updateProfileSchema, { weight: 7 })
    rejects(updateProfileSchema, { weight: 0 })
    rejects(updateProfileSchema, { weight: 900 })
  })

  test('a partial profile edit stays partial', () => {
    accepts(updateProfileSchema, {})
    accepts(updateProfileSchema, { name: 'Kostas' })
  })

  test('sleep duration must be a real night', () => {
    accepts(logSleepSchema, { durationMin: 450 })
    rejects(logSleepSchema, { durationMin: 0 })
    rejects(logSleepSchema, { durationMin: 1441 })
    rejects(logSleepSchema, {})
  })

  test('sleep score is 0..100 or absent', () => {
    accepts(logSleepSchema, { durationMin: 450, sleepScore: null })
    rejects(logSleepSchema, { durationMin: 450, sleepScore: 101 })
  })

  test('nutrition needs a date it can actually parse', () => {
    accepts(logNutritionSchema, { logDate: '2026-08-23', proteinG: 150 })
    rejects(logNutritionSchema, {})
    rejects(logNutritionSchema, { logDate: '' })
    rejects(logNutritionSchema, { logDate: '2026-08-23', calories: -500 })
  })
})

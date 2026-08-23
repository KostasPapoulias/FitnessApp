/**
 * Readiness scoring.
 *
 * `getUserReadiness` is not tested here — it is a database read, and the pure
 * functions underneath it are where every decision actually lives. Those are
 * the single source of truth for "how ready is this athlete": both
 * GET /api/fatigue/current and the AI system prompt read from them, and the
 * reason they do is that both used to roll their own average and drifted apart.
 * A test that pins the shared arithmetic is what stops that happening again.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_FITNESS_LEVEL,
  READINESS_MODELS,
  aggregateMuscleFatigue,
  bandReadiness,
  computeReadinessScore,
  normalizeFitnessLevel,
} from './readiness.service'

const close = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  )

/** The catalogue is 15 muscles; an untrained one counts as 0, never as absent. */
const wholeBody = (trained: number[]): number[] => {
  const rest = new Array(Math.max(0, 15 - trained.length)).fill(0)
  return [...trained, ...rest]
}

describe('aggregateMuscleFatigue', () => {
  test('nothing trained is nothing to aggregate', () => {
    close(aggregateMuscleFatigue([]), 0)
  })

  test('a hard leg day does not average away to nothing', () => {
    // The bug this exists to prevent: a flat mean across 15 muscles turned
    // quads/hams/glutes at 80 into an overall 16, and the app said "ready".
    const legDay = wholeBody([80, 80, 80])
    const flatMean = legDay.reduce((a, b) => a + b, 0) / legDay.length

    close(flatMean, 16)
    close(aggregateMuscleFatigue(legDay), 48) // mean 16 × 0.5 + peak 80 × 0.5
  })

  test('is half mean and half the worst three', () => {
    const levels = wholeBody([90, 60, 30])
    const mean = levels.reduce((a, b) => a + b, 0) / levels.length
    const peak = (90 + 60 + 30) / 3
    close(aggregateMuscleFatigue(levels), mean * 0.5 + peak * 0.5)
  })

  test('a uniformly fatigued body aggregates to that level exactly', () => {
    close(aggregateMuscleFatigue(new Array(15).fill(50)), 50)
  })

  test('order of the input does not matter', () => {
    const levels = wholeBody([80, 20, 55, 10])
    close(aggregateMuscleFatigue(levels), aggregateMuscleFatigue([...levels].reverse()))
  })

  test('training more muscles never improves the score', () => {
    // The invariant behind "fatigueLevels must cover the ENTIRE muscle set":
    // adding load somewhere can only push the aggregate up.
    const before = aggregateMuscleFatigue(wholeBody([80, 80, 80]))
    const after = aggregateMuscleFatigue(wholeBody([80, 80, 80, 40, 40]))
    assert.ok(after >= before)
  })
})

describe('computeReadinessScore', () => {
  const intermediate = READINESS_MODELS.intermediate

  test('an athlete with no history and no systemic load is fully ready', () => {
    assert.equal(computeReadinessScore([], intermediate, 0, 0), 100)
  })

  test('a bad night still costs an athlete who has trained nothing', () => {
    // Returning a flat 100 here would make the sleep modifier silently
    // inapplicable to exactly the people who train least.
    assert.equal(computeReadinessScore([], intermediate, 0, -12), 88)
  })

  test('muscle load is 70% and systemic 30%', () => {
    const muscleOnly = computeReadinessScore(new Array(15).fill(50), intermediate, 0, 0)
    const systemicOnly = computeReadinessScore(new Array(15).fill(0), intermediate, 50, 0)

    assert.equal(muscleOnly, Math.round(100 - 50 * 0.7))
    assert.equal(systemicOnly, Math.round(100 - 50 * 0.3))
  })

  test('a long run leaves muscles fresh but readiness reduced', () => {
    // Systemic fatigue is the only channel that can carry this. Without the
    // term, an hour of running left every muscle reading fresh and the
    // readiness score essentially untouched.
    const afterRun = computeReadinessScore(new Array(15).fill(0), intermediate, 60, 0)
    assert.ok(afterRun < 100)
  })

  test('advanced athletes are penalised less for the same fatigue', () => {
    const levels = new Array(15).fill(60)
    const beginner = computeReadinessScore(levels, READINESS_MODELS.beginner, 20, 0)
    const middle = computeReadinessScore(levels, READINESS_MODELS.intermediate, 20, 0)
    const advanced = computeReadinessScore(levels, READINESS_MODELS.advanced, 20, 0)

    assert.ok(beginner < middle)
    assert.ok(middle < advanced)
  })

  test('sleep is a signed shift in points, added after the penalty', () => {
    const base = computeReadinessScore(new Array(15).fill(40), intermediate, 10, 0)
    assert.equal(computeReadinessScore(new Array(15).fill(40), intermediate, 10, 8), base + 8)
    assert.equal(computeReadinessScore(new Array(15).fill(40), intermediate, 10, -8), base - 8)
  })

  test('is clamped to 0..100 whatever the inputs', () => {
    assert.equal(computeReadinessScore(new Array(15).fill(100), READINESS_MODELS.beginner, 100, -50), 0)
    assert.equal(computeReadinessScore(new Array(15).fill(0), intermediate, 0, 40), 100)
  })

  test('rounds once at the end', () => {
    // Rounding per muscle first skews the average, which is why the raw
    // effective levels are passed in and only the final score is rounded.
    const score = computeReadinessScore(wholeBody([33.3, 66.6, 11.1]), intermediate, 7.77, 0)
    assert.equal(score, Math.round(score))
  })

  test('defaults to the intermediate model when none is given', () => {
    const levels = new Array(15).fill(45)
    assert.equal(
      computeReadinessScore(levels),
      computeReadinessScore(levels, READINESS_MODELS[DEFAULT_FITNESS_LEVEL])
    )
  })
})

describe('normalizeFitnessLevel', () => {
  test('accepts the three known levels, case and whitespace insensitive', () => {
    assert.equal(normalizeFitnessLevel('beginner'), 'beginner')
    assert.equal(normalizeFitnessLevel('  ADVANCED '), 'advanced')
    assert.equal(normalizeFitnessLevel('Intermediate'), 'intermediate')
  })

  test('anything else becomes intermediate rather than throwing', () => {
    assert.equal(normalizeFitnessLevel('elite'), DEFAULT_FITNESS_LEVEL)
    assert.equal(normalizeFitnessLevel(''), DEFAULT_FITNESS_LEVEL)
    assert.equal(normalizeFitnessLevel(null), DEFAULT_FITNESS_LEVEL)
    assert.equal(normalizeFitnessLevel(undefined), DEFAULT_FITNESS_LEVEL)
  })
})

describe('bandReadiness', () => {
  const model = READINESS_MODELS.intermediate

  test('bands on the score, inclusive at each threshold', () => {
    assert.equal(bandReadiness(100, model), 'ready')
    assert.equal(bandReadiness(70, model), 'ready')
    assert.equal(bandReadiness(69, model), 'caution')
    assert.equal(bandReadiness(40, model), 'caution')
    assert.equal(bandReadiness(39, model), 'rest')
    assert.equal(bandReadiness(0, model), 'rest')
  })

  test('the traffic light agrees with the number printed next to it', () => {
    // Banding is computed from the final, sleep-included score. Banding from
    // the pre-sleep score would let the light say "ready" beside a 62.
    const levels = new Array(15).fill(30)
    const withBadSleep = computeReadinessScore(levels, model, 20, -20)
    assert.equal(bandReadiness(withBadSleep, model), withBadSleep >= 70 ? 'ready' : 'caution')
  })
})

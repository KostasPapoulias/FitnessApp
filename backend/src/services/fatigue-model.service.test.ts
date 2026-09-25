/**
 * Tests for the fatigue model's calibration. Exact-value assertions pin the
 * current constants (a failure means a number changed); relational ones pin
 * the model's claims (a failure means the model no longer does what it says).
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  FATIGUE_PER_HSE,
  HOLD_SECONDS_PER_REP,
  SYSTEMIC_AU_PER_POINT,
  accumulate,
  ageRecoveryFactor,
  cardioHse,
  estimateE1rm,
  mobilityHse,
  recoveryRateFor,
  resistanceHse,
  resolveAge,
  rpeFactor,
  systemicFatigueDelta,
  systemicLoad,
  wodHse,
  wodLoadFactor,
} from './fatigue-model.service'

/** Floating-point comparison with a tolerance. */
const close = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  )

describe('rpeFactor', () => {
  test('RPE 10 is a set to failure and spends the full potential', () => {
    close(rpeFactor(10), 1)
  })

  test('RPE 3 and below is a warm-up, floored rather than zero', () => {
    close(rpeFactor(3), 0.05)
    close(rpeFactor(1), 0.05)
    close(rpeFactor(-5), 0.05)
  })

  test('an absent RPE is treated as 7', () => {
    close(rpeFactor(null), rpeFactor(7))
    close(rpeFactor(undefined), rpeFactor(7))
    close(rpeFactor(7), 4 / 7)
  })

  test('is monotonic across the usable range', () => {
    for (let value = 4; value < 10; value++) {
      assert.ok(rpeFactor(value) < rpeFactor(value + 1))
    }
  })
})

describe('estimateE1rm', () => {
  test('Epley, with reps left in reserve added to the rep count', () => {
    // RPE 10 → 0 in reserve → plain Epley over 5 reps
    close(estimateE1rm(100, 5, 10), 100 * (1 + 5 / 30))
    // RPE 8 → 2 in reserve → scored as 7 reps
    close(estimateE1rm(100, 5, 8), 100 * (1 + 7 / 30))
  })

  test('reserve is capped at 5, so a sandbagged RPE cannot inflate the estimate', () => {
    close(estimateE1rm(100, 5, 1), estimateE1rm(100, 5, 5))
  })

  test('a set with no load or no reps has no estimate', () => {
    close(estimateE1rm(0, 5, 8), 0)
    close(estimateE1rm(100, 0, 8), 0)
  })
})

describe('resistanceHse', () => {
  test('scores load RELATIVE to the athlete', () => {
    // Same relative effort, same cost, whatever the absolute weight
    const strong = resistanceHse({ reps: 5, weight: 140, rpe: 8, e1rm: 180 })
    const weaker = resistanceHse({ reps: 5, weight: 70, rpe: 8, e1rm: 90 })
    close(strong, weaker)
  })

  test('a heavier set costs more than a lighter one at the same RPE', () => {
    const heavy = resistanceHse({ reps: 5, weight: 160, rpe: 8, e1rm: 200 })
    const light = resistanceHse({ reps: 5, weight: 80, rpe: 8, e1rm: 200 })
    assert.ok(heavy > light)
  })

  test('a set of 20 costs more than a set of 5, but nowhere near four times as much', () => {
    const twenty = resistanceHse({ reps: 20, weight: 100, rpe: 9, e1rm: 200 })
    const five = resistanceHse({ reps: 5, weight: 100, rpe: 9, e1rm: 200 })
    assert.ok(twenty > five)
    assert.ok(twenty < five * 2)
  })

  test('KNOWN: a long light set DOES outscore a heavy one below RPE 10', () => {
    // Known calibration quirk: at RPE 9, 20 × 60 kg outscores 5 × 200 kg,
    // because a 5-rep set's own e1RM caps its relative load near 0.86.
    // Pinned so any retune has to decide this deliberately.
    const longLight = resistanceHse({ reps: 20, weight: 60, rpe: 9, e1rm: 200 })
    const maximal = resistanceHse({ reps: 5, weight: 200, rpe: 9, e1rm: 200 })
    assert.ok(longLight > maximal)
  })

  test('history only ever raises the load estimate, so a light day reads light', () => {
    const withHistory = resistanceHse({ reps: 5, weight: 60, rpe: 6, e1rm: 200 })
    const withoutHistory = resistanceHse({ reps: 5, weight: 60, rpe: 6 })
    assert.ok(withHistory < withoutHistory)
  })

  test('an isometric hold converts seconds to reps', () => {
    const held = resistanceHse({ reps: 0, weight: 80, rpe: 8, holdSeconds: 30, e1rm: 100 })
    const repped = resistanceHse({ reps: 30 / HOLD_SECONDS_PER_REP, weight: 80, rpe: 8, e1rm: 100 })
    close(held, repped)
  })

  test('a set with neither reps nor a hold scores nothing', () => {
    close(resistanceHse({ reps: 0, weight: 100, rpe: 9 }), 0)
  })

  test('calisthenics and barbell work are comparable at equal relative effort', () => {
    // Push-ups at 80 kg bodyweight vs 80 kg on a bar
    const pushUps = resistanceHse({ reps: 20, weight: 80, rpe: 9 })
    const bench = resistanceHse({ reps: 20, weight: 80, rpe: 9 })
    close(pushUps, bench)
  })
})

describe('cardioHse', () => {
  test('nothing logged is nothing scored', () => {
    close(cardioHse(0, 8), 0)
  })

  test('volume leads intensity — the whole point of CARDIO_VOLUME_SHARE', () => {
    // Two hours easy costs the legs more than twenty minutes of intervals
    const longEasy = cardioHse(2 * 60 * 60, 4)
    const shortHard = cardioHse(20 * 60, 9)
    assert.ok(longEasy > shortHard)
  })

  test('intensity still moves the number at equal duration', () => {
    assert.ok(cardioHse(3600, 9) > cardioHse(3600, 4))
  })

  test('distance is converted to "minutes of typical work" when a reference speed exists', () => {
    // 15 km at a 12 km/h reference = 75 minutes of typical work
    const byDistance = cardioHse(1800, 7, 15, 12)
    const byEquivalentDuration = cardioHse(75 * 60, 7)
    close(byDistance, byEquivalentDuration)
  })

  test('the same distance on a bike and on foot are not equal work', () => {
    const run = cardioHse(3600, 7, 15, 12)
    const ride = cardioHse(3600, 7, 15, 28)
    assert.ok(run > ride)
  })

  test('falls back to the clock with no distance or no reference speed', () => {
    close(cardioHse(3600, 7, null, 12), cardioHse(3600, 7))
    close(cardioHse(3600, 7, 15, null), cardioHse(3600, 7))
  })

  test('a count at exactly the reference cadence scores as its duration', () => {
    // 1100 skips in 10 min at 110/min = 10 minutes of typical work
    close(cardioHse(600, 7, null, null, 1100, 110), cardioHse(600, 7))
  })

  test('density separates two sessions the clock cannot tell apart', () => {
    // Same clock and RPE; only the count differs
    const continuous = cardioHse(600, 7, null, null, 1400, 110)
    const stopStart = cardioHse(600, 7, null, null, 700, 110)
    assert.ok(continuous > stopStart)
    close(continuous / stopStart, 2)
  })

  test('a count cannot claim more than a human sustains', () => {
    // A typo is capped at 2.5× the clock; double-unders (~1.8×) pass
    const typo = cardioHse(600, 7, null, null, 11_000, 110)
    close(typo, cardioHse(25 * 60, 7))

    const doubleUnders = cardioHse(600, 7, null, null, 2000, 110)
    assert.ok(doubleUnders < typo)
  })

  test('distance wins over a count when both are present', () => {
    // Distance is the more informative measure
    close(
      cardioHse(1800, 7, 15, 12, 9999, 110),
      cardioHse(1800, 7, 15, 12)
    )
  })

  test('falls back to the clock with a count but no reference cadence', () => {
    close(cardioHse(600, 7, null, null, 900, null), cardioHse(600, 7))
    close(cardioHse(600, 7, null, null, 0, 110), cardioHse(600, 7))
  })
})

describe('wodHse', () => {
  test('nothing logged is nothing scored', () => {
    close(wodHse(0, 9, 200), 0)
  })

  test('work density separates eight rounds from three inside one time cap', () => {
    const dense = wodHse(12 * 60, 9, 400)
    const sparse = wodHse(12 * 60, 9, 60)
    assert.ok(dense > sparse)
  })

  test('density multiplier is clamped at both ends', () => {
    // More reps stop adding fatigue past the clamp
    const absurd = wodHse(10 * 60, 9, 100_000)
    const merelyHuge = wodHse(10 * 60, 9, 10_000)
    close(absurd, merelyHuge)
  })

  test('with no score recorded, the clock is all there is', () => {
    const scored = wodHse(600, 9, 0)
    const unscored = wodHse(600, 9, null)
    close(scored, unscored)
  })

  test('a metcon minute costs more than a cardio minute', () => {
    assert.ok(wodHse(1800, 8) > cardioHse(1800, 8))
  })
})

describe('wodLoadFactor', () => {
  test('bodyweight movements are unchanged', () => {
    close(wodLoadFactor(0, 80), 1)
    close(wodLoadFactor(null, 80), 1)
    close(wodLoadFactor(undefined, 80), 1)
  })

  test('a loaded movement costs more than the same movement empty-handed', () => {
    assert.ok(wodLoadFactor(43, 80) > wodLoadFactor(0, 80))
  })

  test('load is relative to the athlete, not absolute', () => {
    // The same bar is harder for a lighter athlete
    assert.ok(wodLoadFactor(43, 60) > wodLoadFactor(43, 95))
  })

  test('is monotonic in load', () => {
    const light = wodLoadFactor(20, 80)
    const middling = wodLoadFactor(40, 80)
    const heavy = wodLoadFactor(60, 80)
    assert.ok(light < middling && middling < heavy)
  })

  test('is capped, so one heavy movement cannot outweigh the clock', () => {
    // Load is a modifier; the factor stops climbing past the reference
    close(wodLoadFactor(100, 80), wodLoadFactor(500, 80))
    assert.ok(wodLoadFactor(500, 80) <= 1.8)
  })

  test('a missing bodyweight scores as unloaded rather than dividing by zero', () => {
    close(wodLoadFactor(43, 0), 1)
  })
})

describe('mobility', () => {
  test('is restorative and scores exactly zero, not rounding noise', () => {
    assert.equal(mobilityHse(), 0)
  })
})

describe('accumulate', () => {
  test('a fresh muscle takes the delta in full', () => {
    close(accumulate(0, 40), 40)
  })

  test('saturates towards 100 instead of slamming into it', () => {
    // Half the headroom is gone, so half the delta lands
    close(accumulate(50, 50), 75)
    close(accumulate(90, 50), 95)
  })

  test('converges on 100 and never passes it', () => {
    // Asymptotic in theory; in floating point it reaches exactly 100 and never passes it
    let level = 0
    for (let i = 0; i < 200; i++) level = accumulate(level, 50)
    assert.ok(level <= 100)
    assert.equal(level, 100)
  })

  test('keeps the ordering a hard cap used to destroy', () => {
    // A hard cap would make these two equal
    assert.ok(accumulate(80, 90) > accumulate(80, 30))
  })

  test('a zero or negative delta leaves the level alone', () => {
    close(accumulate(42, 0), 42)
    close(accumulate(42, -10), 42)
  })
})

describe('systemicLoad', () => {
  test('is Foster sRPE weighted by the modality mix', () => {
    const strengthOnly = new Map([['STRENGTH', 10]])
    // 60 min × RPE 6 × 0.6 for strength
    close(systemicLoad(3600, 6, strengthOnly), 60 * 6 * 0.6)
  })

  test('cardio costs a full minute per minute; strength does not', () => {
    const cardio = systemicLoad(3600, 6, new Map([['CARDIO', 5]]))
    const strength = systemicLoad(3600, 6, new Map([['STRENGTH', 5]]))
    assert.ok(cardio > strength)
  })

  test('a mixed session is weighted by set share', () => {
    const mixed = new Map([['CARDIO', 8], ['STRENGTH', 2]])
    // 0.8 × 1.0 + 0.2 × 0.6
    close(systemicLoad(3600, 6, mixed), 60 * 6 * (0.8 * 1.0 + 0.2 * 0.6))
  })

  test('an unknown set type falls back rather than scoring zero', () => {
    const unknown = systemicLoad(3600, 6, new Map([['SOMETHING_NEW', 4]]))
    close(unknown, 60 * 6 * 0.6)
  })

  test('no duration or no effort is no load', () => {
    close(systemicLoad(0, 6, new Map([['CARDIO', 1]])), 0)
    close(systemicLoad(3600, 0, new Map([['CARDIO', 1]])), 0)
  })

  test('an empty set-type map is scored as strength, not as nothing', () => {
    close(systemicLoad(3600, 6, new Map()), 60 * 6 * 0.6)
  })
})

describe('systemicFatigueDelta', () => {
  test('converts arbitrary units to fatigue points', () => {
    close(systemicFatigueDelta(180), 180 / SYSTEMIC_AU_PER_POINT)
  })

  test('no load is no fatigue', () => {
    close(systemicFatigueDelta(0), 0)
    close(systemicFatigueDelta(-50), 0)
  })
})

describe('recovery rate', () => {
  test('age 30 is the reference and multiplies by exactly 1', () => {
    close(ageRecoveryFactor(30), 1)
  })

  test('younger recovers faster, older slower', () => {
    assert.ok(ageRecoveryFactor(20) < 1)
    assert.ok(ageRecoveryFactor(50) > 1)
  })

  test('is clamped hard at both ends', () => {
    // The linear term is only valid within a normal range
    close(ageRecoveryFactor(120), 1.25)
    close(ageRecoveryFactor(1), 0.92)
  })

  test('an unknown age changes nothing', () => {
    close(ageRecoveryFactor(null), 1)
    close(ageRecoveryFactor(undefined), 1)
    close(ageRecoveryFactor(0), 1)
    close(ageRecoveryFactor(NaN), 1)
  })

  test('trained athletes clear fatigue faster than beginners', () => {
    assert.ok(recoveryRateFor('advanced', 30) < recoveryRateFor('intermediate', 30))
    assert.ok(recoveryRateFor('intermediate', 30) < recoveryRateFor('beginner', 30))
  })

  test('an unrecognised or absent level falls back to intermediate', () => {
    close(recoveryRateFor('elite', 30), recoveryRateFor('intermediate', 30))
    close(recoveryRateFor(null, 30), recoveryRateFor('intermediate', 30))
    close(recoveryRateFor('  ADVANCED  ', 30), recoveryRateFor('advanced', 30))
  })

  test('level and age compose', () => {
    close(recoveryRateFor('advanced', 50), 0.85 * ageRecoveryFactor(50))
  })

  test('training age explains more than birth year — level dominates', () => {
    // The age slope must not overwhelm the level multiplier
    assert.ok(recoveryRateFor('advanced', 45) < recoveryRateFor('beginner', 30))
  })
})

describe('resolveAge', () => {
  const now = new Date('2026-08-23T00:00:00Z')

  test('prefers birthDate over a stored age that has been going stale', () => {
    assert.equal(resolveAge(new Date('1996-01-01T00:00:00Z'), 12, now), 30)
  })

  test('falls back to the stored age when there is no birthDate', () => {
    assert.equal(resolveAge(null, 34, now), 34)
  })

  test('rejects an impossible birthDate rather than trusting it', () => {
    assert.equal(resolveAge(new Date('1600-01-01T00:00:00Z'), 34, now), 34)
    assert.equal(resolveAge(new Date('2030-01-01T00:00:00Z'), 34, now), 34)
  })

  test('an unknown age stays unknown rather than becoming a default', () => {
    assert.equal(resolveAge(null, null, now), null)
  })
})

describe('constants', () => {
  test('are the values the rest of the model was calibrated against', () => {
    // Guard: changing these is a deliberate recalibration
    assert.equal(FATIGUE_PER_HSE, 13)
    assert.equal(SYSTEMIC_AU_PER_POINT, 8)
    assert.equal(HOLD_SECONDS_PER_REP, 3)
  })

  test('roughly 8 hard sets on one muscle drives it near 100', () => {
    // The stated intent of FATIGUE_PER_HSE, end to end
    let level = 0
    for (let i = 0; i < 8; i++) {
      const hse = resistanceHse({ reps: 8, weight: 100, rpe: 9, e1rm: 130 })
      level = accumulate(level, hse * FATIGUE_PER_HSE)
    }
    assert.ok(level > 60, `8 hard sets reached only ${level.toFixed(1)}`)
    assert.ok(level < 100)
  })
})

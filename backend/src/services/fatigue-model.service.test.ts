/**
 * The calibration everything else derives from.
 *
 * These are not tests against bugs. Nothing here has ever thrown — the model is
 * pure arithmetic over numbers that are always numbers. They exist because the
 * constants in `fatigue-model.service.ts` are load-bearing for the whole app:
 * change FATIGUE_PER_HSE from 13 to 15 and every athlete's readiness score
 * moves, the body map recolours, tomorrow's suggested weights change and the
 * coach starts giving different advice — with nothing failing, nothing
 * typechecking differently and no way to tell whether the change did what was
 * intended.
 *
 * So the assertions come in two kinds, and the distinction matters when one
 * fails. The **exact-value** ones pin the current calibration: if one breaks,
 * you changed a number, and the only question is whether you meant to. The
 * **relational** ones encode the model's actual claims — that volume leads
 * intensity for endurance work, that a strong and a weak athlete pay the same
 * price for the same relative effort. If one of those breaks, the model no
 * longer says what its own comments say it says, and that is a real defect
 * whatever the constants are.
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
} from './fatigue-model.service'

/** Floating point: compare to a tolerance, never with ===. */
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
    // RPE 10 → 0 in reserve → plain Epley over 5 reps.
    close(estimateE1rm(100, 5, 10), 100 * (1 + 5 / 30))
    // RPE 8 → 2 in reserve → scored as if 7 reps were available.
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
    // The claim in the source: a 140 kg bencher and a 70 kg bencher pay the
    // same price for the same 5×5 at the same effort. Absolute tonnage
    // punished strong athletes, and this is the assertion that says so.
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
    // `repFactor`'s comment says the curve stays "flat enough that a long light
    // set never outscores a heavy one taken to the same RPE". Measured, that is
    // not true at RPE 9: 20 × 60 kg (30% of 1RM) scores 1.0925 and 5 × 200 kg
    // (100% of 1RM) scores 1.0648 — the light set wins at every load.
    //
    // The mechanism is `e1rm = max(history, estimateE1rm(this set))`. A 5-rep
    // set implies a 1RM about 17% above the weight lifted, so its own estimate
    // raises the denominator and relative load can never read higher than
    // ~0.86. loadFactor therefore tops out at ~1.63 instead of its nominal 1.7,
    // while repFactor gives the 20-rep set 1.27 for free.
    //
    // Pinned rather than corrected: whether 20 reps at RPE 9 SHOULD cost more
    // than a heavy triple is a calibration judgement, not a bug to fix in a
    // test. This assertion is here so that if the constants are ever retuned,
    // it fails and the decision gets made deliberately.
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
    // Push-ups: bodyweight 80 kg moved, e1rm implied by the set itself.
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
    // Two hours easy shreds the legs; twenty minutes of intervals feels harder
    // and barely touches them. Leaning on RPE alone got this backwards.
    const longEasy = cardioHse(2 * 60 * 60, 4)
    const shortHard = cardioHse(20 * 60, 9)
    assert.ok(longEasy > shortHard)
  })

  test('intensity still moves the number at equal duration', () => {
    assert.ok(cardioHse(3600, 9) > cardioHse(3600, 4))
  })

  test('distance is converted to "minutes of typical work" when a reference speed exists', () => {
    // 15 km at a 12 km/h reference is 75 minutes of typical work, regardless of
    // how long it actually took.
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
    // Past the clamp, more reps stop buying more fatigue — otherwise a
    // miscounted score would dominate everything else in the session.
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
    // Half the headroom is gone, so half the delta lands.
    close(accumulate(50, 50), 75)
    close(accumulate(90, 50), 95)
  })

  test('converges on 100 and never passes it', () => {
    // Asymptotic, not capped — but the asymptote is reached in floating point.
    // After ~61 saturating additions the level is exactly 100.0, because
    // `0.5 * level + 50` has no representable step left below it. What matters
    // is the ceiling holding, not the limit being unreachable in theory.
    let level = 0
    for (let i = 0; i < 200; i++) level = accumulate(level, 50)
    assert.ok(level <= 100)
    assert.equal(level, 100)
  })

  test('keeps the ordering a hard cap used to destroy', () => {
    // The bug this replaced: a session three times too hard and a merely hard
    // one both read exactly 100, so they were indistinguishable afterwards.
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
    // 60 minutes × RPE 6 × 0.6 for strength (most of a strength session is rest).
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
    // The linear term is a reasonable approximation across a normal training
    // population and nonsense outside it. Extrapolated freely it would claim a
    // 75-year-old recovers three times slower than a 30-year-old.
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
    // A deliberate design constraint: the age slope must not overwhelm the
    // level multiplier, or a 45-year-old advanced athlete would be modelled as
    // recovering slower than a 30-year-old beginner.
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
    // A guard, not a claim about correctness. Changing one of these is a
    // deliberate recalibration, and it should not be possible to do it by
    // accident in a refactor.
    assert.equal(FATIGUE_PER_HSE, 13)
    assert.equal(SYSTEMIC_AU_PER_POINT, 8)
    assert.equal(HOLD_SECONDS_PER_REP, 3)
  })

  test('roughly 8 hard sets on one muscle drives it near 100', () => {
    // The stated intent of FATIGUE_PER_HSE, asserted end to end through the
    // accumulation curve rather than trusted as a comment.
    let level = 0
    for (let i = 0; i < 8; i++) {
      const hse = resistanceHse({ reps: 8, weight: 100, rpe: 9, e1rm: 130 })
      level = accumulate(level, hse * FATIGUE_PER_HSE)
    }
    assert.ok(level > 60, `8 hard sets reached only ${level.toFixed(1)}`)
    assert.ok(level < 100)
  })
})

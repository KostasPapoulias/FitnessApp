/**
 * The decay curve, and the invariant that holds it together.
 *
 * The half-life is deliberately not stored. It is implied by the triple
 * (fatigueLevel, updatedAt, recoveryTargetAt), and the curve reconstructs
 * itself on read — which means `recoveryTargetFor` and `getEffectiveFatigueLevel`
 * have to remain exact inverses of each other. Nothing in the type system says
 * so, and a plausible-looking change to either one would break the pair while
 * leaving both functions individually reasonable. That round trip is the most
 * valuable assertion in this file.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  RECOVERED_BELOW,
  buildEffectiveFatigueMap,
  getEffectiveFatigueLevel,
  recoveryTargetFor,
} from './fatigue.service'

const close = (actual: number, expected: number, epsilon = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  )

const HOUR = 60 * 60 * 1000
const at = (base: Date, hours: number) => new Date(base.getTime() + hours * HOUR)

const NOW = new Date('2026-08-23T12:00:00Z')

describe('getEffectiveFatigueLevel', () => {
  test('a muscle with no record is fresh', () => {
    assert.equal(getEffectiveFatigueLevel(null, NOW), 0)
  })

  test('a level at or below the floor reads as fully recovered', () => {
    const record = {
      fatigueLevel: RECOVERED_BELOW,
      updatedAt: NOW,
      recoveryTargetAt: at(NOW, 24),
    }
    assert.equal(getEffectiveFatigueLevel(record, NOW), 0)
  })

  test('with no recovery window there is no curve to walk, so the level stands', () => {
    const record = { fatigueLevel: 60, updatedAt: at(NOW, -48), recoveryTargetAt: null }
    assert.equal(getEffectiveFatigueLevel(record, NOW), 60)
  })

  test('at the moment it was written, the level is untouched', () => {
    const record = { fatigueLevel: 80, updatedAt: NOW, recoveryTargetAt: at(NOW, 48) }
    close(getEffectiveFatigueLevel(record, NOW), 80)
  })

  test('a clock that has gone backwards does not add fatigue', () => {
    const record = { fatigueLevel: 80, updatedAt: NOW, recoveryTargetAt: at(NOW, 48) }
    close(getEffectiveFatigueLevel(record, at(NOW, -5)), 80)
  })

  test('past the recovery target the muscle is done, not merely low', () => {
    const record = { fatigueLevel: 80, updatedAt: NOW, recoveryTargetAt: at(NOW, 24) }
    assert.equal(getEffectiveFatigueLevel(record, at(NOW, 25)), 0)
  })

  test('decays exponentially, not linearly', () => {
    // The old model shed a flat ~2 points/hour for every muscle regardless of
    // size. Exponential means most of the fatigue goes early: at the halfway
    // point of the window, far less than half the fatigue is left.
    const record = { fatigueLevel: 80, updatedAt: NOW, recoveryTargetAt: at(NOW, 24) }
    const halfway = getEffectiveFatigueLevel(record, at(NOW, 12))
    const linear = 80 - (80 - RECOVERED_BELOW) / 2

    assert.ok(halfway < linear, `${halfway} should be below the linear ${linear}`)
    assert.ok(halfway > 0)
  })

  test('halves over one implied half-life', () => {
    // 80 → 5 is log2(16) = 4 half-lives, so a 24h window is a 6h half-life.
    const record = { fatigueLevel: 80, updatedAt: NOW, recoveryTargetAt: at(NOW, 24) }
    close(getEffectiveFatigueLevel(record, at(NOW, 6)), 40)
    close(getEffectiveFatigueLevel(record, at(NOW, 12)), 20)
    close(getEffectiveFatigueLevel(record, at(NOW, 18)), 10)
  })

  test('lands on zero rather than trailing off below the floor', () => {
    // Exponential decay never truly reaches zero, so the floor is what makes
    // "recovered" a state a muscle can actually be in. The curve approaches
    // RECOVERED_BELOW asymptotically and the window is sized so it arrives
    // there exactly at the target — so the last reading before the target sits
    // just above the floor, and the target itself reads 0.
    const record = { fatigueLevel: 80, updatedAt: NOW, recoveryTargetAt: at(NOW, 24) }

    const justBefore = getEffectiveFatigueLevel(record, at(NOW, 23.99))
    assert.ok(justBefore > RECOVERED_BELOW)
    close(justBefore, RECOVERED_BELOW, 0.01)

    assert.equal(getEffectiveFatigueLevel(record, at(NOW, 24)), 0)
  })

  test('is monotonically decreasing across the window', () => {
    const record = { fatigueLevel: 90, updatedAt: NOW, recoveryTargetAt: at(NOW, 36) }
    let previous = Infinity
    for (let hours = 0; hours <= 36; hours += 0.5) {
      const level = getEffectiveFatigueLevel(record, at(NOW, hours))
      assert.ok(level <= previous, `level rose at ${hours}h`)
      previous = level
    }
  })

  test('a bigger muscle given a longer window decays more slowly', () => {
    const calf = { fatigueLevel: 80, updatedAt: NOW, recoveryTargetAt: at(NOW, 24) }
    const lowerBack = { fatigueLevel: 80, updatedAt: NOW, recoveryTargetAt: at(NOW, 72) }
    assert.ok(
      getEffectiveFatigueLevel(lowerBack, at(NOW, 12)) >
      getEffectiveFatigueLevel(calf, at(NOW, 12))
    )
  })
})

describe('recoveryTargetFor', () => {
  test('a level whose half-life lands exactly on the floor is already done', () => {
    // 10 → one half-life → 5, which IS the floor. Not a special case in the
    // code, but the one place the round trip below cannot assert "half remains".
    const target = recoveryTargetFor(2 * RECOVERED_BELOW, 4, NOW)
    assert.ok(target)
    assert.equal(
      getEffectiveFatigueLevel(
        { fatigueLevel: 2 * RECOVERED_BELOW, updatedAt: NOW, recoveryTargetAt: target },
        at(NOW, 4)
      ),
      0
    )
  })

  test('an already-recovered level needs no window', () => {
    assert.equal(recoveryTargetFor(RECOVERED_BELOW, 12), null)
    assert.equal(recoveryTargetFor(0, 12), null)
  })

  test('a nonsensical half-life produces no window rather than a bad one', () => {
    assert.equal(recoveryTargetFor(80, 0), null)
    assert.equal(recoveryTargetFor(80, -6), null)
  })

  test('spans as many half-lives as it takes to reach the floor', () => {
    // 80 → 5 is exactly 4 half-lives.
    const target = recoveryTargetFor(80, 6, NOW)
    assert.ok(target)
    close(target!.getTime() - NOW.getTime(), 4 * 6 * HOUR, 1)
  })
})

describe('the decay/target round trip', () => {
  test('a level written with its target reads back as recovered at that target', () => {
    // This is the invariant the whole design rests on. If these two functions
    // ever stop being inverses, every stored row silently decays along the
    // wrong curve — with nothing failing and no column to inspect.
    // Levels start above 2 × RECOVERED_BELOW on purpose: at exactly 10, one
    // half-life lands on the floor itself, and the function correctly reports
    // that as recovered rather than as 5.
    for (const level of [25, 50, 80, 100]) {
      for (const halfLife of [4, 12, 48]) {
        const recoveryTargetAt = recoveryTargetFor(level, halfLife, NOW)
        assert.ok(recoveryTargetAt, `no target for ${level}/${halfLife}`)

        const record = { fatigueLevel: level, updatedAt: NOW, recoveryTargetAt }

        // One half-life in, exactly half remains.
        close(getEffectiveFatigueLevel(record, at(NOW, halfLife)), level / 2, 1e-6)

        // At the target, recovered.
        assert.equal(getEffectiveFatigueLevel(record, recoveryTargetAt!), 0)
      }
    }
  })
})

describe('buildEffectiveFatigueMap', () => {
  test('decays every record to the same instant, keyed by muscle', () => {
    const records = [
      { muscleId: 'quads', fatigueLevel: 80, updatedAt: NOW, recoveryTargetAt: at(NOW, 24) },
      { muscleId: 'calves', fatigueLevel: 40, updatedAt: NOW, recoveryTargetAt: null },
      { muscleId: 'chest', fatigueLevel: 3, updatedAt: NOW, recoveryTargetAt: at(NOW, 12) },
    ]

    const map = buildEffectiveFatigueMap(records, at(NOW, 6))

    assert.equal(map.size, 3)
    close(map.get('quads')!, 40)
    close(map.get('calves')!, 40)
    assert.equal(map.get('chest'), 0)
  })

  test('an empty list gives an empty map, not a throw', () => {
    assert.equal(buildEffectiveFatigueMap([], NOW).size, 0)
  })
})

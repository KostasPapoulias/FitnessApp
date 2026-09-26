/**
 * Tests for the set-count guard on history-based suggestions. A plan must never
 * shrink because the last session was cut short. Loads Prisma at import time;
 * no query is issued.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { keepPlannedLength } from './workout-progression.service'

describe('keepPlannedLength', () => {
  test('pads a short shape out to the planned length', () => {
    // One set logged, three planned: the plan keeps its three
    const performed = [{ reps: 8, weight: 60 }]
    const shape = keepPlannedLength(performed, 3)
    assert.equal(shape.length, 3)
    assert.deepEqual(shape, [
      { reps: 8, weight: 60 },
      { reps: 8, weight: 60 },
      { reps: 8, weight: 60 },
    ])
  })

  test('repeats the last set performed, not the first', () => {
    const performed = [{ reps: 10, weight: 50 }, { reps: 6, weight: 70 }]
    assert.deepEqual(keepPlannedLength(performed, 4), [
      { reps: 10, weight: 50 },
      { reps: 6, weight: 70 },
      { reps: 6, weight: 70 },
      { reps: 6, weight: 70 },
    ])
  })

  test('leaves a shape that already matches or exceeds the plan alone', () => {
    const three = [{ reps: 8 }, { reps: 8 }, { reps: 8 }]
    assert.equal(keepPlannedLength(three, 3), three)
    // The progression may add sets of its own; that is not shrinkage
    assert.equal(keepPlannedLength(three, 2), three)
  })

  test('padding is copies, so a later per-set map cannot alias one object', () => {
    const shape = keepPlannedLength([{ reps: 5, weight: 40 }], 3)
    shape[1].weight = 999
    assert.equal(shape[2].weight, 40, 'padded slots must not share an object')
    assert.equal(shape[0].weight, 40, 'the original must not be mutated')
  })

  test('an empty shape is returned untouched rather than padded from nothing', () => {
    // recentSessions filters out sessions with no sets, so this should not
    // arise; it must not throw if it ever does.
    assert.deepEqual(keepPlannedLength([], 3), [])
  })
})

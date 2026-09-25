/**
 * Tests for the plate grid suggested weights snap to, including rounding
 * direction (a deload must never round back up). Loads Prisma at import time;
 * no query is issued.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { roundToPlates } from './starting-load.service'

describe('roundToPlates', () => {
  test('never offers a weight off the grid', () => {
    assert.equal(roundToPlates(20.93), 20)
    // Half a step rounds up, like Math.round
    assert.equal(roundToPlates(21.25), 22.5)
    assert.equal(roundToPlates(21.2), 20)
    assert.equal(roundToPlates(103.7), 102.5)
  })

  test('uses 1 kg steps below 10 kg and 2.5 kg from there', () => {
    assert.equal(roundToPlates(7.4), 7)
    assert.equal(roundToPlates(8.6), 9)
    assert.equal(roundToPlates(11.1), 10)
    assert.equal(roundToPlates(12.5), 12.5)
  })

  test('leaves a weight already on the grid alone in every direction', () => {
    for (const kg of [5, 12.5, 22.5, 60, 102.5]) {
      assert.equal(roundToPlates(kg, 'nearest'), kg)
      assert.equal(roundToPlates(kg, 'up'), kg)
      assert.equal(roundToPlates(kg, 'down'), kg)
    }
  })

  test('up is never lighter and down is never heavier', () => {
    for (const kg of [3.2, 9.9, 13.4, 20.93, 47.1, 118.8]) {
      assert.ok(roundToPlates(kg, 'up') >= kg, `up ${kg}`)
      assert.ok(roundToPlates(kg, 'down') <= kg, `down ${kg}`)
    }
  })

  test('a 10% deload rounded down lands below the original', () => {
    assert.equal(roundToPlates(23.25 * 0.9, 'down'), 20)
    assert.equal(roundToPlates(12.5 * 0.9, 'down'), 10)
  })

  test('treats assistance as signed load', () => {
    // Up = harder = less assistance
    assert.equal(roundToPlates(-11.3, 'up'), -10)
    assert.equal(roundToPlates(-11.3, 'down'), -12.5)
  })

  test('zero and junk come back as a clean zero', () => {
    assert.equal(Object.is(roundToPlates(-0.2), 0), true)
    assert.equal(roundToPlates(0), 0)
    assert.equal(roundToPlates(Number.NaN), 0)
  })
})

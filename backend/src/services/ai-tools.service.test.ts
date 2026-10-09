/**
 * Tests for reading a search query as body regions and muscles.
 *
 * A miss sends "upper body" to the name search, which matches nothing, and the
 * model spends its rounds narrowing down one movement at a time instead of
 * drafting. A false positive hides a real movement: "chest press" must still
 * be searched by name.
 *
 * Loads Prisma at import time; no query is issued.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { muscleQueryTargets } from './ai-tools.service'

const MUSCLES = [
  'Abs', 'Back', 'Biceps', 'Calves', 'Chest', 'Forearms', 'Glutes', 'Hamstrings',
  'Lats', 'Lower Back', 'Obliques', 'Quadriceps', 'Shoulders', 'Traps', 'Triceps',
]

const targets = (query: string) => {
  const found = muscleQueryTargets(query, MUSCLES)
  return found && [...found].sort()
}

describe('muscleQueryTargets', () => {
  test('reads body regions as the muscles they cover', () => {
    assert.deepEqual(targets('upper body'),
      ['Back', 'Biceps', 'Chest', 'Lats', 'Shoulders', 'Traps', 'Triceps'])
    assert.deepEqual(targets('legs'), ['Calves', 'Glutes', 'Hamstrings', 'Quadriceps'])
    assert.deepEqual(targets('Push'), ['Chest', 'Shoulders', 'Triceps'])
  })

  test('reads muscle names, singular or plural, and ignores filler words', () => {
    assert.deepEqual(targets('chest'), ['Chest'])
    assert.deepEqual(targets('bicep'), ['Biceps'])
    assert.deepEqual(targets('chest and triceps exercises'), ['Chest', 'Triceps'])
    assert.deepEqual(targets('leg day'), ['Calves', 'Glutes', 'Hamstrings', 'Quadriceps'])
  })

  test('takes the longest phrase first', () => {
    assert.deepEqual(targets('lower back'), ['Lower Back'])
    assert.deepEqual(targets('forearms'), ['Forearms'])
  })

  test('leaves movement names to the name search', () => {
    assert.equal(targets('chest press'), null)
    assert.equal(targets('romanian deadlift'), null)
    assert.equal(targets('row'), null)
    assert.equal(targets(''), null)
  })
})

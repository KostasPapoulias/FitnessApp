/**
 * Server-side language: which one a request asked for, and whether the Greek
 * table still recognises the English it was written against.
 *
 * The second half is the one worth having. Translations are keyed by the exact
 * English a controller sends, so rewording a message quietly drops it back to
 * English — nothing fails, a Greek screen just grows an English sentence. These
 * tests generate the real messages from the real validators, so a reworded one
 * fails here instead.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { localeFromHeader, localizeMessage } from './locale'
import { validatePassword, validatePin } from '../services/credentials.service'
import { describeSleepReadiness, resolveSleepReadiness } from '../services/sleep-readiness.service'

const rejection = (result: { ok: boolean; error?: string }): string => {
  assert.equal(result.ok, false)
  return result.error!
}

describe('localeFromHeader', () => {
  test('reads the tag the app sends', () => {
    assert.equal(localeFromHeader('el'), 'el')
    assert.equal(localeFromHeader('en'), 'en')
  })

  test('reads a browser-shaped header by its first tag', () => {
    assert.equal(localeFromHeader('el-GR,el;q=0.9,en;q=0.8'), 'el')
    assert.equal(localeFromHeader('en-US,el;q=0.9'), 'en')
  })

  test('falls back to English for anything it does not speak', () => {
    assert.equal(localeFromHeader(undefined), 'en')
    assert.equal(localeFromHeader(''), 'en')
    assert.equal(localeFromHeader('fr-FR'), 'en')
  })
})

describe('localizeMessage', () => {
  test('English is returned untouched', () => {
    assert.equal(localizeMessage('Incorrect PIN.', 'en'), 'Incorrect PIN.')
  })

  test('an untranslated message still reaches the athlete, in English', () => {
    assert.equal(localizeMessage('Some message nobody translated', 'el'), 'Some message nobody translated')
  })

  test('interpolated messages keep their numbers', () => {
    assert.equal(
      localizeMessage('Too many attempts. Try again in 42s.', 'el'),
      'Πάρα πολλές προσπάθειες. Δοκίμασε ξανά σε 42 δευτ.'
    )
  })

  test('every password rejection the validator can produce has Greek', () => {
    const messages = [
      rejection(validatePassword('')),
      rejection(validatePassword('short')),
      rejection(validatePassword('x'.repeat(500))),
      rejection(validatePassword('qwertyuiop')),
      rejection(validatePassword('aaaaaaaaaaaa')),
    ]
    for (const message of messages) {
      assert.notEqual(localizeMessage(message, 'el'), message, `no Greek for: ${message}`)
    }
  })

  test('every PIN rejection the validator can produce has Greek', () => {
    const messages = [
      rejection(validatePin('12a4')),
      rejection(validatePin('12')),
      rejection(validatePin('1234')),
    ]
    for (const message of messages) {
      assert.notEqual(localizeMessage(message, 'el'), message, `no Greek for: ${message}`)
    }
  })
})

describe('describeSleepReadiness in Greek', () => {
  const now = new Date('2026-09-19T08:00:00Z')
  const night = (durationMin: number) =>
    resolveSleepReadiness({ sleepDate: new Date('2026-09-19T00:00:00Z'), durationMin, sleepScore: null }, now)

  test('uses a decimal comma', () => {
    assert.match(describeSleepReadiness(night(390), 'el'), /^6,5 ώρες ύπνου/)
  })

  test('says so when nothing was logged, rather than going quiet', () => {
    assert.match(describeSleepReadiness(resolveSleepReadiness(null, now), 'el'), /Δεν έχει καταγραφεί ύπνος/)
  })

  test('still defaults to English, which the AI prompt quotes', () => {
    assert.match(describeSleepReadiness(night(390)), /^6\.5h sleep/)
  })
})

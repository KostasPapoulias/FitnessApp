/**
 * Tests for the program-request detector that decides when the chat loop stops
 * asking the model to draft and starts requiring it.
 *
 * Both directions matter. A miss is the bug this was written for: the model
 * writes a program as prose, no card is drafted, and the athlete has no way to
 * keep it. A false positive is not free either — it forces a draft nobody asked
 * for and can spend every round of the message doing it.
 *
 * Loads Prisma at import time; no query is issued.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { wantsProgramCard } from './ai.service'

describe('wantsProgramCard', () => {
  test('catches a request for a program', () => {
    for (const message of [
      'suggest me a workout',
      'Suggest me a program',
      'i want an upper body workout',
      'can you give me a push pull split',
      'build me a routine for 4 days a week',
      'write me a plan for next week',
      'put together a plan please',
    ]) {
      assert.equal(wantsProgramCard(message), true, message)
    }
  })

  test('catches asking to keep the one it already wrote', () => {
    // The follow-ups that were previously not understood at all
    for (const message of [
      'send it to the plan',
      'send it to my plans',
      'save it',
      'add it to my plans',
      'make a card',
      'use the template',
    ]) {
      assert.equal(wantsProgramCard(message), true, message)
    }
  })

  test('works in Greek, since the coach answers in the language it is asked', () => {
    for (const message of [
      'φτιάξε μου ένα πρόγραμμα',
      'θέλω προπόνηση για πλάτη',
      'στείλ’ το στα πλάνα',
      'κάνε μια κάρτα',
      'αποθήκευσέ το',
    ]) {
      assert.equal(wantsProgramCard(message), true, message)
    }
  })

  test('leaves unrelated questions alone', () => {
    for (const message of [
      'how much protein should i eat?',
      'what is my readiness today?',
      'my left shoulder hurts when i press overhead',
      'how did my last week go?',
      'am i overtraining?',
      'what does RPE 8 mean?',
    ]) {
      assert.equal(wantsProgramCard(message), false, message)
    }
  })

  test('"plan" and "session" alone are not requests', () => {
    // The two words that made the first draft of this regex too eager
    assert.equal(wantsProgramCard('i plan to bulk this winter'), false)
    assert.equal(wantsProgramCard('how was this session compared to last?'), false)
  })
})

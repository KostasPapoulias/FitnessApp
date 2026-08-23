/**
 * Request shapes for the profile endpoints.
 *
 * Bodyweight is the field that makes this urgent. It is not a display value:
 * calisthenics load is scored against it, so a profile weight of 7 (a fat
 * finger on 70) rescores every push-up the athlete ever logs, and
 * `starting-load.service` offers weights derived from it. The old code wrote
 * whatever arrived, and `Number('')` is 0.
 */

import { z, bodyWeightKg, heightCm, notes, shortText } from '../lib/validate'

/**
 * Every field optional, because the Edit Profile modal posts only what it
 * shows. Spreading the whole body would let an omitted field null out a stored
 * value, which is why the controller assembles `data` field by field — the
 * schema has to preserve that, not undo it.
 */
export const updateProfileSchema = z.object({
  name: shortText.optional(),
  /** Kept in step with birthDate by the controller; see updateProfile. */
  age: z.number().int().min(5).max(120).optional(),
  weight: bodyWeightKg.optional(),
  height: heightCm.optional(),
  gender: z.string().trim().max(40).optional(),
  fitnessLevel: z.string().trim().max(40).optional(),
  goal: z.string().trim().max(80).optional(),
  /**
   * Accepted as a string and parsed by the controller, which also derives
   * `age` from it. Validated only for shape here: whether a date is *sensible*
   * (not next Tuesday, not 1850) is a rule about the person, and it belongs
   * next to the code that turns it into an age.
   */
  birthDate: z.string().trim().min(1).max(40).optional(),
  trainingDaysPerWeek: z.number().int().min(0).max(14).optional(),
  experienceYears: z.number().min(0).max(80).optional(),
})

/**
 * A night's sleep.
 *
 * Sleep shifts the readiness score, so these bounds are model inputs and not
 * chart hygiene. The controller checked duration and score by hand already;
 * this keeps those exact rules and adds the one it was missing — that
 * `sleepDate` is a string at all before `new Date()` is asked to parse it.
 */
export const logSleepSchema = z.object({
  sleepDate: z.string().trim().min(1).max(40).optional(),
  durationMin: z.number().int().min(1).max(1440),
  sleepScore: z.number().min(0).max(100).nullish(),
  notes: notes.nullish(),
})

/**
 * A day's intake.
 *
 * Previously unchecked in every respect: `new Date(undefined)` is an Invalid
 * Date, which Prisma rejects with a 500 that reads as a server fault rather
 * than as the bad request it is.
 */
export const logNutritionSchema = z.object({
  logDate: z.string().trim().min(1).max(40),
  /** Grams. 1000 g of protein a day is past any real intake. */
  proteinG: z.number().min(0).max(1000).nullish(),
  calories: z.number().int().min(0).max(20_000).nullish(),
  notes: notes.nullish(),
})

/**
 * Request shapes for the profile endpoints. Bodyweight is bounded because it
 * feeds calisthenics scoring and starting-load suggestions.
 */

import { z, bodyWeightKg, heightCm, notes, shortText } from '../lib/validate'

/** Partial update — every field optional; the controller writes only what is present. */
export const updateProfileSchema = z.object({
  name: shortText.optional(),
  /** Kept in step with birthDate by the controller. */
  age: z.number().int().min(5).max(120).optional(),
  weight: bodyWeightKg.optional(),
  height: heightCm.optional(),
  gender: z.string().trim().max(40).optional(),
  fitnessLevel: z.string().trim().max(40).optional(),
  goal: z.string().trim().max(80).optional(),
  /** Parsed and sanity-checked by the controller, which also derives `age`. */
  birthDate: z.string().trim().min(1).max(40).optional(),
  trainingDaysPerWeek: z.number().int().min(0).max(14).optional(),
  experienceYears: z.number().min(0).max(80).optional(),
})

/** A night's sleep. Feeds readiness, so the bounds are model inputs. */
export const logSleepSchema = z.object({
  sleepDate: z.string().trim().min(1).max(40).optional(),
  durationMin: z.number().int().min(1).max(1440),
  sleepScore: z.number().min(0).max(100).nullish(),
  notes: notes.nullish(),
})

/** A day's intake. */
export const logNutritionSchema = z.object({
  logDate: z.string().trim().min(1).max(40),
  /** Grams. */
  proteinG: z.number().min(0).max(1000).nullish(),
  calories: z.number().int().min(0).max(20_000).nullish(),
  notes: notes.nullish(),
})

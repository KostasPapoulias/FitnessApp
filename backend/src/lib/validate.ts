/**
 * Request validation with Zod. Failures answer 400 with `{ success, error,
 * details }`, where `details` names each offending field.
 */

import { Response } from 'express'
import { z } from 'zod'
import { log } from './logger'

/** One field's rejection, in a shape a form can consume. */
export interface FieldIssue {
  field: string
  message: string
}

const toIssues = (error: z.ZodError): FieldIssue[] =>
  error.issues.map(issue => ({
    // Empty path means the whole body was the wrong shape
    field: issue.path.length ? issue.path.join('.') : 'body',
    message: issue.message,
  }))

/**
 * Validate `req.body`. Returns the parsed value, or null after sending a 400 —
 * so call sites read `const body = parseBody(...); if (!body) return`.
 */
export const parseBody = <T extends z.ZodType>(
  schema: T,
  body: unknown,
  res: Response
): z.infer<T> | null => {
  const result = schema.safeParse(body)

  if (result.success) return result.data

  const details = toIssues(result.error)

  // Logged as a warning (not reported) — a burst of these reveals a payload-shape change
  log.warn('Request body rejected', { details })

  res.status(400).json({
    success: false,
    error: details[0]
      ? `${details[0].field}: ${details[0].message}`
      : 'Invalid request body',
    details,
  })
  return null
}

/** Same for query strings; schemas need `z.coerce` since values are strings. */
export const parseQuery = <T extends z.ZodType>(
  schema: T,
  query: unknown,
  res: Response
): z.infer<T> | null => {
  const result = schema.safeParse(query)

  if (result.success) return result.data

  const details = toIssues(result.error)
  res.status(400).json({
    success: false,
    error: details[0]
      ? `${details[0].field}: ${details[0].message}`
      : 'Invalid query parameters',
    details,
  })
  return null
}

// ── shared scalars ─────────────────────────────────────────────────────────
// Bounds are physical, not defensive: set where no human could have meant the
// value, so real outliers are still accepted.

/** Load in kg. Negative is meaningless; assisted work uses `addedWeight`. */
export const kg = z.number().min(0).max(1000)

export const addedKg = z.number().min(-500).max(500)

export const reps = z.number().int().min(0).max(1000)

/** A cardio count (skips, floors, jacks) — bounded far above `reps`. */
export const count = z.number().int().min(0).max(20_000)

/** 1–10. Never defaulted: an absent RPE is information. */
export const rpe = z.number().min(1).max(10)

/** Seconds, up to a day. */
export const seconds = z.number().min(0).max(86_400)

/** Kilometres, as stored in SetCardio/SetWOD. Also catches a client sending metres. */
export const distanceKm = z.number().min(0).max(1000)

export const rounds = z.number().int().min(0).max(1000)

/** Rest between sets, in seconds. */
export const restSeconds = z.number().int().min(0).max(3600)

/** A foreign key's shape only; ownership is checked by the controller. */
export const id = z.string().trim().min(1).max(64)

/** Free text the athlete typed. */
export const notes = z.string().max(2000)

export const shortText = z.string().trim().min(1).max(120)

/** Bodyweight in kg (low floor to allow children's profiles). */
export const bodyWeightKg = z.number().min(20).max(500)

export const heightCm = z.number().min(50).max(260)

export { z }

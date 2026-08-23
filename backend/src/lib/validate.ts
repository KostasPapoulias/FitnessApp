/**
 * Request validation.
 *
 * What this replaces is `req.body as SomeInterface` — a cast, which checks
 * nothing at all — followed by a hand-written test of one or two fields. The
 * fields nobody hand-checked went straight into Postgres.
 *
 * That matters more here than in most apps. A bad value is not a crash: a
 * weight of -50 or a rest of 36,000 seconds is accepted, becomes a WorkoutSet,
 * becomes fatigue, becomes training load, and every future suggestion is
 * computed from that history. By the time it is noticed the damage is in the
 * data, and fixing the code does not fix the data.
 *
 * Failures answer 400 with the app's usual `{ success, error }` shape plus a
 * `details` array, so a client can point at the offending field instead of
 * showing a generic failure.
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
    // `path` is empty when the whole body is the wrong shape (an array, a
    // string). Naming that 'body' is more useful to a reader than ''.
    field: issue.path.length ? issue.path.join('.') : 'body',
    message: issue.message,
  }))

/**
 * Validate `req.body` against `schema`.
 *
 * Returns the parsed value, or null after having already sent a 400 — so the
 * call site is `const body = parseBody(...); if (!body) return`. Returning null
 * rather than throwing keeps this usable inside the try/catch every controller
 * already has, without a validation failure being logged and reported as if it
 * were a server fault.
 */
export const parseBody = <T extends z.ZodType>(
  schema: T,
  body: unknown,
  res: Response
): z.infer<T> | null => {
  const result = schema.safeParse(body)

  if (result.success) return result.data

  const details = toIssues(result.error)

  // Logged, not reported. A 400 is the client being told no, which is normal
  // traffic — but a sudden burst of them on one endpoint is how you find out a
  // deploy changed a payload shape, and that is invisible without this line.
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

/**
 * Same, for query strings.
 *
 * Query values are always strings, so these schemas need `z.coerce`. Kept as a
 * separate function purely so that is impossible to forget.
 */
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
//
// Bounds are physical, not defensive: they are set where a human being could
// not have meant it. 1000 kg is past any lift ever performed, 1000 reps is past
// any set ever performed, and 24 hours is longer than any session. A bound
// tight enough to catch a typo would also reject a real outlier, and rejecting
// a real training entry is the worse failure — the athlete did the work.

/** Load in kg. Negative is meaningless; assisted work uses `addedWeight`. */
export const kg = z.number().min(0).max(1000)

/** Assistance is negative added weight, so this one goes below zero. */
export const addedKg = z.number().min(-500).max(500)

export const reps = z.number().int().min(0).max(1000)

/** 1–10. Not optional-with-a-default anywhere: an absent RPE is information. */
export const rpe = z.number().min(1).max(10)

/** Seconds. Capped at a day — anything longer is a forgotten stopwatch. */
export const seconds = z.number().min(0).max(86_400)

/** Metres. 500 km covers an ultra and stops at obvious nonsense. */
export const metres = z.number().min(0).max(500_000)

export const rounds = z.number().int().min(0).max(1000)

/** Rest between sets, in seconds. An hour is already generous. */
export const restSeconds = z.number().int().min(0).max(3600)

/** A cuid/uuid-ish foreign key. Only the shape is checked; ownership is not. */
export const id = z.string().trim().min(1).max(64)

/**
 * Free text the athlete typed.
 *
 * Bounded because an unbounded string is a way to fill a database. 2000 is
 * several paragraphs of session notes.
 */
export const notes = z.string().max(2000)

export const shortText = z.string().trim().min(1).max(120)

/**
 * Bodyweight in kg. The lower bound is deliberately low: this is also used for
 * a child's profile, and 20 kg is a real value where 0 never is.
 */
export const bodyWeightKg = z.number().min(20).max(500)

export const heightCm = z.number().min(50).max(260)

export { z }

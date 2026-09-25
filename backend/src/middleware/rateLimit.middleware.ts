import rateLimit from 'express-rate-limit'

/**
 * Request throttles, keyed by IP (requires `trust proxy` behind Railway).
 */

const json = (message: string) => ({ success: false, error: message })

/** Login and registration failures. Successful sign-ins are not counted. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many attempts. Try again in a few minutes.'),
})

/**
 * Account creation. Counts only successes; failures are covered by
 * authLimiter, which is mounted on the same route.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  skipFailedRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many accounts created from this address. Try again later.'),
})

/** PIN entry, per source, on top of the per-account lockout. */
export const pinLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many PIN attempts. Wait a few minutes.'),
})

/** Password reset requests. Every attempt counts, since each one sends an email. */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many reset requests. Try again later.'),
})

/** The full data export — the heaviest read in the API. */
export const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Export limit reached. Try again in a few minutes.'),
})

/** Backstop for every other request; well above normal use. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Slow down a moment.'),
})

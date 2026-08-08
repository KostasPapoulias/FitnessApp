import rateLimit from 'express-rate-limit'

/**
 * Request throttles.
 *
 * The API had none. `POST /auth/login` accepted unlimited attempts, which makes
 * offline-speed credential stuffing and password spraying across accounts free
 * — bcrypt raises the cost per guess but does nothing about the number of them.
 *
 * Limits are keyed by IP. Behind Railway's proxy that requires `trust proxy` to
 * be set, or every request appears to come from the same address and one noisy
 * client would lock out everybody.
 */

const json = (message: string) => ({ success: false, error: message })

/**
 * Login and registration.
 *
 * Deliberately tight, and counts only FAILURES — a legitimate person signing in
 * repeatedly on a shared network is not the threat, and locking them out over
 * successful logins would be a self-inflicted outage.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many attempts. Try again in a few minutes.'),
})

/**
 * Account creation, kept separate and slower.
 * Registration is the expensive one to abuse: each success is a permanent row.
 *
 * Counts only SUCCESSES, for that same reason — a rejected attempt creates
 * nothing. Counting failures meant someone fixing a too-short password five
 * times was told the address had created too many accounts, having created
 * none. The failure side is already covered: authLimiter is mounted on this
 * route too and counts exactly those.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  skipFailedRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many accounts created from this address. Try again later.'),
})

/**
 * PIN entry.
 *
 * Belt and braces alongside the per-account lockout: that counter lives on the
 * account being attacked, so this bounds attempts from one source regardless of
 * how many accounts they are spread across.
 */
export const pinLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many PIN attempts. Wait a few minutes.'),
})

/**
 * Everything else authenticated.
 *
 * Generous — this is a backstop against a runaway client or a scraper, not a
 * usage limit. A normal session nowhere near approaches it.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Slow down a moment.'),
})

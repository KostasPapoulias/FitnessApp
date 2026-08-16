/**
 * Required environment, validated once at boot.
 *
 * The pattern this replaces was `process.env.JWT_SECRET || 'secret'`, repeated
 * at four call sites. A missing or misspelled variable did not fail — it signed
 * every token with a guessable string while the app behaved completely
 * normally, so nothing would ever have surfaced it. Anyone could then mint a
 * token for any userId.
 *
 * Fail loudly at startup instead. A server that will not boot is a far smaller
 * problem than one running with forgeable authentication.
 */

const requireEnv = (name: string, minLength = 1): string => {
  const value = process.env[name]

  if (!value || value.trim().length === 0) {
    throw new Error(
      `${name} is not set. Refusing to start — see .env.example for what it needs.`
    )
  }

  if (value.length < minLength) {
    throw new Error(
      `${name} is too short (${value.length} chars, needs ${minLength}). ` +
      'A short signing secret is brute-forceable offline.'
    )
  }

  return value
}

// 32 chars is the floor for an HMAC secret worth having. Generate with:
//   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
export const JWT_SECRET = requireEnv('JWT_SECRET', 32)

/** How long an issued token stays valid. */
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

/**
 * Where the app is served from, used to build links that arrive by email.
 *
 * Read from configuration rather than from the request's Host header. A
 * password reset link built from an attacker-supplied Host is the classic host
 * header injection: the mail goes to the real user, and the link points at the
 * attacker's server, which then collects the token.
 */
export const APP_BASE_URL = (
  process.env.APP_BASE_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://somatrack.netlify.app'
    : 'http://localhost:5173')
).replace(/\/+$/, '')

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

/**
 * Required environment, validated once at boot. A missing or weak secret stops
 * the server instead of silently signing tokens with a guessable fallback.
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

// 32+ chars. Generate: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
export const JWT_SECRET = requireEnv('JWT_SECRET', 32)

/** How long an issued token stays valid. */
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

/**
 * Base URL for links sent by email. Taken from config, never from the Host
 * header, to prevent host-header injection in reset links.
 */
export const APP_BASE_URL = (
  process.env.APP_BASE_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://somatrack.netlify.app'
    : 'http://localhost:5173')
).replace(/\/+$/, '')

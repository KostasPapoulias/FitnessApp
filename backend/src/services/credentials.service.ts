/**
 * Credential rules for registration and sign-in.
 *
 * Before this, `"a"` was a valid password and `Kostas@x.com` and
 * `kostas@x.com` were two different accounts.
 *
 * The password rules follow current NIST guidance rather than the older
 * upper/lower/digit/symbol convention: length is what actually resists an
 * offline attack, and composition rules mostly push people toward
 * `Password1!` — predictable, and no stronger than a longer plain phrase.
 */

const MIN_PASSWORD_LENGTH = 10
const MAX_PASSWORD_LENGTH = 200

/**
 * Passwords that defeat any length rule by being the first things guessed.
 * Not a substitute for a breach-corpus check — just the obvious floor.
 */
const BANNED = new Set([
  'password', 'password1', 'password123', 'passw0rd',
  '1234567890', '12345678901', '0123456789',
  'qwertyuiop', 'letmein123', 'iloveyou1',
  'admin12345', 'welcome123', 'somatrack1',
])

export interface Rejection { ok: false; error: string }
export interface Accepted { ok: true }

export const validatePassword = (password: unknown): Rejection | Accepted => {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'Password is required.' }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  // bcrypt silently truncates past 72 bytes; a cap also stops a multi-megabyte
  // body being fed into a deliberately slow hash function
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: 'Password is too long.' }
  }
  if (BANNED.has(password.toLowerCase())) {
    return { ok: false, error: 'That password is too common. Pick something else.' }
  }
  // A single repeated character passes a length check but not a guess check
  if (new Set(password).size < 4) {
    return { ok: false, error: 'Password needs more variety in its characters.' }
  }
  return { ok: true }
}

// Deliberately permissive. Strict RFC 5322 matching rejects addresses that
// genuinely work; the real proof an address exists is sending mail to it.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/

/**
 * Trim and lowercase, so one address cannot become several accounts.
 *
 * Only the domain is case-insensitive per the RFC, but every mail provider in
 * practice treats the local part that way too, and users certainly do.
 */
export const normalizeEmail = (email: unknown): string | null => {
  if (typeof email !== 'string') return null
  const normalized = email.trim().toLowerCase()
  if (normalized.length === 0 || normalized.length > 254) return null
  return EMAIL_SHAPE.test(normalized) ? normalized : null
}

const MIN_PIN_LENGTH = 4
const MAX_PIN_LENGTH = 8

/** Sequences and repeats make up most of what people actually choose. */
const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '2345', '3456', '4567', '5678', '6789', '0123',
  '4321', '9876', '1212', '6969', '1004', '2000', '1122',
])

export const validatePin = (pin: unknown): Rejection | Accepted => {
  if (typeof pin !== 'string' || !/^\d+$/.test(pin)) {
    return { ok: false, error: 'PIN must be digits only.' }
  }
  if (pin.length < MIN_PIN_LENGTH || pin.length > MAX_PIN_LENGTH) {
    return { ok: false, error: `PIN must be ${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} digits.` }
  }
  if (WEAK_PINS.has(pin)) {
    return { ok: false, error: 'That PIN is too easy to guess. Pick another.' }
  }
  if (new Set(pin).size === 1) {
    return { ok: false, error: 'That PIN is too easy to guess. Pick another.' }
  }
  return { ok: true }
}

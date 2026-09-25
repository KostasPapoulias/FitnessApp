/**
 * Credential rules for registration, sign-in and the PIN. Passwords follow
 * NIST guidance: length over composition rules.
 */

const MIN_PASSWORD_LENGTH = 10
const MAX_PASSWORD_LENGTH = 200

/** The first passwords any attacker guesses. */
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
  // bcrypt truncates past 72 bytes, and a cap keeps huge bodies out of a slow hash
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: 'Password is too long.' }
  }
  if (BANNED.has(password.toLowerCase())) {
    return { ok: false, error: 'That password is too common. Pick something else.' }
  }
  if (new Set(password).size < 4) {
    return { ok: false, error: 'Password needs more variety in its characters.' }
  }
  return { ok: true }
}

// Deliberately permissive; the real check is sending mail to it
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/

/** Trim and lowercase so one address cannot become several accounts. */
export const normalizeEmail = (email: unknown): string | null => {
  if (typeof email !== 'string') return null
  const normalized = email.trim().toLowerCase()
  if (normalized.length === 0 || normalized.length > 254) return null
  return EMAIL_SHAPE.test(normalized) ? normalized : null
}

const MIN_PIN_LENGTH = 4
const MAX_PIN_LENGTH = 8

/** Common sequences and repeats. */
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

/**
 * Spoken phrase → workout command. Pure and engine-agnostic.
 *
 * Rules: numbers alone only set values — logging a set needs an explicit verb
 * ("log", "set done"); ending a workout needs both words.
 */

export type VoiceCommand =
  /** Overwrite the plan's values AND log the set. */
  | { kind: 'logSet'; reps?: number; weight?: number; rpe?: number }
  /** Overwrite the plan's values, log nothing. */
  | { kind: 'setValues'; reps?: number; weight?: number; rpe?: number }
  /** Next set, or next exercise if this was the last one. */
  | { kind: 'advance' }
  | { kind: 'skipRest' }
  | { kind: 'pauseRest' }
  | { kind: 'resumeRest' }
  | { kind: 'endWorkout' }
  /** Mark what this modality counts: a lap on a run, a round in a metcon. */
  | { kind: 'mark' }

// ── number words ────────────────────────────────────────────────────────────
// No homophone correction ("to" → two) — it would break "set reps to eight".

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
}

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}

const DIGITS = /^\d+(?:\.\d+)?$/

/**
 * Read one number from `start`, in digits or words ("62.5", "sixty two point
 * five", "a hundred and ten", "sixty and a half"). Returns the index after it.
 */
export const readNumber = (
  tokens: string[],
  start: number
): { value: number; next: number } | null => {
  let i = start
  let value = 0
  let matched = false

  if (DIGITS.test(tokens[i] ?? '')) {
    value = parseFloat(tokens[i])
    i++
    matched = true
  } else {
    // Hundreds
    if (tokens[i] === 'a' && tokens[i + 1] === 'hundred') {
      value = 100
      i += 2
      matched = true
    } else if (UNITS[tokens[i]] !== undefined && tokens[i + 1] === 'hundred') {
      value = UNITS[tokens[i]] * 100
      i += 2
      matched = true
    }
    // "a hundred AND ten": the filler is only valid after hundreds
    if (matched && tokens[i] === 'and' && (TENS[tokens[i + 1]] !== undefined || UNITS[tokens[i + 1]] !== undefined)) {
      i++
    }
    // Tens, optionally followed by a unit ("sixty two")
    if (TENS[tokens[i]] !== undefined) {
      value += TENS[tokens[i]]
      i++
      matched = true
      if (UNITS[tokens[i]] !== undefined && UNITS[tokens[i]] < 10) {
        value += UNITS[tokens[i]]
        i++
      }
    } else if (UNITS[tokens[i]] !== undefined) {
      value += UNITS[tokens[i]]
      i++
      matched = true
    }
  }

  if (!matched) return null

  // "point five" / "point seven five": digits spoken one at a time
  if (tokens[i] === 'point') {
    let decimals = ''
    let j = i + 1
    while (j < tokens.length) {
      const d = DIGITS.test(tokens[j]) ? tokens[j] : String(UNITS[tokens[j]] ?? '')
      if (d === '' || Number(d) > 9) break
      decimals += d
      j++
    }
    if (decimals !== '') {
      value = Number(`${value}.${decimals}`)
      i = j
    }
  } else if (tokens[i] === 'and' && tokens[i + 1] === 'a' && tokens[i + 2] === 'half') {
    value += 0.5
    i += 3
  } else if (tokens[i] === 'and' && tokens[i + 1] === 'a' && tokens[i + 2] === 'quarter') {
    value += 0.25
    i += 3
  }

  return { value, next: i }
}

// ── vocabulary ──────────────────────────────────────────────────────────────

const REP_WORDS = new Set(['rep', 'reps', 'repetition', 'repetitions'])
const WEIGHT_WORDS = new Set(['kilo', 'kilos', 'kilogram', 'kilograms', 'kg', 'kgs', 'kilogrammes'])
const JOINERS = new Set(['at', 'by', 'for', 'times', 'x'])

/** Phrases that log the current set as it stands on screen. */
const LOG_PHRASES = [
  'set done', 'set complete', 'set completed', 'set finished', 'set is done',
  'done set', 'log it', 'log that', 'log this', 'log the set', 'log set',
  'logged', 'finished', 'complete',
]

const ADVANCE_PHRASES = [
  'next exercise', 'next set', 'next movement', 'move on', 'next',
]

const SKIP_PHRASES = [
  'skip rest', 'skip the rest', 'skip break', 'skip', 'ready', "i'm ready", 'im ready',
]

// Checked before the log phrases ("complete round" contains "complete").
const MARK_PHRASES = [
  'lap', 'mark lap', 'new lap', 'split',
  'round done', 'round complete', 'complete round', 'that round', 'round',
]

const END_PHRASES = [
  'end workout', 'end the workout', 'finish workout', 'finish the workout',
  'stop workout', 'stop the workout', 'end session', 'finish session',
]

/** Filler a value phrase may contain; anything else means the athlete was talking to a person. */
const LEAD_INS = new Set([
  'log', 'set', 'make', 'change', 'it', 'to', 'that', 'now', 'the', 'my',
  'rpe', 'weight', 'point', 'and', 'a', 'half', 'quarter', 'hundred',
])

/**
 * Whether an utterance is only numbers, units and filler — so "I did eight
 * reps yesterday" is never read as a command.
 */
const isValuePhrase = (tokens: string[]): boolean =>
  tokens.every(t =>
    DIGITS.test(t) ||
    UNITS[t] !== undefined ||
    TENS[t] !== undefined ||
    REP_WORDS.has(t) ||
    WEIGHT_WORDS.has(t) ||
    JOINERS.has(t) ||
    LEAD_INS.has(t)
  )

/** Bounds that reject misrecognition. */
const LIMITS = {
  reps: { min: 1, max: 100 },
  weight: { min: 0, max: 500 },
  rpe: { min: 1, max: 10 },
} as const

const inRange = (v: number | undefined, k: keyof typeof LIMITS) =>
  v !== undefined && v >= LIMITS[k].min && v <= LIMITS[k].max ? v : undefined

export const normalize = (raw: string): string =>
  raw.toLowerCase()
    // Keep the decimal point in "62.5"; drop punctuation
    .replace(/[^\w\s.']/g, ' ')
    .replace(/(\D)\.|\.(\D)|\.$/g, (_m, a = '', b = '') => `${a} ${b}`)
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Pull reps / weight / rpe from a phrase. Unit words anchor the numbers; with
 * none, "eight at sixty" reads as reps then weight.
 */
const extractValues = (tokens: string[]): { reps?: number; weight?: number; rpe?: number } => {
  // A sentence that merely contains a number is not a command
  if (!isValuePhrase(tokens)) return {}

  let reps: number | undefined
  let weight: number | undefined
  let rpe: number | undefined

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]

    if (t === 'rpe') {
      rpe = readNumber(tokens, i + 1)?.value ?? rpe
      continue
    }
    if (REP_WORDS.has(t)) {
      // "eight reps" reads back; "reps eight" reads forward
      reps = readNumberEndingAt(tokens, i)?.value ?? readNumber(tokens, i + 1)?.value ?? reps
      continue
    }
    if (WEIGHT_WORDS.has(t)) {
      weight = readNumberEndingAt(tokens, i)?.value ?? readNumber(tokens, i + 1)?.value ?? weight
      continue
    }
    if (t === 'weight') {
      // "weight sixty" / "weight to sixty"
      const skip = tokens[i + 1] === 'to' ? i + 2 : i + 1
      weight = readNumber(tokens, skip)?.value ?? weight
    }
  }

  // "log eight at sixty" — no unit words
  if (reps === undefined && weight === undefined && rpe === undefined) {
    const first = firstNumber(tokens)
    if (first && JOINERS.has(tokens[first.next] ?? '')) {
      const second = readNumber(tokens, first.next + 1)
      if (second) {
        reps = first.value
        weight = second.value
      }
    } else if (first) {
      reps = first.value
    }
  }

  return {
    reps: inRange(reps, 'reps'),
    weight: inRange(weight, 'weight'),
    rpe: inRange(rpe, 'rpe'),
  }
}

/** The number immediately preceding `end`, scanned backwards from it. */
const readNumberEndingAt = (tokens: string[], end: number) => {
  for (let start = Math.max(0, end - 4); start < end; start++) {
    const n = readNumber(tokens, start)
    if (n && n.next === end) return n
  }
  return null
}

const firstNumber = (tokens: string[]) => {
  for (let i = 0; i < tokens.length; i++) {
    const n = readNumber(tokens, i)
    if (n) return n
  }
  return null
}

const hasPhrase = (text: string, phrases: string[]) =>
  phrases.some(p => text === p || text.includes(` ${p} `) ||
    text.startsWith(`${p} `) || text.endsWith(` ${p}`))

/** Words that suggest someone was talking to the app, used to recognise a missed command. */
const COMMAND_ISH = new Set([
  'set', 'sets', 'log', 'logged', 'done', 'finish', 'finished', 'complete',
  'next', 'skip', 'rest', 'pause', 'resume', 'end', 'stop', 'rpe', 'weight',
  ...REP_WORDS, ...WEIGHT_WORDS,
])

/** Whether an unparsed phrase looks like an attempted command, so the UI can suggest one. */
export const looksLikeCommand = (raw: string): boolean => {
  const text = normalize(raw)
  if (!text) return false
  const tokens = text.split(' ')
  // Longer than four tokens is conversation, not a command
  if (tokens.length > 4) return false
  return tokens.some(t => COMMAND_ISH.has(t))
}

/**
 * Parse a transcript into a command, or null. Destructive and navigation
 * commands are matched before anything that reads numbers.
 */
export const parseVoiceCommand = (raw: string): VoiceCommand | null => {
  const text = normalize(raw)
  if (!text) return null
  const tokens = text.split(' ')

  if (hasPhrase(text, END_PHRASES)) return { kind: 'endWorkout' }
  if (hasPhrase(text, ['pause', 'hold on', 'wait'])) return { kind: 'pauseRest' }
  if (hasPhrase(text, ['resume', 'continue', 'unpause'])) return { kind: 'resumeRest' }
  if (hasPhrase(text, MARK_PHRASES)) return { kind: 'mark' }
  if (hasPhrase(text, SKIP_PHRASES)) return { kind: 'skipRest' }
  if (hasPhrase(text, ADVANCE_PHRASES)) return { kind: 'advance' }

  const values = extractValues(tokens)
  const hasValues = values.reps !== undefined || values.weight !== undefined || values.rpe !== undefined

  // An explicit log verb turns values into a logged set
  if (hasPhrase(text, LOG_PHRASES)) return { kind: 'logSet', ...values }
  if (hasValues && tokens[0] === 'log') return { kind: 'logSet', ...values }
  if (hasValues) return { kind: 'setValues', ...values }

  return null
}

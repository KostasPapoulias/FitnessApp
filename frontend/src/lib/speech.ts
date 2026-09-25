import { TextToSpeech } from '@capacitor-community/text-to-speech'

/**
 * Spoken cues. On top of the TTS plugin it adds a queue (web `speak()` cancels
 * whatever is speaking) and interruption by rank: `announce` queues, `alert`
 * clears the queue.
 */

let chain: Promise<void> = Promise.resolve()
let enabled = true

/** Mirrors the Audio Cues toggle. */
export const setSpeechEnabled = (on: boolean) => {
  enabled = on
  if (!on) void stopSpeaking()
}

export const stopSpeaking = async () => {
  chain = Promise.resolve()
  try {
    await TextToSpeech.stop()
  } catch {
    // Nothing speaking, or no engine
  }
}

const say = async (text: string) => {
  if (!enabled || !text.trim()) return
  try {
    await TextToSpeech.speak({
      text,
      lang: 'en-GB',
      // Slightly fast, so countdowns land on time
      rate: 1.1,
      pitch: 1.0,
      volume: 1.0,
      // Ducks music rather than pausing it, and plays on silent
      category: 'ambient',
    })
  } catch {
    // A cue must never break the set that triggered it
  }
}

/** Queue a cue behind anything already speaking; one failure can't break the chain. */
export const announce = (text: string): Promise<void> => {
  chain = chain.then(() => say(text)).catch(() => {})
  return chain
}

/** Cut off whatever is speaking and say this instead. */
export const alert = async (text: string): Promise<void> => {
  await stopSpeaking()
  return announce(text)
}

// ── phrasing ────────────────────────────────────────────────────────────────
// All cue wording, in one place.

export const cues = {
  // A negative load is assistance and is spoken as such
  setLogged: (setNumber: number, reps: number, weight: number) =>
    weight > 0
      ? `Set ${setNumber} logged. ${reps} reps at ${formatWeight(weight)} kilos.`
      : weight < 0
      ? `Set ${setNumber} logged. ${reps} reps with ${formatWeight(-weight)} kilos assistance.`
      : `Set ${setNumber} logged. ${reps} reps.`,

  restStarting: (seconds: number) =>
    `Rest ${seconds >= 60 ? `${Math.round(seconds / 60)} minute${seconds >= 120 ? 's' : ''}` : `${seconds} seconds`}.`,

  restComplete: (next: string) => `Rest over. ${next}`,

  nextSet: (setNumber: number, reps: number, weight: number) =>
    weight > 0
      ? `Set ${setNumber}. ${reps} reps at ${formatWeight(weight)} kilos.`
      : weight < 0
      ? `Set ${setNumber}. ${reps} reps with ${formatWeight(-weight)} kilos assistance.`
      : `Set ${setNumber}. ${reps} reps.`,

  nextExercise: (name: string, sets: number) =>
    `Next exercise. ${name}. ${sets} set${sets === 1 ? '' : 's'}.`,

  finalSet: () => 'Last set. Finish strong.',

  workoutComplete: (sets: number, minutes: number) =>
    `Workout complete. ${sets} set${sets === 1 ? '' : 's'} in ${minutes} minute${minutes === 1 ? '' : 's'}.`,

  heard: (what: string) => what,

  // ── mobility ──────────────────────────────────────────────────────────────

  holdStart: (name: string, seconds: number, side?: 'left' | 'right') =>
    side
      ? `${name}. ${side} side. ${seconds} seconds.`
      : `${name}. ${seconds} seconds.`,

  switchSide: (to: 'left' | 'right') => `Switch. ${to} side.`,

  poseComplete: (next: string | null) =>
    next ? `Hold complete. Next, ${next}.` : 'Hold complete. Last pose done.',

  // ── WOD ───────────────────────────────────────────────────────────────────

  roundComplete: (round: number) => `Round ${round} complete.`,

  // Seconds left in the cap
  capWarning: (seconds: number) => `${seconds} seconds left.`,

  capReached: (rounds: number) =>
    `Time. ${formatRounds(rounds)} round${rounds === 1 ? '' : 's'}.`,

  metconLogged: (rounds: number, minutes: number) =>
    `Metcon logged. ${formatRounds(rounds)} round${rounds === 1 ? '' : 's'} in ${minutes} minute${minutes === 1 ? '' : 's'}.`,

  // ── cardio ────────────────────────────────────────────────────────────────

  runStarted: (activity: string) => `${activity} started.`,

  // Distance first, then pace
  kmSplit: (km: number, paceSeconds: number) =>
    `${km} kilometre${km === 1 ? '' : 's'}. ${formatPace(paceSeconds)}`.trim(),

  lapMarked: (lap: number) => `Lap ${lap}.`,

  // ── pace coach ────────────────────────────────────────────────────────────
  // Each cue names the target, and says the action ("pick it up"), not the state.

  paceTarget: (step: number, unit: 'km' | 'min', paceSeconds: number) =>
    step > 1
      ? `${unit === 'km' ? 'Kilometre' : 'Minute'} ${step}. Target ${formatPace(paceSeconds)}`.trim()
      : `Target ${formatPace(paceSeconds)}`.trim(),

  // ── the dial coach ────────────────────────────────────────────────────────
  // On a machine the cue names the setting to change and the direction.

  paceSet: (step: number, unit: 'km' | 'min', paceSeconds: number) =>
    step > 1
      ? `${unit === 'km' ? 'Kilometre' : 'Minute'} ${step}. Set ${formatPace(paceSeconds)}`.trim()
      : `Set ${formatPace(paceSeconds)}`.trim(),

  /** In pace, as shown in the app, not the machine's speed. */
  paceDialFaster: (paceSeconds: number) => `Speed up to ${formatPace(paceSeconds)}`.trim(),

  paceDialEasier: (paceSeconds: number) => `Ease back to ${formatPace(paceSeconds)}`.trim(),

  /** Confirms the dial change landed. */
  paceHolding: (paceSeconds: number) => `Holding ${formatPace(paceSeconds)}`.trim(),

  paceFaster: (paceSeconds: number) => `Pick it up. Target ${formatPace(paceSeconds)}`.trim(),

  paceEasier: (paceSeconds: number) => `Ease off. Target ${formatPace(paceSeconds)}`.trim(),

  /** Said once the pace is back on target. */
  paceGood: () => 'Good pace.',

  /** For movements with no distance (avoids "zero kilometres"). */
  countLogged: (count: number, unit: string, minutes: number) =>
    count > 0
      ? `Logged. ${count} ${unit} in ${minutes} minute${minutes === 1 ? '' : 's'}.`
      : `Logged. ${minutes} minute${minutes === 1 ? '' : 's'}.`,

  runLogged: (km: number, minutes: number) =>
    `Run logged. ${formatWeight(km)} kilometre${km === 1 ? '' : 's'} in ${minutes} minute${minutes === 1 ? '' : 's'}.`,

  /** Words, not digits. */
  count: (n: number) => (['zero', 'one', 'two', 'three'][n] ?? String(n)),
}

/** Pace as a runner says it — "five oh eight", never "five colon eight". */
const formatPace = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  const spokenSeconds = s === 0 ? 'flat' : s < 10 ? `oh ${s}` : String(s)
  return `${m} ${spokenSeconds} per kilometre.`
}

/** Rounds to a whole number when spoken. */
const formatRounds = (rounds: number) =>
  Number.isInteger(rounds) ? String(rounds) : String(Math.round(rounds * 10) / 10)

/** 60.0 reads as "60"; 62.5 as "62.5". */
const formatWeight = (kg: number) =>
  Number.isInteger(kg) ? String(kg) : String(Math.round(kg * 10) / 10)

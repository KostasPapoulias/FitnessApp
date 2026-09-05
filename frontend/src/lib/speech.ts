import { TextToSpeech } from '@capacitor-community/text-to-speech'

/**
 * Spoken cues (requirement 6.2).
 *
 * The plugin ships a real web implementation over `speechSynthesis`, so native
 * and browser share one call. What this file adds is the two things a gym needs
 * and the raw plugin doesn't do:
 *
 *  - **Serialisation.** `speak()` on web cancels whatever is already speaking.
 *    Logging the last set of an exercise fires "set logged" and "next up, bench
 *    press" in the same tick, and without a queue the second silences the first.
 *
 *  - **Interruptibility by rank.** A rest-countdown cue is worth interrupting;
 *    "rest over" is not. `announce` takes the queue, `alert` clears it.
 */

let chain: Promise<void> = Promise.resolve()
let enabled = true

/** Mirrors the Audio Cues toggle. Set once at session start, read on every cue. */
export const setSpeechEnabled = (on: boolean) => {
  enabled = on
  if (!on) void stopSpeaking()
}

export const stopSpeaking = async () => {
  chain = Promise.resolve()
  try {
    await TextToSpeech.stop()
  } catch {
    // Nothing was speaking, or the platform has no engine. Either is fine.
  }
}

const say = async (text: string) => {
  if (!enabled || !text.trim()) return
  try {
    await TextToSpeech.speak({
      text,
      lang: 'en-GB',
      // Slightly quick: these are short cues heard mid-effort, and the default
      // rate makes "three, two, one" land after the timer has already hit zero.
      rate: 1.1,
      pitch: 1.0,
      volume: 1.0,
      // Lets the cue duck music rather than pausing it, and keeps it audible
      // when the phone is on silent — both of which matter in a gym.
      category: 'ambient',
    })
  } catch {
    // An unsupported platform or a denied audio session must never break the
    // set that triggered the cue.
  }
}

/**
 * Queue a cue behind anything already speaking.
 *
 * Errors are swallowed into the chain so one failed utterance can't poison
 * every cue that follows it.
 */
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
// Kept here rather than at the call sites so the app has one voice, and so the
// wording can be read in one place without opening four screens.

export const cues = {
  // A negative load is calisthenics assistance, not a missing weight. Reading
  // it as bare reps — which is what the `> 0` test alone did — makes an
  // assisted set and a strict one sound identical.
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
  // A hold is the one part of a session where the athlete is deliberately still
  // and looking at nothing, so these carry the whole screen.

  holdStart: (name: string, seconds: number, side?: 'left' | 'right') =>
    side
      ? `${name}. ${side} side. ${seconds} seconds.`
      : `${name}. ${seconds} seconds.`,

  switchSide: (to: 'left' | 'right') => `Switch. ${to} side.`,

  poseComplete: (next: string | null) =>
    next ? `Hold complete. Next, ${next}.` : 'Hold complete. Last pose done.',

  // ── WOD ───────────────────────────────────────────────────────────────────

  roundComplete: (round: number) => `Round ${round} complete.`,

  // Spoken at a round number rather than a rep count: mid-metcon nobody is
  // counting along with the phone, they just want to know where they are.
  capWarning: (seconds: number) => `${seconds} seconds left.`,

  capReached: (rounds: number) =>
    `Time. ${formatRounds(rounds)} round${rounds === 1 ? '' : 's'}.`,

  metconLogged: (rounds: number, minutes: number) =>
    `Metcon logged. ${formatRounds(rounds)} round${rounds === 1 ? '' : 's'} in ${minutes} minute${minutes === 1 ? '' : 's'}.`,

  // ── cardio ────────────────────────────────────────────────────────────────

  runStarted: (activity: string) => `${activity} started.`,

  // Distance first, then pace: the number that changes is the one worth
  // leading with, and pace read first makes every split sound the same.
  kmSplit: (km: number, paceSeconds: number) =>
    `${km} kilometre${km === 1 ? '' : 's'}. ${formatPace(paceSeconds)}`.trim(),

  lapMarked: (lap: number) => `Lap ${lap}.`,

  runLogged: (km: number, minutes: number) =>
    `Run logged. ${formatWeight(km)} kilometre${km === 1 ? '' : 's'} in ${minutes} minute${minutes === 1 ? '' : 's'}.`,

  /** "three", "two", "one" — spoken, because digits read as a phone number. */
  count: (n: number) => (['zero', 'one', 'two', 'three'][n] ?? String(n)),
}

/**
 * Pace, spoken the way a runner says it.
 *
 * "05:12" handed to a speech engine comes out as "five colon twelve" or "five
 * hundred and twelve" depending on the voice — never as a pace. Seconds are
 * always two digits out loud ("five oh eight", not "five eight") because a
 * dropped zero changes the number being reported by nearly a minute.
 */
const formatPace = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  const spokenSeconds = s === 0 ? 'flat' : s < 10 ? `oh ${s}` : String(s)
  return `${m} ${spokenSeconds} per kilometre.`
}

/** Partial rounds are real work but "four point three three rounds" is noise. */
const formatRounds = (rounds: number) =>
  Number.isInteger(rounds) ? String(rounds) : String(Math.round(rounds * 10) / 10)

/** 62.5 reads as "62.5"; 60.0 must read as "60", not "60 point 0". */
const formatWeight = (kg: number) =>
  Number.isInteger(kg) ? String(kg) : String(Math.round(kg * 10) / 10)

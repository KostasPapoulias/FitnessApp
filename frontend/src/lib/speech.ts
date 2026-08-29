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
  setLogged: (setNumber: number, reps: number, weight: number) =>
    weight > 0
      ? `Set ${setNumber} logged. ${reps} reps at ${formatWeight(weight)} kilos.`
      : `Set ${setNumber} logged. ${reps} reps.`,

  restStarting: (seconds: number) =>
    `Rest ${seconds >= 60 ? `${Math.round(seconds / 60)} minute${seconds >= 120 ? 's' : ''}` : `${seconds} seconds`}.`,

  restComplete: (next: string) => `Rest over. ${next}`,

  nextSet: (setNumber: number, reps: number, weight: number) =>
    weight > 0
      ? `Set ${setNumber}. ${reps} reps at ${formatWeight(weight)} kilos.`
      : `Set ${setNumber}. ${reps} reps.`,

  nextExercise: (name: string, sets: number) =>
    `Next exercise. ${name}. ${sets} set${sets === 1 ? '' : 's'}.`,

  finalSet: () => 'Last set. Finish strong.',

  workoutComplete: (sets: number, minutes: number) =>
    `Workout complete. ${sets} set${sets === 1 ? '' : 's'} in ${minutes} minute${minutes === 1 ? '' : 's'}.`,

  heard: (what: string) => what,
}

/** 62.5 reads as "62.5"; 60.0 must read as "60", not "60 point 0". */
const formatWeight = (kg: number) =>
  Number.isInteger(kg) ? String(kg) : String(Math.round(kg * 10) / 10)

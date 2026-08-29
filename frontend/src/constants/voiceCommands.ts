import type { VoiceCommand } from '../lib/voiceGrammar'

/**
 * Every voice command, written the way it is said.
 *
 * One catalogue feeds three places — the reference sheet, the rotating hint on
 * the live strip, and the suggestion shown after a missed phrase — so the app
 * can never advertise a phrase in one place and a different one elsewhere.
 *
 * `expects` is what `parseVoiceCommand` must return for `example`. It exists so
 * documentation drift is a *test failure* rather than a support question: an
 * example that stops parsing is caught instead of quietly teaching a phrase the
 * grammar no longer understands.
 */

export interface VoiceCommandDoc {
  /** Said out loud. Shown in quotes verbatim. */
  example: string
  /** What happens, in the athlete's terms. */
  effect: string
  /** What the parser must produce for `example`. */
  expects: VoiceCommand['kind']
  /** Shown in the rotating hint on the live strip. */
  rotate?: boolean
}

export interface VoiceCommandGroup {
  title: string
  /** The rule that makes the whole group make sense. */
  note?: string
  commands: VoiceCommandDoc[]
}

export const VOICE_COMMAND_GROUPS: VoiceCommandGroup[] = [
  {
    title: 'Log the set',
    note: 'The only phrases that save anything.',
    commands: [
      { example: 'set done', effect: 'Logs the set as shown, then starts rest', expects: 'logSet', rotate: true },
      { example: 'log it', effect: 'Same thing, fewer syllables', expects: 'logSet' },
      { example: 'log eight at sixty', effect: 'Sets 8 reps at 60 kg and logs in one go', expects: 'logSet', rotate: true },
    ],
  },
  {
    title: 'Change the numbers',
    note: 'These only move what is on screen. Nothing is saved until you log.',
    commands: [
      { example: 'eight reps', effect: 'Sets reps to 8', expects: 'setValues', rotate: true },
      { example: 'sixty kilos', effect: 'Sets the weight to 60', expects: 'setValues', rotate: true },
      { example: 'sixty two point five kilos', effect: 'Half plates work too', expects: 'setValues', rotate: true },
      { example: 'RPE nine', effect: 'Sets how hard it felt', expects: 'setValues', rotate: true },
      { example: 'eight reps at sixty kilos', effect: 'Both at once, without logging', expects: 'setValues' },
    ],
  },
  {
    title: 'Move around',
    commands: [
      { example: 'next exercise', effect: 'Moves on without logging', expects: 'advance', rotate: true },
      { example: 'skip rest', effect: 'Ends rest early', expects: 'skipRest', rotate: true },
      { example: 'pause', effect: 'Holds the rest timer', expects: 'pauseRest' },
      { example: 'resume', effect: 'Starts it again', expects: 'resumeRest' },
    ],
  },
  {
    title: 'Finish',
    note: 'Say it twice — once to ask, once to confirm.',
    commands: [
      { example: 'end workout', effect: 'Ends the session and saves it', expects: 'endWorkout' },
    ],
  },
]

/** Flat list for the rotating hint, in the order it should cycle. */
export const ROTATING_EXAMPLES: string[] = VOICE_COMMAND_GROUPS
  .flatMap(g => g.commands)
  .filter(c => c.rotate)
  .map(c => c.example)

/** Every documented example, for the drift check. */
export const ALL_EXAMPLES: VoiceCommandDoc[] =
  VOICE_COMMAND_GROUPS.flatMap(g => g.commands)

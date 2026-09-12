import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PacePlan, PaceUnit, clampTarget } from '../lib/paceCoach'
import { isVoiceSupported } from '../lib/voiceRecognition'
import { setSpeechEnabled } from '../lib/speech'

/**
 * The three Smart Features switches on Start Workout.
 *
 * Device-local rather than synced to the account, and deliberately so: these
 * describe what *this phone* should do with its microphone, speaker and taptic
 * engine. Syncing them would mean turning voice on at the gym also turns it on
 * for the tablet in the kitchen, which is not what anyone means by the switch.
 *
 * They were `useState` in StartWorkout until now, which is why nothing else in
 * the app could read them — the screen that owns the toggles is unmounted by
 * the time the workout the toggles govern actually starts.
 */

interface SessionPrefsStore {
  /** Hands-free commands during a live session. */
  voice: boolean
  /**
   * Spoken pace coaching on a run.
   *
   * Kept apart from `audio` even though it speaks through the same channel: one
   * is "tell me what is happening", the other is "tell me what to do about it",
   * and plenty of people want the first without the second. It does need audio
   * on to be heard at all, which the Smart Features row says out loud.
   */
  paceCoach: boolean
  /**
   * The remembered plan, so the next run opens on the last one rather than on
   * a guess. Three numbers, which is the whole plan — see PacePlan.
   *
   * `paceUnit` survives changing the paces and vice versa: how the athlete
   * thinks about a session (by distance or by clock) is a separate, stickier
   * preference from what pace they want today.
   */
  paceUnit: PaceUnit
  paceStartSec: number
  paceDeltaSec: number
  /** Vibrate when a rest period ends. */
  haptic: boolean
  /** Spoken cues for the next exercise and the end of rest. */
  audio: boolean

  /** null until probed. False hides the voice toggle rather than offering a
   *  switch this device cannot honour. */
  voiceSupported: boolean | null

  setVoice: (on: boolean) => void
  setPaceCoach: (on: boolean) => void
  /** One call, because mode and numbers are one decision — see PaceSheet. */
  setPacePlan: (plan: PacePlan) => void
  setHaptic: (on: boolean) => void
  setAudio: (on: boolean) => void
  probeVoiceSupport: () => Promise<void>
}

export const useSessionPrefsStore = create<SessionPrefsStore>()(
  persist(
    (set) => ({
      // Haptics and voice default on: both are what the Smart Features card has
      // always claimed. Audio cues default off — a phone that starts talking
      // out loud in a public gym should be something you asked for.
      voice: true,
      haptic: true,
      audio: false,
      // Off until asked for. When it is switched on it starts in 'auto', so
      // turning it on is the only decision required — a coach that demands a
      // number before it will do anything is a coach nobody switches on.
      paceCoach: false,
      paceUnit: 'km',
      paceStartSec: 330,
      paceDeltaSec: 0,
      voiceSupported: null,

      setVoice: (on) => set({ voice: on }),
      setPaceCoach: (on) => set({ paceCoach: on }),
      // Clamped here as well as in the sheet: this is the boundary the rest of
      // the app reads from, and a plan restored from an older build's storage
      // has never been through the sheet at all.
      setPacePlan: (plan) =>
        set({
          paceUnit: plan.unit,
          paceStartSec: clampTarget(plan.startSec),
          // Bounded because it compounds: 60s a kilometre is a plan that has
          // left the range of real paces by kilometre four, and past that the
          // clamp is doing all the work and the number is a lie.
          paceDeltaSec: Math.max(-60, Math.min(60, Math.round(plan.deltaSec))),
        }),
      setHaptic: (on) => set({ haptic: on }),
      setAudio: (on) => {
        setSpeechEnabled(on)
        set({ audio: on })
      },

      probeVoiceSupport: async () => {
        const supported = await isVoiceSupported()
        set({ voiceSupported: supported })
      },
    }),
    {
      name: 'somatrack_session_prefs',
      // voiceSupported is a property of the device, not a preference — probing
      // it on each launch is cheap and survives the user changing browsers,
      // reinstalling, or revoking the microphone in system settings.
      partialize: (s) => ({
        voice: s.voice, haptic: s.haptic, audio: s.audio,
        paceCoach: s.paceCoach,
        paceUnit: s.paceUnit,
        paceStartSec: s.paceStartSec,
        paceDeltaSec: s.paceDeltaSec,
      }),
      onRehydrateStorage: () => (state) => {
        // The speech module keeps its own enabled flag so cue call sites don't
        // each have to read the store. Sync it to whatever was restored.
        if (state) setSpeechEnabled(state.audio)
      },
    }
  )
)

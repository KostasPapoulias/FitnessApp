import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PacePlan, PaceUnit, clampTarget } from '../lib/paceCoach'
import { isVoiceSupported } from '../lib/voiceRecognition'
import { setSpeechEnabled } from '../lib/speech'

/**
 * The Smart Features switches (voice, audio, haptics, pace coach), stored per
 * device — they describe what this phone should do.
 */

interface SessionPrefsStore {
  /** Hands-free commands during a live session. */
  voice: boolean
  /** Spoken pace coaching on a run (needs audio on to be heard). */
  paceCoach: boolean
  /** The remembered pace plan; the unit (distance or time) is kept separately from the paces. */
  paceUnit: PaceUnit
  paceStartSec: number
  paceDeltaSec: number
  /** Vibrate when a rest period ends. */
  haptic: boolean
  /** Spoken cues for the next exercise and end of rest. */
  audio: boolean

  /** Null until probed; false hides the voice toggle. */
  voiceSupported: boolean | null

  setVoice: (on: boolean) => void
  setPaceCoach: (on: boolean) => void
  /** Mode and numbers together — one decision (see PaceSheet). */
  setPacePlan: (plan: PacePlan) => void
  setHaptic: (on: boolean) => void
  setAudio: (on: boolean) => void
  probeVoiceSupport: () => Promise<void>
}

export const useSessionPrefsStore = create<SessionPrefsStore>()(
  persist(
    (set) => ({
      // Voice and haptics on by default; audio off (a phone talking in a gym should be opt-in)
      voice: true,
      haptic: true,
      audio: false,
      // Off until enabled; then starts in 'auto', so no number is required
      paceCoach: false,
      paceUnit: 'km',
      paceStartSec: 330,
      paceDeltaSec: 0,
      voiceSupported: null,

      setVoice: (on) => set({ voice: on }),
      setPaceCoach: (on) => set({ paceCoach: on }),
      // Clamped here too — restored plans may never have passed through the sheet
      setPacePlan: (plan) =>
        set({
          paceUnit: plan.unit,
          paceStartSec: clampTarget(plan.startSec),
          // ±60 s/km at most, since the delta compounds per kilometre
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
      // voiceSupported is probed each launch, not persisted
      partialize: (s) => ({
        voice: s.voice, haptic: s.haptic, audio: s.audio,
        paceCoach: s.paceCoach,
        paceUnit: s.paceUnit,
        paceStartSec: s.paceStartSec,
        paceDeltaSec: s.paceDeltaSec,
      }),
      onRehydrateStorage: () => (state) => {
        // Sync the speech module's own enabled flag
        if (state) setSpeechEnabled(state.audio)
      },
    }
  )
)

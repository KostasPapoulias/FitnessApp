import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
  /** Vibrate when a rest period ends. */
  haptic: boolean
  /** Spoken cues for the next exercise and the end of rest. */
  audio: boolean

  /** null until probed. False hides the voice toggle rather than offering a
   *  switch this device cannot honour. */
  voiceSupported: boolean | null

  setVoice: (on: boolean) => void
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
      voiceSupported: null,

      setVoice: (on) => set({ voice: on }),
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
      partialize: (s) => ({ voice: s.voice, haptic: s.haptic, audio: s.audio }),
      onRehydrateStorage: () => (state) => {
        // The speech module keeps its own enabled flag so cue call sites don't
        // each have to read the store. Sync it to whatever was restored.
        if (state) setSpeechEnabled(state.audio)
      },
    }
  )
)

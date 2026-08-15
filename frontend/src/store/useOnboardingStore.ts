import { create } from 'zustand'
import { onboardingService, Injury } from '../services/onboarding.service'

// Shared onboarding state: the optional-stage prompt on Home and every
// coach-mark read from here, so opening the app costs one request rather than
// one per hint.
//
// Hint dismissals are written through optimistically. A coach-mark that
// reappears because its POST was still in flight is worse than one that stays
// dismissed after a failed write — the server call is a sync, not a gate.

interface OnboardingStore {
  loaded: boolean
  optionalStageDoneAt: string | null
  equipmentIds: string[]
  injuries: Injury[]
  seenHints: Set<string>

  fetchState: () => Promise<void>
  hasSeen: (hintKey: string) => boolean
  dismissHint: (hintKey: string) => void
  resetHints: () => Promise<void>
}

export const useOnboardingStore = create<OnboardingStore>()((set, get) => ({
  loaded: false,
  optionalStageDoneAt: null,
  equipmentIds: [],
  injuries: [],
  seenHints: new Set(),

  fetchState: async () => {
    try {
      const state = await onboardingService.getState()
      set({
        loaded: true,
        optionalStageDoneAt: state.optionalStageDoneAt,
        equipmentIds: state.equipmentIds,
        injuries: state.injuries,
        seenHints: new Set(state.seenHints),
      })
    } catch {
      // A failed fetch must not make every coach-mark appear at once on a
      // flaky connection. Staying unloaded keeps them all hidden.
      set({ loaded: false })
    }
  },

  hasSeen: (hintKey) => get().seenHints.has(hintKey),

  dismissHint: (hintKey) => {
    set(state => ({ seenHints: new Set(state.seenHints).add(hintKey) }))
    onboardingService.dismissHint(hintKey).catch(() => {
      // Left dismissed locally. It will reappear on the next device or after a
      // reinstall, which is the harmless direction to fail in.
    })
  },

  resetHints: async () => {
    await onboardingService.resetHints()
    set({ seenHints: new Set() })
  },
}))

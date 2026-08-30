import { create } from 'zustand'
import { onboardingService, Injury } from '../services/onboarding.service'

// Shared onboarding state: the optional-stage prompt on Home and the equipment
// and injury summary on Profile, fetched once on launch by AppLayout rather
// than by each screen that reads it.

interface OnboardingStore {
  loaded: boolean
  optionalStageDoneAt: string | null
  equipmentIds: string[]
  injuries: Injury[]

  fetchState: () => Promise<void>
}

export const useOnboardingStore = create<OnboardingStore>()((set) => ({
  loaded: false,
  optionalStageDoneAt: null,
  equipmentIds: [],
  injuries: [],

  fetchState: async () => {
    try {
      const state = await onboardingService.getState()
      set({
        loaded: true,
        optionalStageDoneAt: state.optionalStageDoneAt,
        equipmentIds: state.equipmentIds,
        injuries: state.injuries,
      })
    } catch {
      // `loaded` gates the setup prompt on Home, so a failed fetch leaves it
      // hidden rather than prompting against state nobody has read yet.
      set({ loaded: false })
    }
  },
}))

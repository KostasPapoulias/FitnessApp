import { create } from 'zustand'
import { onboardingService, Injury } from '../services/onboarding.service'

// Onboarding state (optional-stage prompt, equipment and injuries), fetched once by AppLayout.

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
      // `loaded` gates the Home prompt, so a failed fetch keeps it hidden
      set({ loaded: false })
    }
  },
}))

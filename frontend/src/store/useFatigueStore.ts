import { create } from 'zustand'
import { FitnessLevel, MuscleFatigue, ReadinessStatus } from '../types'
import { fatigueService } from '../services/fatigue.service'

interface FatigueStore {
  muscles: MuscleFatigue[]
  readinessScore: number
  readinessStatus: ReadinessStatus
  fitnessLevel: FitnessLevel
  isLoading: boolean
  selectedMuscle: MuscleFatigue | null

  fetchFatigue: () => Promise<void>
  selectMuscle: (muscle: MuscleFatigue | null) => void
  overrideMuscle: (muscleId: string, level: number) => Promise<void>
}

export const useFatigueStore = create<FatigueStore>((set, get) => ({
  muscles: [],
  readinessScore: 0,
  readinessStatus: 'rest',
  fitnessLevel: 'intermediate',
  isLoading: false,
  selectedMuscle: null,

  fetchFatigue: async () => {
    set({ isLoading: true })
    try {
      const data = await fatigueService.getCurrent()
      set({
        muscles: data.muscles,
        readinessScore: data.readinessScore,
        readinessStatus: data.readinessStatus,
        fitnessLevel: data.fitnessLevel,
        isLoading: false
      })
    } catch (err) {
      console.error('fetchFatigue error:', err)
      set({ isLoading: false })
    }
  },

  selectMuscle: (muscle) => set({ selectedMuscle: muscle }),

  overrideMuscle: async (muscleId, level) => {
    await fatigueService.override(muscleId, level)
    await get().fetchFatigue()
  }
}))
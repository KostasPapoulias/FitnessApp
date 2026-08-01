import { create } from 'zustand'
import { FitnessLevel, MuscleFatigue, ReadinessStatus, TrainingLoad } from '../types'
import { fatigueService } from '../services/fatigue.service'

interface FatigueStore {
  muscles: MuscleFatigue[]
  readinessScore: number
  readinessStatus: ReadinessStatus
  fitnessLevel: FitnessLevel
  // Whole-body fatigue — what a long run or a metcon actually loads
  systemicFatigue: number
  // Weeks-long trend; fetched separately since it scans session history
  trainingLoad: TrainingLoad | null
  isLoading: boolean
  selectedMuscle: MuscleFatigue | null

  fetchFatigue: () => Promise<void>
  fetchTrainingLoad: () => Promise<void>
  selectMuscle: (muscle: MuscleFatigue | null) => void
  overrideMuscle: (muscleId: string, level: number) => Promise<void>
}

export const useFatigueStore = create<FatigueStore>((set, get) => ({
  muscles: [],
  readinessScore: 0,
  readinessStatus: 'rest',
  fitnessLevel: 'intermediate',
  systemicFatigue: 0,
  trainingLoad: null,
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
        systemicFatigue: data.systemicFatigue,
        isLoading: false
      })
    } catch (err) {
      console.error('fetchFatigue error:', err)
      set({ isLoading: false })
    }
  },

  // Kept off fetchFatigue's path: this one scans months of session history and
  // the readiness call runs on every screen that shows the muscle map.
  fetchTrainingLoad: async () => {
    try {
      set({ trainingLoad: await fatigueService.getTrainingLoad() })
    } catch (err) {
      console.error('fetchTrainingLoad error:', err)
    }
  },

  selectMuscle: (muscle) => set({ selectedMuscle: muscle }),

  overrideMuscle: async (muscleId, level) => {
    await fatigueService.override(muscleId, level)
    await get().fetchFatigue()
  }
}))
import { create } from 'zustand'
import { Exercise, WorkoutSession } from '../types'

interface SelectedExercise {
  exercise: Exercise
  sets: { reps: number; weight: number; rpe: number; restSeconds: number }[]
}

interface WorkoutStore {
  selectedExercises: SelectedExercise[]
  activeSession: WorkoutSession | null
  currentExerciseIndex: number
  currentSetIndex: number

  addExercise: (exercise: Exercise) => void
  removeExercise: (exerciseId: string) => void
  clearExercises: () => void
  setActiveSession: (session: WorkoutSession | null) => void
  nextSet: () => void
  nextExercise: () => void
}

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  selectedExercises: [],
  activeSession: null,
  currentExerciseIndex: 0,
  currentSetIndex: 0,

  addExercise: (exercise) => {
    const existing = get().selectedExercises.find(
      e => e.exercise.id === exercise.id
    )
    if (existing) return // already added

    set(state => ({
      selectedExercises: [...state.selectedExercises, {
        exercise,
        sets: [{ reps: 10, weight: 0, rpe: 7, restSeconds: 90 }]
      }]
    }))
  },

  removeExercise: (exerciseId) => {
    set(state => ({
      selectedExercises: state.selectedExercises.filter(
        e => e.exercise.id !== exerciseId
      )
    }))
  },

  clearExercises: () => set({ selectedExercises: [], currentExerciseIndex: 0, currentSetIndex: 0 }),

  setActiveSession: (session) => set({ activeSession: session }),

  nextSet: () => {
    const { currentSetIndex, currentExerciseIndex, selectedExercises } = get()
    const currentExercise = selectedExercises[currentExerciseIndex]
    if (currentSetIndex < currentExercise.sets.length - 1) {
      set({ currentSetIndex: currentSetIndex + 1 })
    }
  },

  nextExercise: () => {
    const { currentExerciseIndex, selectedExercises } = get()
    if (currentExerciseIndex < selectedExercises.length - 1) {
      set({ currentExerciseIndex: currentExerciseIndex + 1, currentSetIndex: 0 })
    }
  }
}))
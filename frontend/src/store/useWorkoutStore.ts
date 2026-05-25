import { create } from 'zustand'
import { Exercise, WorkoutSession } from '../types'
import { workoutService } from '../services/workout.service'

interface PlannedSet {
  reps: number
  weight: number
  rpe: number
  restSeconds: number
}

interface SelectedExercise {
  exercise: Exercise
  sets: PlannedSet[]
  workoutExerciseId?: string // set after session starts
}

interface WorkoutStore {
  // Selection phase
  activeSession: WorkoutSession | null
  selectedExercises: SelectedExercise[]
  addExercise: (exercise: Exercise) => void
  removeExercise: (exerciseId: string) => void
  clearExercises: () => void
  updateSets: (exerciseId: string, sets: PlannedSet[]) => void

  // Active session phase
  sessionId: string | null
  sessionStartTime: Date | null
  currentExerciseIndex: number
  currentSetIndex: number
  completedSets: { exerciseId: string; setIndex: number }[]

  startSession: () => Promise<void>
  completeSet: (data: {
    reps: number
    weight: number
    rpe: number
    restSeconds: number
  }) => Promise<void>
  finishSession: () => Promise<any>
  nextExercise: () => void
}

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  activeSession: null,
  selectedExercises: [],
  sessionId: null,
  sessionStartTime: null,
  currentExerciseIndex: 0,
  currentSetIndex: 0,
  completedSets: [],

  addExercise: (exercise) => {
    if (get().selectedExercises.find(e => e.exercise.id === exercise.id)) return
    set(state => ({
      selectedExercises: [...state.selectedExercises, {
        exercise,
        sets: [
          { reps: 10, weight: 60, rpe: 7, restSeconds: 90 },
          { reps: 8,  weight: 70, rpe: 8, restSeconds: 90 },
          { reps: 6,  weight: 80, rpe: 9, restSeconds: 90 },
        ]
      }]
    }))
  },

  removeExercise: (exerciseId) => set(state => ({
    selectedExercises: state.selectedExercises.filter(
      e => e.exercise.id !== exerciseId
    )
  })),

  clearExercises: () => set({
    selectedExercises: [],
    sessionId: null,
    sessionStartTime: null,
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    completedSets: []
  }),

  updateSets: (exerciseId, sets) => set(state => ({
    selectedExercises: state.selectedExercises.map(e =>
      e.exercise.id === exerciseId ? { ...e, sets } : e
    )
  })),

  startSession: async () => {
    const session = await workoutService.startSession()
    const { selectedExercises } = get()

    // Register all exercises with the backend
    const updated = await Promise.all(
      selectedExercises.map(async (se, index) => {
        const we = await workoutService.addExercise(session.id, {
          exerciseId: se.exercise.id,
          orderIndex: index + 1
        })
        return { ...se, workoutExerciseId: we.id }
      })
    )

    set({
      activeSession: session,
      sessionId: session.id,
      sessionStartTime: new Date(),
      selectedExercises: updated,
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      completedSets: []
    })
  },

  completeSet: async ({ reps, weight, rpe, restSeconds }) => {
    const {
      sessionId, selectedExercises,
      currentExerciseIndex, currentSetIndex, completedSets
    } = get()

    if (!sessionId) return

    const currentExercise = selectedExercises[currentExerciseIndex]
    if (!currentExercise?.workoutExerciseId) return

    // Log the set to backend
    await workoutService.logSet(sessionId, {
      workoutExerciseId: currentExercise.workoutExerciseId,
      setNumber: currentSetIndex + 1,
      setType: 'STRENGTH',
      rpe,
      restSeconds,
      reps,
      weight
    })

    set({
      completedSets: [
        ...completedSets,
        { exerciseId: currentExercise.exercise.id, setIndex: currentSetIndex }
      ]
    })
  },

  nextExercise: () => {
    const { currentExerciseIndex, selectedExercises } = get()
    if (currentExerciseIndex < selectedExercises.length - 1) {
      set({ currentExerciseIndex: currentExerciseIndex + 1, currentSetIndex: 0 })
    }
  },

  finishSession: async () => {
    const { sessionId, sessionStartTime } = get()
    if (!sessionId || !sessionStartTime) return null

    const startMs = sessionStartTime instanceof Date
      ? sessionStartTime.getTime()
      : Date.parse(String(sessionStartTime))
    const duration = Math.round((Date.now() - startMs) / 1000)
    if (!Number.isFinite(duration) || duration < 0) return null

    const result = await workoutService.finishSession(sessionId, duration)

    set({
      activeSession: null,
      sessionId: null,
      sessionStartTime: null,
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      completedSets: []
    })

    return result
  }
}))
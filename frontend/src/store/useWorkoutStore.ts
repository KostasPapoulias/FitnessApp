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
  skipped?: boolean
}

export type CardioTarget = { type: 'distance' | 'time'; value: number }
export type WodFormat = 'amrap' | 'fortime' | 'emom' | 'rounds'
export type WodConfig = { format: WodFormat; capSec: number; targetRounds: number }

// Sensible default planned sets per modality (used when an exercise is added)
function defaultSetsFor(modality: string): PlannedSet[] {
  switch (modality) {
    case 'Calisthenics':
      return [
        { reps: 10, weight: 0, rpe: 7, restSeconds: 75 },
        { reps: 8,  weight: 0, rpe: 8, restSeconds: 75 },
        { reps: 8,  weight: 0, rpe: 8, restSeconds: 75 },
      ]
    case 'Mobility':
      // reps == hold seconds for mobility; no rest between rounds
      return [{ reps: 30, weight: 0, rpe: 5, restSeconds: 0 }]
    case 'Cardio':
      return [{ reps: 0, weight: 0, rpe: 6, restSeconds: 0 }]
    case 'WOD':
      // reps == reps-per-round for a WOD movement
      return [{ reps: 10, weight: 0, rpe: 8, restSeconds: 0 }]
    case 'Strength':
    default:
      return [
        { reps: 10, weight: 60, rpe: 7, restSeconds: 90 },
        { reps: 8,  weight: 70, rpe: 8, restSeconds: 90 },
        { reps: 6,  weight: 80, rpe: 9, restSeconds: 90 },
      ]
  }
}

interface WorkoutStore {
  // Selection phase
  activeSession: WorkoutSession | null
  selectedExercises: SelectedExercise[]
  addExercise: (exercise: Exercise) => void
  setSingleExercise: (exercise: Exercise) => void // replace selection with one (cardio)
  removeExercise: (exerciseId: string) => void
  clearExercises: () => void
  updateSets: (exerciseId: string, sets: PlannedSet[]) => void

  // per-modality plan config
  cardioTarget: CardioTarget | null
  wodConfig: WodConfig | null
  setCardioTarget: (t: CardioTarget | null) => void
  setWodConfig: (c: WodConfig | null) => void

  // Set / exercise editing (index-based, used by the redesigned flow)
  updateSet: (exIdx: number, setIdx: number, patch: Partial<PlannedSet>) => void
  addSet: (exIdx: number) => void
  removeSet: (exIdx: number, setIdx: number) => void
  setExerciseRest: (exIdx: number, restSeconds: number) => void
  removeExerciseAt: (exIdx: number) => void
  toggleSkip: (exIdx: number) => void
  swapExercise: (exIdx: number, exercise: Exercise) => void
  reorderExercises: (from: number, to: number) => void
  setCurrent: (exIdx: number, setIdx?: number) => void

  // Active session phase
  sessionId: string | null
  sessionStartTime: Date | null
  currentExerciseIndex: number
  currentSetIndex: number
  completedSets: { exerciseId: string; setIndex: number }[]

  startSession: () => Promise<void>
  completeSet: (data: {
    rpe?: number
    restSeconds?: number
    reps?: number       // strength / calisthenics reps; also carries mobility hold-seconds
    weight?: number     // strength weight; also carries calisthenics added load
    addedWeight?: number
    duration?: number   // mobility hold seconds (explicit)
    distance?: number   // cardio / wod
    time?: number       // cardio / wod
  }) => Promise<void>
  finishSession: () => Promise<any>
  nextExercise: () => void
}

const DEFAULT_SET: PlannedSet = { reps: 10, weight: 20, rpe: 7, restSeconds: 90 }

// Exercise modality → backend SetType enum
const MODALITY_SET_TYPE: Record<string, string> = {
  Strength: 'STRENGTH',
  Calisthenics: 'CALISTHENICS',
  Cardio: 'CARDIO',
  WOD: 'WOD',
  Mobility: 'MOBILITY',
}

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  activeSession: null,
  selectedExercises: [],
  sessionId: null,
  sessionStartTime: null,
  currentExerciseIndex: 0,
  currentSetIndex: 0,
  completedSets: [],
  cardioTarget: null,
  wodConfig: null,

  addExercise: (exercise) => {
    if (get().selectedExercises.find(e => e.exercise.id === exercise.id)) return
    set(state => ({
      selectedExercises: [...state.selectedExercises, {
        exercise,
        skipped: false,
        sets: defaultSetsFor(exercise.modality),
      }]
    }))
  },

  setSingleExercise: (exercise) => set({
    selectedExercises: [{ exercise, skipped: false, sets: defaultSetsFor(exercise.modality) }],
  }),

  setCardioTarget: (cardioTarget) => set({ cardioTarget }),
  setWodConfig: (wodConfig) => set({ wodConfig }),

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
    completedSets: [],
    cardioTarget: null,
    wodConfig: null,
  }),

  updateSets: (exerciseId, sets) => set(state => ({
    selectedExercises: state.selectedExercises.map(e =>
      e.exercise.id === exerciseId ? { ...e, sets } : e
    )
  })),

  // ── index-based editing helpers ─────────────────────────────────────────
  updateSet: (exIdx, setIdx, patch) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) =>
      i !== exIdx ? e : {
        ...e,
        sets: e.sets.map((s, j) => j !== setIdx ? s : { ...s, ...patch })
      }
    )
  })),

  addSet: (exIdx) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) => {
      if (i !== exIdx) return e
      const last = e.sets[e.sets.length - 1] ?? DEFAULT_SET
      return { ...e, sets: [...e.sets, { ...last }] }
    })
  })),

  removeSet: (exIdx, setIdx) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) =>
      i !== exIdx ? e : {
        ...e,
        sets: e.sets.length > 1 ? e.sets.filter((_, j) => j !== setIdx) : e.sets
      }
    )
  })),

  setExerciseRest: (exIdx, restSeconds) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) =>
      i !== exIdx ? e : {
        ...e,
        sets: e.sets.map(s => ({ ...s, restSeconds: Math.max(0, restSeconds) }))
      }
    )
  })),

  removeExerciseAt: (exIdx) => set(state => {
    const arr = state.selectedExercises.filter((_, j) => j !== exIdx)
    let curEx = state.currentExerciseIndex > exIdx
      ? state.currentExerciseIndex - 1
      : state.currentExerciseIndex
    curEx = Math.min(curEx, Math.max(0, arr.length - 1))
    return { selectedExercises: arr, currentExerciseIndex: curEx }
  }),

  toggleSkip: (exIdx) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) =>
      i !== exIdx ? e : { ...e, skipped: !e.skipped }
    )
  })),

  swapExercise: (exIdx, exercise) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) =>
      i !== exIdx ? e : { ...e, exercise, workoutExerciseId: undefined }
    )
  })),

  reorderExercises: (from, to) => {
    if (from == null || to == null || from === to) return
    set(state => {
      const arr = state.selectedExercises.slice()
      if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return {}
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      let curEx = state.currentExerciseIndex
      if (from === curEx) curEx = to
      else if (from < curEx && to >= curEx) curEx -= 1
      else if (from > curEx && to <= curEx) curEx += 1
      return { selectedExercises: arr, currentExerciseIndex: curEx }
    })
  },

  setCurrent: (exIdx, setIdx = 0) => set({
    currentExerciseIndex: exIdx,
    currentSetIndex: setIdx
  }),

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

  completeSet: async (data) => {
    const {
      sessionId, selectedExercises,
      currentExerciseIndex, currentSetIndex, completedSets
    } = get()

    if (!sessionId) return

    const currentExercise = selectedExercises[currentExerciseIndex]
    if (!currentExercise?.workoutExerciseId) return

    const setType = MODALITY_SET_TYPE[currentExercise.exercise.modality] ?? 'STRENGTH'

    // Build the modality-specific payload the backend expects for this SetType
    const payload: Parameters<typeof workoutService.logSet>[1] = {
      workoutExerciseId: currentExercise.workoutExerciseId,
      setNumber: currentSetIndex + 1,
      setType,
      rpe: data.rpe,
      restSeconds: data.restSeconds,
    }
    switch (setType) {
      case 'CALISTHENICS':
        payload.reps = data.reps ?? 0
        payload.addedWeight = data.addedWeight ?? data.weight ?? 0
        break
      case 'MOBILITY':
        // reps carries the hold time in seconds unless an explicit duration is given
        payload.duration = data.duration ?? data.reps ?? 0
        break
      case 'CARDIO':
      case 'WOD':
        payload.distance = data.distance
        payload.time = data.time
        break
      case 'STRENGTH':
      default:
        payload.reps = data.reps ?? 0
        payload.weight = data.weight ?? 0
        break
    }

    await workoutService.logSet(sessionId, payload)

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

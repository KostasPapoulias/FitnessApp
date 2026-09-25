import api from './api'
import { RunPayload } from '../lib/runPayload'

export interface PlanSuggestion {
  exerciseId: string
  sets: { reps: number; weight: number; rpe: number; restSeconds: number }[]
  /** How the numbers were arrived at; drives the note on the plan screen. */
  basis: 'progression' | 'repeat' | 'deload' | 'return' | 'estimate' | 'default'
  note: string
  e1rm: number | null
  lastPerformed: string | null
}

export const workoutService = {
  // Suggested sets from the athlete's history, batched for the plan screen
  getPlanSuggestions: async (
    exercises: { exerciseId: string; fallback: PlanSuggestion['sets'] }[]
  ): Promise<PlanSuggestion[]> => {
    const res = await api.post('/workout/plan-suggestions', { exercises })
    return res.data.data
  },

  startSession: async (data?: { notes?: string }) => {
    const res = await api.post('/workout/sessions', data ?? {})
    return res.data.data
  },

  addExercise: async (sessionId: string, data: {
    exerciseId: string
    orderIndex: number
    notes?: string
  }) => {
    const res = await api.post(`/workout/sessions/${sessionId}/exercises`, data)
    return res.data.data
  },

  /** Write or clear an exercise note; '' clears it (the server stores null). */
  updateExerciseNotes: async (
    sessionId: string,
    workoutExerciseId: string,
    notes: string,
  ) => {
    const res = await api.patch(
      `/workout/sessions/${sessionId}/exercises/${workoutExerciseId}`,
      { notes },
    )
    return res.data.data
  },

  logSet: async (sessionId: string, data: {
    workoutExerciseId: string
    setNumber: number
    setType: string
    rpe?: number
    restSeconds?: number
    reps?: number          // STRENGTH / CALISTHENICS; WOD reps-per-round
    weight?: number        // STRENGTH; WOD external load per movement
    addedWeight?: number   // CALISTHENICS
    distance?: number      // CARDIO / WOD
    time?: number          // CARDIO / WOD
    rounds?: number        // WOD
    duration?: number      // MOBILITY
    run?: RunPayload       // CARDIO — route, splits and pace for the history
  }) => {
    const res = await api.post(`/workout/sessions/${sessionId}/sets`, data)
    return res.data.data
  },

  /** The full recorded run for a cardio set, route included. */
  getRunTrack: async (setId: string) => {
    const res = await api.get(`/workout/sets/${setId}/run`)
    return res.data.data as RunPayload | null
  },

  finishSession: async (sessionId: string, duration: number) => {
    const res = await api.post(`/workout/sessions/${sessionId}/finish`, { duration })
    return res.data.data
  },

  /** The unfinished session, if any, with its set count, for the resume prompt. */
  getActiveSession: async (): Promise<ActiveSession | null> => {
    const res = await api.get('/workout/sessions/active')
    return res.data.data
  },

  /** Delete a session; for a finished one the server also reverses its fatigue and estimates. */
  deleteSession: async (sessionId: string) => {
    const res = await api.delete(`/workout/sessions/${sessionId}`)
    return res.data.data as { id: string; reversed: boolean }
  },

  /** Correct a logged set. The session is re-scored and fatigue rebuilt. */
  updateSet: async (setId: string, patch: {
    reps?: number
    weight?: number
    addedWeight?: number
    distance?: number
    time?: number
    rounds?: number
    rpe?: number | null
    restSeconds?: number | null
  }) => {
    const res = await api.patch(`/workout/sets/${setId}`, patch)
    return res.data.data
  },

  deleteSet: async (setId: string) => {
    const res = await api.delete(`/workout/sets/${setId}`)
    return res.data.data
  },
}

export interface ActiveSession {
  id: string
  dateTime: string
  setCount: number
  exerciseNames: string[]
}
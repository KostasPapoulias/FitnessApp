import api from './api'

export interface PlanSuggestion {
  exerciseId: string
  sets: { reps: number; weight: number; rpe: number; restSeconds: number }[]
  /** How the numbers were arrived at — drives the note shown on the plan screen */
  basis: 'progression' | 'repeat' | 'deload' | 'return' | 'estimate' | 'default'
  note: string
  e1rm: number | null
  lastPerformed: string | null
}

export const workoutService = {
  // What the athlete should actually be lifting, from their own history.
  // Batched: the plan screen needs every exercise at once.
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
  }) => {
    const res = await api.post(`/workout/sessions/${sessionId}/exercises`, data)
    return res.data.data
  },

  logSet: async (sessionId: string, data: {
    workoutExerciseId: string
    setNumber: number
    setType: string
    rpe?: number
    restSeconds?: number
    reps?: number          // STRENGTH / CALISTHENICS; WOD reps-per-round
    weight?: number        // STRENGTH
    addedWeight?: number   // CALISTHENICS
    distance?: number      // CARDIO / WOD
    time?: number          // CARDIO / WOD
    rounds?: number        // WOD
    duration?: number      // MOBILITY
  }) => {
    const res = await api.post(`/workout/sessions/${sessionId}/sets`, data)
    return res.data.data
  },

  finishSession: async (sessionId: string, duration: number) => {
    const res = await api.post(`/workout/sessions/${sessionId}/finish`, { duration })
    return res.data.data
  },

  getRecentSessions: async (limit = 20) => {
    const res = await api.get('/workout/sessions', { params: { limit } })
    return res.data.data as any[]
  },
}
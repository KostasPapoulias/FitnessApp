import api from './api'

export const workoutService = {
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
    reps?: number          // STRENGTH / CALISTHENICS
    weight?: number        // STRENGTH
    addedWeight?: number   // CALISTHENICS
    distance?: number      // CARDIO / WOD
    time?: number          // CARDIO / WOD
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
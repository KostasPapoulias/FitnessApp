import api from './api'
import {
  E1rmPoint, ExerciseHistory, HistoryPage, ProgressSummary,
} from '../types'

export const progressService = {
  /** Volume, strength and per-muscle fatigue in one request — see the controller. */
  getSummary: async (weeks?: number, days?: number): Promise<ProgressSummary> => {
    const res = await api.get('/progress/summary', { params: { weeks, days } })
    return res.data.data
  },

  getExerciseSeries: async (exerciseId: string): Promise<E1rmPoint[]> => {
    const res = await api.get(`/progress/strength/${exerciseId}`)
    return res.data.data.points
  },

  /** One page of session history. Pass the previous page's `nextCursor` to continue. */
  getHistory: async (
    options: { cursor?: string; limit?: number; modality?: string } = {}
  ): Promise<HistoryPage> => {
    const res = await api.get('/progress/history', { params: options })
    return res.data.data
  },

  getExerciseHistory: async (exerciseId: string, limit?: number): Promise<ExerciseHistory> => {
    const res = await api.get(`/progress/exercises/${exerciseId}/history`, { params: { limit } })
    return res.data.data
  },
}

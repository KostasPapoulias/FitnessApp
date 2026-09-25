import api from './api'
import { CardioTracking, Exercise, ExerciseCategory } from '../types'

export const exerciseService = {
  getCategories: async (): Promise<ExerciseCategory[]> => {
    const res = await api.get('/exercises/categories')
    return res.data.data
  },

  getModalities: async () => {
    const res = await api.get('/exercises/modalities')
    return res.data.data
  },

  getExercises: async (params: {
    category?: string
    modality?: string
    search?: string
  }): Promise<Exercise[]> => {
    const res = await api.get('/exercises', { params })
    return res.data.data
  },

  getById: async (id: string): Promise<Exercise> => {
    const res = await api.get(`/exercises/${id}`)
    return res.data.data
  },

  /** Star or unstar; explicit on/off so a retry is safe. */
  setFavorite: async (id: string, on: boolean): Promise<void> => {
    if (on) await api.post(`/exercises/${id}/favorite`)
    else await api.delete(`/exercises/${id}/favorite`)
  },

  /** Create a custom exercise. No calibration fields — the server derives those. */
  create: async (input: {
    name: string
    modalityId: string
    description?: string
    muscles: { muscleId: string; role: 'primary' | 'secondary' }[]
    categoryIds?: string[]
    equipmentIds?: string[]
    /** Cardio only. */
    cardioTracking?: CardioTracking
  }): Promise<Exercise> => {
    const res = await api.post('/exercises', input)
    return res.data.data
  },
}
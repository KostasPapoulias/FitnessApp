import api from './api'
import { Exercise, ExerciseCategory } from '../types'

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

  /**
   * Create a movement the catalogue does not have.
   *
   * Deliberately carries no calibration fields. damageFactor, loadFactor and
   * the per-muscle impact weightings are derived server-side from the role
   * each muscle is given — they feed the fatigue model, and a number typed
   * into a form here would be wrong in a way nobody could ever see.
   */
  create: async (input: {
    name: string
    modalityId: string
    description?: string
    muscles: { muscleId: string; role: 'primary' | 'secondary' }[]
    categoryIds?: string[]
    equipmentIds?: string[]
  }): Promise<Exercise> => {
    const res = await api.post('/exercises', input)
    return res.data.data
  },
}
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
  }
}
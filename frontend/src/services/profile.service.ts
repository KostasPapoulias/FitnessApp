import api from './api'

export const profileService = {
  getProfile: async () => {
    const res = await api.get('/profile')
    return res.data.data
  },

  updateProfile: async (data: {
    name?: string
    age?: number
    weight?: number
    height?: number
    gender?: string
    fitnessLevel?: string
    goal?: string
  }) => {
    const res = await api.put('/profile', data)
    return res.data.data
  },

  logSleep: async (data: {
    sleepDate: string
    durationMin: number
    sleepScore?: number
  }) => {
    const res = await api.post('/profile/sleep', data)
    return res.data.data
  },

  logNutrition: async (data: {
    logDate: string
    proteinG?: number
    calories?: number
  }) => {
    const res = await api.post('/profile/nutrition', data)
    return res.data.data
  },

  deleteAccount: async () => {
    await api.delete('/profile/account')
  }
}
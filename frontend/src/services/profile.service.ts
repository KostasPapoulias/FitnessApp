import api from './api'

export const profileService = {
  getProfile: async () => {
    const res = await api.get('/profile')
    return res.data.data
  },

  updateProfile: async (data: {
    name?: string
    /** Legacy. Send birthDate instead — the recovery model prefers it. */
    age?: number
    weight?: number
    height?: number
    gender?: string
    fitnessLevel?: string
    goal?: string
    birthDate?: string
    trainingDaysPerWeek?: number
    experienceYears?: number
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

  /**
   * A measurement series, oldest first.
   *
   * Only WEIGHT is ever written today — the other BiometricType values need a
   * wrist device or a tape measure, and are not being estimated.
   */
  getBiometrics: async (
    type: 'WEIGHT' | 'BODY_FAT' | 'LEAN_MASS' | 'HEART_RATE' | 'HRV' | 'SLEEP_SCORE' = 'WEIGHT',
    days?: number
  ): Promise<BiometricSeries> => {
    const res = await api.get('/profile/biometrics', { params: { type, days } })
    return res.data.data
  },

  deleteAccount: async () => {
    await api.delete('/profile/account')
  }
}

export interface BiometricPoint {
  measuredAt: string
  value: number
  source: string
}

export interface BiometricSeries {
  type: string
  days: number
  points: BiometricPoint[]
}
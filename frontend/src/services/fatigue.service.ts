import api from './api'
import { FatigueData } from '../types'

export const fatigueService = {
  getCurrent: async (): Promise<FatigueData> => {
    const res = await api.get('/fatigue/current')
    return res.data.data
  },

  override: async (muscleId: string, fatigueLevel: number) => {
    const res = await api.put(`/fatigue/${muscleId}`, { fatigueLevel })
    return res.data.data
  }
}
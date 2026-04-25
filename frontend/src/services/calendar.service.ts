import api from './api'

export const calendarService = {
  getMonth: async (month: number, year: number) => {
    const res = await api.get('/calendar', { params: { month, year } })
    return res.data.data
  },

  getDay: async (date: string) => {
    const res = await api.get(`/calendar/${date}`)
    return res.data.data
  }
}
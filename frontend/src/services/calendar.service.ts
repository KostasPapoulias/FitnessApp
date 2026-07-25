import api from './api'

export const calendarService = {
  getMonth: async (month: number, year: number) => {
    const res = await api.get('/calendar', { params: { month, year } })
    return res.data.data
  },

  getDay: async (date: string) => {
    const res = await api.get(`/calendar/${date}`)
    return res.data.data
  },

  getActivity: async () => {
    const res = await api.get('/calendar/activity')
    return res.data.data
  },

  getMuscles: async () => {
    const res = await api.get('/calendar/muscles')
    return res.data.data
  }
}
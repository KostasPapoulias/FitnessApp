import api from './api'
import { ScheduledWorkout, WorkoutTemplate } from '../types'

export interface TemplateSetInput {
  reps?: number | null
  weight?: number | null
  rpe?: number | null
  restSeconds?: number | null
  distance?: number | null
  time?: number | null
  rounds?: number | null
}

export interface TemplateInput {
  name: string
  notes?: string | null
  exercises: { exerciseId: string; notes?: string | null; sets: TemplateSetInput[] }[]
}

export const templateService = {
  list: async (includeArchived = false) => {
    const res = await api.get('/templates', { params: { includeArchived } })
    return res.data.data as WorkoutTemplate[]
  },

  get: async (id: string) => {
    const res = await api.get(`/templates/${id}`)
    return res.data.data as WorkoutTemplate
  },

  create: async (input: TemplateInput) => {
    const res = await api.post('/templates', input)
    return res.data.data as WorkoutTemplate
  },

  update: async (id: string, input: TemplateInput) => {
    const res = await api.put(`/templates/${id}`, input)
    return res.data.data as WorkoutTemplate
  },

  /** Plans are archived, never deleted — sessions point back at them. */
  setArchived: async (id: string, archived: boolean) => {
    const res = await api.post(`/templates/${id}/archive`, { archived })
    return res.data.data as WorkoutTemplate
  },

  fromSession: async (sessionId: string, name?: string) => {
    const res = await api.post('/templates/from-session', { sessionId, name })
    return res.data.data as WorkoutTemplate
  },

  // ── standby queue ──

  listScheduled: async (status?: string) => {
    const res = await api.get('/templates/scheduled/list', { params: status ? { status } : {} })
    return res.data.data as ScheduledWorkout[]
  },

  schedule: async (templateId: string, scheduledFor: string, reminderAt?: string | null) => {
    const res = await api.post(`/templates/${templateId}/schedule`, { scheduledFor, reminderAt })
    return res.data.data as ScheduledWorkout
  },

  /** Bind a standby slot to the session that fulfils it. */
  start: async (scheduledId: string, sessionId: string) => {
    const res = await api.post(`/templates/scheduled/${scheduledId}/start`, { sessionId })
    return res.data.data as ScheduledWorkout
  },

  close: async (scheduledId: string, status: 'completed' | 'skipped') => {
    const res = await api.post(`/templates/scheduled/${scheduledId}/close`, { status })
    return res.data.data as ScheduledWorkout
  },

  cancel: async (scheduledId: string) => {
    const res = await api.delete(`/templates/scheduled/${scheduledId}`)
    return res.data.data as ScheduledWorkout
  },
}

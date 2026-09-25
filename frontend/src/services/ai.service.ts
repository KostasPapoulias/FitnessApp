import api from './api'
import { AiProposal, ScheduledWorkout, WorkoutTemplate } from '../types'

export const aiService = {
  // `newThread` creates the thread with this first message
  sendMessage: async (message: string, threadId?: string, newThread?: boolean) => {
    const res = await api.post('/ai/chat', { message, threadId, newThread })
    return res.data.data as { reply: string; threadId: string; proposals: AiProposal[] }
  },

  /** Apply a drafted proposal card — the only way an AI suggestion becomes real data. */
  acceptProposal: async (proposalId: string) => {
    const res = await api.post(`/ai/proposals/${proposalId}/accept`)
    // Each proposal kind returns a different shape
    return res.data.data as
      | { kind: 'create_template'; template: WorkoutTemplate; scheduled: ScheduledWorkout | null }
      | { kind: 'schedule_workout'; template: WorkoutTemplate; scheduled: ScheduledWorkout }
      | { kind: 'create_exercise'; exercise: { id: string; name: string } }
  },

  rejectProposal: async (proposalId: string) => {
    await api.post(`/ai/proposals/${proposalId}/reject`)
  },

  getHistory: async (threadId?: string) => {
    const params = threadId ? { params: { threadId } } : {}
    const res = await api.get('/ai/history', params)
    return res.data.data
  },

  getThreads: async () => {
    const res = await api.get('/ai/threads')
    return res.data.data
  },

  createThread: async (title?: string) => {
    const res = await api.post('/ai/threads', { title })
    return res.data.data
  },

  deleteThread: async (threadId: string) => {
    await api.delete(`/ai/threads/${threadId}`)
  },

  suggestWorkout: async () => {
    const res = await api.get('/ai/suggest-workout')
    return res.data.data
  }
}
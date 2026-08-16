import api from './api'
import { AiProposal, ScheduledWorkout, WorkoutTemplate } from '../types'

export const aiService = {
  // `newThread` asks the server to create the conversation now, on the first
  // real message — nothing is persisted before that.
  sendMessage: async (message: string, threadId?: string, newThread?: boolean) => {
    const res = await api.post('/ai/chat', { message, threadId, newThread })
    return res.data.data as { reply: string; threadId: string; proposals: AiProposal[] }
  },

  /**
   * Turn a drafted card into real data.
   *
   * The only call that lets an AI suggestion reach the athlete's own tables,
   * which is why it is an explicit tap rather than something the reply does
   * on its way in.
   */
  acceptProposal: async (proposalId: string) => {
    const res = await api.post(`/ai/proposals/${proposalId}/accept`)
    // A discriminated union rather than one optional-everything shape: the
    // three kinds return genuinely different objects, and the card has to know
    // which one it is holding before it can open anything.
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
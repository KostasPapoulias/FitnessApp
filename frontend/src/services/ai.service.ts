import api from './api'

export const aiService = {
  // `newThread` asks the server to create the conversation now, on the first
  // real message — nothing is persisted before that.
  sendMessage: async (message: string, threadId?: string, newThread?: boolean) => {
    const res = await api.post('/ai/chat', { message, threadId, newThread })
    return res.data.data as { reply: string; threadId: string }
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
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { aiService } from '../services/ai.service'
import { useFatigueStore } from '../store/useFatigueStore'

const SUGGESTED_PROMPTS = [
  { emoji: '💪', text: 'What should I train today?' },
  { emoji: '🔴', text: 'Which muscles need rest?' },
  { emoji: '📈', text: 'How is my progress?' },
  { emoji: '😴', text: 'How is my recovery?' },
  { emoji: '🎯', text: 'Suggest a workout for my goal' },
  { emoji: '⚡', text: 'Am I overtraining?' },
]

interface Thread {
  id: string
  title: string
  createdAt: string
  messages: { messageText: string; sender: string }[]
  _count: { messages: number }
}

export default function AIChatHub() {
  const navigate = useNavigate()
  const { readinessScore, muscles } = useFatigueStore()

  const [threads,     setThreads]     = useState<Thread[]>([])
  const [isLoading,   setIsLoading]   = useState(true)
  const [isStarting,  setIsStarting]  = useState(false)
  const [deleteId,    setDeleteId]    = useState<string | null>(null)

  useEffect(() => {
    aiService.getThreads()
      .then(setThreads)
      .finally(() => setIsLoading(false))
  }, [])

  // Start a new chat with an optional first message
  const startChat = async (firstMessage?: string) => {
    setIsStarting(true)
    try {
      const thread = await aiService.createThread(
        firstMessage
          ? firstMessage.slice(0, 30) + '...'
          : 'New Chat'
      )
      navigate(`/ai/chat/${thread.id}`, {
        state: { firstMessage }
      })
    } finally {
      setIsStarting(false)
    }
  }

  const handleDelete = async (threadId: string) => {
    await aiService.deleteThread(threadId)
    setThreads(prev => prev.filter(t => t.id !== threadId))
    setDeleteId(null)
  }

  const readinessColor =
    readinessScore >= 70 ? 'text-brand-green' :
    readinessScore >= 40 ? 'text-brand-yellow' : 'text-brand-red'

  const highFatigue = muscles
    .filter(m => m.status === 'high')
    .slice(0, 3)

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now  = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / 86400000)

    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7)  return `${days} days ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="min-h-853 bg-dark-900 flex flex-col">

      {/* Header */}
      <div className="px-5 pt-4 pb-4">
        <h1 className="text-white text-2xl font-bold">AI Coach</h1>
        <p className="text-dark-400 text-sm mt-1">
          Powered by Gemini · Your body data as context
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">

        {/* Body state card */}
        <div className="bg-[#0a2a22] border border-brand-teal/30
                        rounded-card p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <span className="text-brand-teal text-sm font-semibold">
                AI knows your current state
              </span>
            </div>
            <div className={`text-lg font-bold ${readinessColor}`}>
              {readinessScore}% ready
            </div>
          </div>

          {/* Fatigue context pills */}
          {highFatigue.length > 0 ? (
            <div>
              <p className="text-dark-400 text-xs mb-2">
                High fatigue detected:
              </p>
              <div className="flex gap-2 flex-wrap">
                {highFatigue.map(m => (
                  <span key={m.muscleId}
                    className="bg-brand-red/20 border border-brand-red/40
                               text-brand-red text-xs px-2 py-1 rounded-full">
                    {m.muscleName} 🔴 {Math.round(m.fatigueLevel)}%
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-dark-400 text-xs">
              All muscles recovered — great day to train hard!
            </p>
          )}
        </div>

        {/* Suggested prompts */}
        <div className="mb-5">
          <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
            Quick questions
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SUGGESTED_PROMPTS.map(prompt => (
              <button
                key={prompt.text}
                onClick={() => startChat(prompt.text)}
                disabled={isStarting}
                className="bg-dark-800 border border-dark-600 rounded-card
                           p-3 text-left active:scale-95 transition-all
                           active:border-brand-teal/50 active:bg-brand-teal/5
                           disabled:opacity-50"
              >
                <span className="text-xl block mb-1.5">{prompt.emoji}</span>
                <span className="text-dark-200 text-xs leading-relaxed">
                  {prompt.text}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* New chat button */}
        <button
          onClick={() => startChat()}
          disabled={isStarting}
          className="w-full bg-brand-teal text-black font-bold py-4
                     rounded-btn flex items-center justify-center gap-2
                     active:scale-95 transition-transform mb-5
                     disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {isStarting ? 'Starting...' : 'New Chat'}
        </button>

        {/* Chat history */}
        {!isLoading && threads.length > 0 && (
          <div>
            <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
              Recent chats
            </p>
            <div className="flex flex-col gap-2">
              {threads.map(thread => {
                const lastMsg = thread.messages[0]
                const isDeleting = deleteId === thread.id

                return (
                  <div key={thread.id}
                    className="bg-dark-800 border border-dark-600
                               rounded-card overflow-hidden">

                    {!isDeleting ? (
                      <div className="flex items-center gap-3 p-4">
                        {/* Chat icon */}
                        <div className="w-10 h-10 bg-brand-teal/10 border
                                        border-brand-teal/20 rounded-xl
                                        flex items-center justify-center
                                        text-lg flex-shrink-0">
                          💬
                        </div>

                        {/* Info */}
                        <button
                          onClick={() => navigate(`/ai/chat/${thread.id}`)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="text-white text-sm font-semibold truncate">
                            {thread.title ?? 'Chat'}
                          </p>
                          {lastMsg && (
                            <p className="text-dark-400 text-xs mt-0.5 truncate">
                              {lastMsg.sender === 'user' ? 'You: ' : 'AI: '}
                              {lastMsg.messageText}
                            </p>
                          )}
                          <p className="text-dark-500 text-xs mt-1">
                            {formatDate(thread.createdAt)}
                            {' · '}
                            {thread._count.messages} messages
                          </p>
                        </button>

                        {/* Arrow + delete */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => setDeleteId(thread.id)}
                            className="text-dark-600 hover:text-brand-red
                                       transition-colors p-1"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24"
                              fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => navigate(`/ai/chat/${thread.id}`)}
                            className="text-dark-400"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24"
                              fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 18 15 12 9 6"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Delete confirm
                      <div className="p-4">
                        <p className="text-white text-sm mb-3">
                          Delete this chat?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDeleteId(null)}
                            className="flex-1 bg-dark-700 text-dark-300
                                       border border-dark-600 py-2.5 rounded-btn
                                       text-sm">
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDelete(thread.id)}
                            className="flex-1 bg-brand-red text-white font-semibold
                                       py-2.5 rounded-btn text-sm">
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty history */}
        {!isLoading && threads.length === 0 && (
          <div className="text-center py-6">
            <p className="text-dark-500 text-sm">No chats yet</p>
            <p className="text-dark-600 text-xs mt-1">
              Start a conversation above
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
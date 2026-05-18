// At the top of AIChat.tsx — replace the existing imports and add these
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { aiService } from '../services/ai.service'
import { useFatigueStore } from '../store/useFatigueStore'
import { Message } from '../types'

export default function AIChat() {
  const navigate  = useNavigate()
  const { threadId } = useParams<{ threadId: string }>()
  const location  = useLocation()
  const firstMessage = location.state?.firstMessage as string | undefined

  const { readinessScore } = useFatigueStore()

  const [messages,   setMessages]   = useState<Message[]>([])
  const [input,      setInput]      = useState('')
  const [isLoading,  setIsLoading]  = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)

  const bottomRef = useRef<HTMLDivElement>(null)
  const sentFirst = useRef(false)

  // Load history for this specific thread
  useEffect(() => {
    if (!threadId) return
    aiService.getHistory(threadId)
      .then(data => {
        if (data.messages?.length > 0) {
          setMessages(data.messages)
        }
      })
      .finally(() => setIsLoadingHistory(false))
  }, [threadId])

  // Send the first message if navigated with one
  useEffect(() => {
    if (!isLoadingHistory && firstMessage && !sentFirst.current) {
      sentFirst.current = true
      sendMessage(firstMessage)
    }
  }, [isLoadingHistory, firstMessage])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: Message = {
      id:          Date.now().toString(),
      sender:      'user',
      messageText: text.trim(),
      dateTime:    new Date().toISOString()
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const data = await aiService.sendMessage(text.trim(), threadId)
      const aiMsg: Message = {
        id:          Date.now().toString() + '_ai',
        sender:      'assistant',
        messageText: data.reply,
        dateTime:    new Date().toISOString()
      }
      setMessages(prev => [...prev, aiMsg])
    } catch {
      setMessages(prev => [...prev, {
        id:          Date.now().toString() + '_err',
        sender:      'assistant',
        messageText: 'Sorry, I ran into an error. Please try again.',
        dateTime:    new Date().toISOString()
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const readinessColor =
    readinessScore >= 70 ? '#4ADE80' :
    readinessScore >= 40 ? '#FACC15' : '#EF4444'

  return (
    <div className="min-h-853 bg-dark-900 overflow-hidden">

      {/* Header with back button */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-dark-900
              px-5 pt-4 pb-3 border-b border-dark-700
              flex items-center gap-3">
        <button
          onClick={() => navigate('/ai')}
          className="w-9 h-9 bg-dark-800 border border-dark-600 rounded-full
                     flex items-center justify-center text-white
                     active:scale-90 transition-transform flex-shrink-0"
        >
          ←
        </button>

        <div className="w-9 h-9 bg-brand-teal/20 border border-brand-teal/40
                        rounded-full flex items-center justify-center text-lg
                        flex-shrink-0">
          🤖
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-white text-base font-bold">AI Coach</h1>
          <p className="text-dark-400 text-xs">Gemini · Context-aware</p>
        </div>

        <div className="bg-dark-800 border border-dark-600 rounded-full
                        px-3 py-1.5 flex items-center gap-2 flex-shrink-0">
          <div className="w-2 h-2 rounded-full"
            style={{ background: readinessColor }} />
          <span className="text-white text-xs font-semibold">
            {readinessScore}%
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="min-h-853 overflow-y-auto px-4 pt-24 pb-[80px]">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-dark-400 text-sm">Loading...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center
                          min-h-[200px] text-center px-4">
            <div className="text-5xl mb-4">🤖</div>
            <p className="text-white font-bold text-lg mb-2">
              What's on your mind?
            </p>
            <p className="text-dark-400 text-sm">
              Ask me anything about training, recovery, or nutrition.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex gap-3 mt-4">
            <div className="w-8 h-8 bg-brand-teal/20 border border-brand-teal/40
                            rounded-full flex items-center justify-center
                            text-sm flex-shrink-0">
              🤖
            </div>
            <div className="bg-dark-800 border border-dark-600 rounded-2xl
                            rounded-tl-none px-4 py-3 flex items-center gap-1">
              {[0, 150, 300].map(delay => (
                <div key={delay}
                  className="w-2 h-2 bg-dark-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${delay}ms` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
            <div className="fixed bottom-[60px] left-0 right-0 z-10 bg-dark-900
              px-4 pb-8 pt-3 border-t border-dark-700">
        <div className="flex gap-3 items-end">
          <div className="flex-1 bg-dark-800 border border-dark-600
                          rounded-2xl px-4 py-3
                          focus-within:border-brand-teal/60 transition-colors">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(input)
                }
              }}
              placeholder="Ask your AI coach..."
              className="w-full bg-transparent text-white text-sm
                         placeholder-dark-400 outline-none"
            />
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="w-11 h-11 bg-brand-teal rounded-full flex items-center
                       justify-center active:scale-90 transition-transform
                       disabled:opacity-40 flex-shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="#000" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.sender === 'user'
  const time = new Date(message.dateTime).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit'
  })

  if (isUser) return (
    <div className="flex justify-end">
      <div className="max-w-[80%]">
        <div className="bg-brand-teal text-black rounded-2xl
                        rounded-tr-none px-4 py-3">
          <p className="text-sm leading-relaxed">{message.messageText}</p>
        </div>
        <p className="text-dark-500 text-xs text-right mt-1">{time}</p>
      </div>
    </div>
  )

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 bg-brand-teal/20 border border-brand-teal/40
                      rounded-full flex items-center justify-center
                      text-sm flex-shrink-0 mt-1">
        🤖
      </div>
      <div className="max-w-[85%]">
        <div className="bg-dark-800 border border-dark-600 rounded-2xl
                        rounded-tl-none px-4 py-3">
          <p className="text-dark-100 text-sm leading-relaxed whitespace-pre-wrap">
            {message.messageText}
          </p>
        </div>
        <p className="text-dark-500 text-xs mt-1">{time}</p>
      </div>
    </div>
  )
}
// A chat thread with the AI coach, including its proposal cards.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { aiService } from '../services/ai.service'
import { useFatigueStore } from '../store/useFatigueStore'
import { useDeviceType } from '../hooks/useDeviceType'
import { useKeyboardInset } from '../hooks/useKeyboardInset'
import { BOTTOM_NAV_HEIGHT, PHONE_MAX_WIDTH, SIDEBAR_WIDTH } from '../constants/layout'
import { NEW_THREAD } from '../constants/chat'
import { AiProposal, Message } from '../types'
import ProposalCard from '../components/chat/ProposalCard'
import CoachAvatar from '../components/chat/CoachAvatar'
import { useT } from '../i18n'

export default function AIChat() {
  const navigate  = useNavigate()
  const { threadId } = useParams<{ threadId: string }>()
  const location  = useLocation()
  // First message from router state, or `?ask=` (e.g. from a tapped push notification)
  const firstMessage =
    (location.state?.firstMessage as string | undefined) ??
    new URLSearchParams(location.search).get('ask') ??
    undefined

  const { readinessScore } = useFatigueStore()
  const { t, intl } = useT()
  const { isPhone }     = useDeviceType()
  const keyboardInset   = useKeyboardInset()

  // An unsaved chat: nothing exists server-side until the first message.
  const isUnsaved = threadId === NEW_THREAD

  const [messages,   setMessages]   = useState<Message[]>([])
  // Proposal cards, kept apart from messages since they change state (applied, dismissed, expired)
  const [proposals,  setProposals]  = useState<AiProposal[]>([])
  const [input,      setInput]      = useState('')
  const [isLoading,  setIsLoading]  = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(!isUnsaved)
  // Null until the server creates the thread on first send.
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    isUnsaved ? null : threadId ?? null
  )

  const scrollerRef = useRef<HTMLDivElement>(null)
  const sentFirst = useRef(false)
  const historyLoaded = useRef(false)

  // Load this thread's history once — adopting the new thread id must not refetch
  useEffect(() => {
    if (historyLoaded.current) return
    if (isUnsaved || !threadId) {
      historyLoaded.current = true
      return
    }
    historyLoaded.current = true
    aiService.getHistory(threadId)
      .then(data => {
        if (data.messages?.length > 0) {
          setMessages(data.messages)
        }
        // Undecided cards come back with the conversation
        if (data.proposals?.length > 0) {
          setProposals(data.proposals)
        }
      })
      .finally(() => setIsLoadingHistory(false))
  }, [threadId, isUnsaved])

  // Send the first message if navigated with one
  useEffect(() => {
    if (!isLoadingHistory && firstMessage && !sentFirst.current) {
      sentFirst.current = true
      sendMessage(firstMessage)
    }
  }, [isLoadingHistory, firstMessage])

  // Keep the list pinned to the bottom, also when the keyboard opens. Scrolls
  // the list directly: scrollIntoView would also scroll the document behind
  // this fixed shell (which misplaces it on iOS).
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, proposals, isLoading, keyboardInset])

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
      const data = await aiService.sendMessage(
        text.trim(),
        activeThreadId ?? undefined,
        activeThreadId === null
      )

      // First message of a new chat: adopt the id the server created
      if (activeThreadId === null && data.threadId) {
        setActiveThreadId(data.threadId)
        navigate(`/ai/chat/${data.threadId}`, { replace: true })
      }

      const aiMsg: Message = {
        id:          Date.now().toString() + '_ai',
        sender:      'assistant',
        messageText: data.reply,
        dateTime:    new Date().toISOString()
      }
      setMessages(prev => [...prev, aiMsg])
      if (data.proposals?.length > 0) {
        // Stamped with this reply's id so the card sits under it (the server
        // binds messageId only after replying)
        setProposals(prev => [
          ...prev,
          ...data.proposals.map((p: AiProposal) => ({ ...p, messageId: p.messageId ?? aiMsg.id })),
        ])
      }
    } catch (err: any) {
      // 429 (budget or rate limit): show the server's reason
      const limited = err?.response?.status === 429
      setMessages(prev => [...prev, {
        id:          Date.now().toString() + '_err',
        sender:      'assistant',
        messageText: limited
          ? err.response.data?.error ?? t('ai.limitReached')
          : t('ai.error'),
        dateTime:    new Date().toISOString()
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const proposalsFor = (messageId: string) =>
    proposals.filter(p => p.messageId === messageId)

  // Cards whose message isn't in the loaded history, so none disappear
  const orphanProposals = proposals.filter(
    p => !p.messageId || !messages.some(m => m.id === p.messageId)
  )

  const readinessColor =
    readinessScore >= 70 ? '#4ADE80' :
    readinessScore >= 40 ? '#FACC15' : '#EF4444'

  // A fixed full-height column; the message list is the only scroller.
  // Desktop starts after the sidebar; phone matches the nav's 430px column.
  const shellClass = isPhone
    ? 'fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[430px]'
    : 'fixed top-0 right-0'

  // Sits on the keyboard when open, otherwise clears the nav (--bottom-nav-h)
  const shellBottom = keyboardInset > 0
    ? `${keyboardInset}px`
    : (isPhone ? `var(--bottom-nav-h, ${BOTTOM_NAV_HEIGHT}px)` : '0px')

  return (
    <div
      className={`${shellClass} z-30 flex flex-col bg-dark-900`}
      style={{
        bottom: shellBottom,
        left: isPhone ? undefined : SIDEBAR_WIDTH,
        maxWidth: isPhone ? PHONE_MAX_WIDTH : undefined,
      }}
    >

      {/* Header, clearing the status bar itself (fixed, outside AppLayout's inset) */}
      <div className="flex-shrink-0 bg-dark-900
              px-5 pb-3 pt-[calc(1rem+var(--safe-top))] border-b border-dark-700
              flex items-center gap-3">
        <button
          onClick={() => navigate('/ai')}
          className="w-9 h-9 bg-dark-800 border border-dark-600 rounded-full
                     flex items-center justify-center text-white
                     active:scale-90 transition-transform flex-shrink-0"
        >
          ←
        </button>

        <CoachAvatar className="w-9 h-9" />

        <div className="flex-1 min-w-0">
          <h1 className="text-white text-base font-bold">{t('ai.title')}</h1>
          <p className="text-dark-400 text-xs">{t('ai.headerSub')}</p>
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

      {/* Messages — the only scrolling region */}
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-4 pb-4">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-dark-400 text-sm">{t('common.loading')}</div>
          </div>
        ) : messages.length === 0 && proposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center
                          min-h-[200px] text-center px-4">
            <CoachAvatar className="w-16 h-16 mb-4" />
            <p className="text-white font-bold text-lg mb-2">{t('ai.emptyTitle')}</p>
            <p className="text-dark-400 text-sm">{t('ai.emptyBody')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Each card sits under the reply that drafted it (by messageId) */}
            {messages.map(msg => (
              <div key={msg.id} className="flex flex-col gap-4">
                <MessageBubble message={msg} intl={intl} />
                {proposalsFor(msg.id).map(proposal => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onResolved={id => setProposals(prev => prev.filter(p => p.id !== id))}
                  />
                ))}
              </div>
            ))}
            {/* Cards not attached to a loaded message, so an acceptable plan is never lost */}
            {orphanProposals.map(proposal => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                onResolved={id => setProposals(prev => prev.filter(p => p.id !== id))}
              />
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex gap-3 mt-4">
            <CoachAvatar className="w-8 h-8" />
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

      </div>

      {/* Input — rides at the bottom of the shell, so it rises with the keyboard */}
      <div
        className="flex-shrink-0 bg-dark-900 px-4 pt-3 border-t border-dark-700"
        style={{
          // Clear the home indicator only when neither the keyboard nor the nav covers it
          paddingBottom: keyboardInset > 0 || isPhone
            ? 12
            : 'calc(var(--safe-bottom) + 12px)',
        }}
      >
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
              placeholder={t('ai.placeholder')}
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

function MessageBubble({ message, intl }: { message: Message; intl: string }) {
  const isUser = message.sender === 'user'
  const time = new Date(message.dateTime).toLocaleTimeString(intl, {
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
      <CoachAvatar className="w-8 h-8 mt-1" />
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
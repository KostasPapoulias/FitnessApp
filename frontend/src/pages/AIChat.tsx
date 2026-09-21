// At the top of AIChat.tsx — replace the existing imports and add these
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
  // Router state covers in-app navigation; `?ask=` covers arrivals from outside
  // the app, where no state can be attached — a tapped push notification opens
  // a URL and nothing else, so the topic has to travel in the query string.
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
  // Cards the coach has drafted and the athlete has not yet acted on. Kept
  // beside the messages rather than inside them: a proposal has its own
  // lifecycle — it can be applied, dismissed or expire — while a message never
  // changes once sent.
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

  // Load history for this specific thread. Guarded by a ref because adopting
  // the real thread id changes the route param, and re-fetching then would
  // clobber the messages already on screen.
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
        // Anything still awaiting a decision comes back with the conversation,
        // so a card scrolled past is not lost on reload.
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

  // Also re-pin to the bottom when the keyboard opens, so the latest message
  // isn't left behind the newly-raised input bar.
  //
  // The message list is scrolled directly rather than through
  // `scrollIntoView()` on a trailing marker. `scrollIntoView` walks EVERY
  // scrollable ancestor up to the document, and on a phone that included the
  // document itself — so posting a message scrolled the page behind this fixed
  // shell, which on iOS collapses the URL bar, resizes the viewport under a
  // `position: fixed` element and leaves the bottom of the chat (where a
  // proposal card's buttons sit) somewhere other than where it is drawn.
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

      // First message of an unsaved chat — adopt the id the server just
      // created so follow-ups land in the same thread and a refresh works.
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
        // Stamped with the id of the message just added, because the server
        // binds them to the stored assistant row only after it has replied —
        // the copies returned here carry no messageId yet. Without this the
        // card has nothing to sit next to and falls to the end of the thread,
        // which is where it used to jump to on every later message.
        setProposals(prev => [
          ...prev,
          ...data.proposals.map((p: AiProposal) => ({ ...p, messageId: p.messageId ?? aiMsg.id })),
        ])
      }
    } catch (err: any) {
      // 429 is the daily AI budget or the per-minute rate limit. The server
      // already phrases those for a human, so show its reason rather than
      // burying a real limit under "something went wrong".
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

  // Cards with no message of their own, kept so nothing silently disappears.
  const orphanProposals = proposals.filter(
    p => !p.messageId || !messages.some(m => m.id === p.messageId)
  )

  const readinessColor =
    readinessScore >= 70 ? '#4ADE80' :
    readinessScore >= 40 ? '#FACC15' : '#EF4444'

  // The shell is a fixed, full-height flex column so the message list can own
  // the scrolling. Previously the header/input were independently `fixed` and
  // the list used guessed padding, which let messages slide under both.
  //
  // Desktop: start after the sidebar instead of spanning the whole viewport.
  // Phone: mirror the bottom nav's centred 430px column.
  const shellClass = isPhone
    ? 'fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[430px]'
    : 'fixed top-0 right-0'

  // Keyboard open -> sit directly on top of it, letting the bottom nav stay
  // pinned at 0 and be covered. Closed -> clear the nav (phone only).
  // --bottom-nav-h is measured and published by BottomNav.
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

      {/* Header with back button */}
      {/* Fixed to the viewport top, so it sits outside AppLayout's inset and
          has to clear the status bar itself. */}
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
            {/* Each card sits under the reply that drafted it, not at the end
                of the thread. Anchored by `messageId`, which the server stores
                when it saves the reply, so it survives a reopen and stays put
                when the conversation continues past it — floating them at the
                bottom made a plan look like it was drafted in answer to
                whatever was asked last. */}
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
            {/* Anything the messages could not claim: a card whose message is
                older than the twenty this thread replays, or a thread that came
                back with a pending card and no messages at all. Dropping these
                would lose a plan the athlete can still accept. */}
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
          // Clear the home indicator only when nothing else already covers it:
          // the keyboard when it's up, and the bottom nav (which now pads
          // itself out of the inset) when the shell is stacked on top of it.
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
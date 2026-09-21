import { ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { aiService } from '../services/ai.service'
import { settingsService } from '../services/settings.service'
import { useFatigueStore } from '../store/useFatigueStore'
import { NEW_THREAD } from '../constants/chat'
import { MessageKey, useT } from '../i18n'
import CoachAvatar from '../components/chat/CoachAvatar'
import { DumbbellIcon, FlameIcon, MessageIcon, MoonIcon, TargetIcon, TrendingUpIcon, ZapIcon } from '../components/icons'

// The text is also what gets SENT, so a Greek screen asks the coach in Greek.
const SUGGESTED_PROMPTS: { icon: ReactNode; key: MessageKey }[] = [
  { icon: <DumbbellIcon className="w-5 h-5" />, key: 'ai.promptTrainToday' },
  { icon: <MoonIcon className="w-5 h-5" />, key: 'ai.promptRest' },
  { icon: <TrendingUpIcon className="w-5 h-5" />, key: 'ai.promptProgress' },
  { icon: <FlameIcon className="w-5 h-5" />, key: 'ai.promptRecovery' },
  { icon: <TargetIcon className="w-5 h-5" />, key: 'ai.promptGoal' },
  { icon: <ZapIcon className="w-5 h-5" />, key: 'ai.promptOvertraining' },
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
  const { t, tn, intl } = useT()

  const [threads,     setThreads]     = useState<Thread[]>([])
  const [isLoading,   setIsLoading]   = useState(true)
  const [deleteId,    setDeleteId]    = useState<string | null>(null)
  // Undefined until the answer arrives. Defaulting to `true` would flash the
  // "AI knows your current state" card at someone who turned that off, which is
  // the one audience it must never be shown to.
  const [aiConsent,   setAiConsent]   = useState<boolean | undefined>(undefined)

  useEffect(() => {
    aiService.getThreads()
      .then(setThreads)
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    settingsService.getSettings()
      .then(s => setAiConsent(s.aiConsentEnabled))
      // A failed read leaves the card hidden rather than guessing. The gate is
      // enforced server-side either way; this only decides what to promise.
      .catch(() => setAiConsent(undefined))
  }, [])

  // Open the compose screen without persisting anything. The thread is
  // created server-side on the first message, so backing out of an unused
  // chat leaves no trace.
  const startChat = (firstMessage?: string) => {
    navigate(`/ai/chat/${NEW_THREAD}`, { state: { firstMessage } })
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

    if (days === 0) return t('ai.today')
    if (days === 1) return t('ai.yesterday')
    if (days < 7)  return tn('ai.daysAgo', days)
    return date.toLocaleDateString(intl, { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex-1 bg-dark-900 flex flex-col">

      {/* Header */}
      <div className="px-5 pt-4 pb-4">
        <h1 className="text-white text-2xl font-bold">{t('ai.title')}</h1>
        <p className="text-dark-400 text-sm mt-1">
          {aiConsent === false ? t('ai.subtitleGeneral') : t('ai.subtitleContext')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">

        {/* Body state card.
            Consent-off swaps it out entirely rather than dimming it: the card's
            whole claim is "AI knows your current state", and with the data
            withheld that is simply untrue. Showing the readiness number beside
            a coach that cannot see it is the most misleading thing this screen
            could do. */}
        {aiConsent === false ? (
          <div className="bg-dark-800 border border-dark-600 rounded-card p-4 mb-5">
            <div className="mb-2">
              <span className="text-dark-200 text-sm font-semibold">
                {t('ai.noDataTitle')}
              </span>
            </div>
            <p className="text-dark-400 text-xs leading-relaxed mb-3">
              {t('ai.noDataBody')}
            </p>
            <button
              onClick={() => navigate('/profile')}
              className="text-brand-teal text-xs font-semibold active:opacity-70"
            >
              {t('ai.turnOn')}
            </button>
          </div>
        ) : (
          <div className="bg-[#0a2a22] border border-brand-teal/30
                          rounded-card p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CoachAvatar className="w-6 h-6" />
                <span className="text-brand-teal text-sm font-semibold">
                  {t('ai.knowsState')}
                </span>
              </div>
              <div className={`text-lg font-bold ${readinessColor}`}>
                {t('ai.readyPct', { score: readinessScore })}
              </div>
            </div>

            {/* Fatigue context pills */}
            {highFatigue.length > 0 ? (
              <div>
                <p className="text-dark-400 text-xs mb-2">{t('ai.highFatigue')}</p>
                <div className="flex gap-2 flex-wrap">
                  {highFatigue.map(m => (
                    <span key={m.muscleId}
                      className="bg-brand-red/20 border border-brand-red/40
                                 text-brand-red text-xs px-2 py-1 rounded-full">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-red mr-1.5 align-middle" />
                      {m.muscleName} {Math.round(m.fatigueLevel)}%
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-dark-400 text-xs">{t('ai.allRecovered')}</p>
            )}
          </div>
        )}

        {/* Suggested prompts */}
        <div className="mb-5">
          <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
            {t('ai.quickQuestions')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SUGGESTED_PROMPTS.map(prompt => (
              <button
                key={prompt.key}
                onClick={() => startChat(t(prompt.key))}
                className="bg-dark-800 border border-dark-600 rounded-card
                           p-3 text-left active:scale-95 transition-all
                           active:border-brand-teal/50 active:bg-brand-teal/5
                           disabled:opacity-50"
              >
                <span className="block mb-1.5 text-brand-teal">{prompt.icon}</span>
                <span className="text-dark-200 text-xs leading-relaxed">
                  {t(prompt.key)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* New chat button */}
        <button
          onClick={() => startChat()}
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
          {t('ai.newChat')}
        </button>

        {/* Chat history */}
        {!isLoading && threads.length > 0 && (
          <div>
            <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
              {t('ai.recentChats')}
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
                          <MessageIcon className="w-5 h-5 text-brand-teal" />
                        </div>

                        {/* Info */}
                        <button
                          onClick={() => navigate(`/ai/chat/${thread.id}`)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="text-white text-sm font-semibold truncate">
                            {thread.title ?? t('ai.untitled')}
                          </p>
                          {lastMsg && (
                            <p className="text-dark-400 text-xs mt-0.5 truncate">
                              {lastMsg.sender === 'user' ? t('ai.senderYou') : t('ai.senderAi')}
                              {lastMsg.messageText}
                            </p>
                          )}
                          <p className="text-dark-500 text-xs mt-1">
                            {formatDate(thread.createdAt)}
                            {' · '}
                            {tn('ai.messages', thread._count.messages)}
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
                        <p className="text-white text-sm mb-3">{t('ai.deleteChat')}</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDeleteId(null)}
                            className="flex-1 bg-dark-700 text-dark-300
                                       border border-dark-600 py-2.5 rounded-btn
                                       text-sm">
                            {t('common.cancel')}
                          </button>
                          <button
                            onClick={() => handleDelete(thread.id)}
                            className="flex-1 bg-brand-red text-white font-semibold
                                       py-2.5 rounded-btn text-sm">
                            {t('common.delete')}
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
            <p className="text-dark-500 text-sm">{t('ai.noChats')}</p>
            <p className="text-dark-600 text-xs mt-1">{t('ai.startAbove')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
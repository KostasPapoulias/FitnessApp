import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { progressService } from '../services/progress.service'
import { HistoryRow } from '../types'

/**
 * Workout history, newest first.
 *
 * The calendar could answer "what did I do on the 14th". This answers "what have
 * I been doing" — a different question that a month grid cannot express, because
 * the interesting spans cross month boundaries and most days are empty.
 *
 * Cursor-paged rather than offset-paged, and rows are lean: names and totals,
 * with the sets fetched only when a session is opened in the calendar. The old
 * `getSessions` deep-included every set of every modality for fifty sessions,
 * which is what made paging it impossible in the first place.
 */

const fmtDate = (iso: string) => {
  const date = new Date(iso)
  const today = new Date()
  const sameYear = date.getFullYear() === today.getFullYear()
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

const fmtDuration = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`

/**
 * The one-line summary of what a session was.
 *
 * Built from what the session actually contains rather than from a stored label:
 * a run shows its distance, lifting shows its tonnage, and anything with neither
 * falls back to sets. A row that says "0 kg" for an hour of mobility work reads
 * as a bug in the app rather than as a description of the session.
 */
const summarise = (session: HistoryRow): string => {
  const parts: string[] = [`${session.setCount} set${session.setCount === 1 ? '' : 's'}`]
  if (session.distanceKm > 0) parts.unshift(`${session.distanceKm} km`)
  if (session.totalVolume > 0) parts.push(`${session.totalVolume.toLocaleString()} kg`)
  if (session.avgRpe != null) parts.push(`RPE ${session.avgRpe}`)
  return parts.join(' · ')
}

const MODALITY_FILTERS = ['All', 'Strength', 'Calisthenics', 'Cardio', 'Mobility', 'WOD']

export default function History() {
  const navigate = useNavigate()

  const [sessions, setSessions] = useState<HistoryRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('All')

  // Refetches from scratch when the filter changes. Keeping the loaded pages and
  // filtering them on the client would page through a filtered list using
  // cursors from an unfiltered one, which skips rows.
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    progressService.getHistory({ modality: filter === 'All' ? undefined : filter })
      .then(page => {
        if (cancelled) return
        setSessions(page.sessions)
        setCursor(page.nextCursor)
        setHasMore(page.nextCursor != null)
      })
      .catch(() => { if (!cancelled) setError('Could not load your history.') })
      .finally(() => { if (!cancelled) setIsLoading(false) })

    return () => { cancelled = true }
  }, [filter])

  const loadMore = () => {
    if (!cursor || isLoadingMore) return
    setIsLoadingMore(true)
    progressService.getHistory({
      cursor,
      modality: filter === 'All' ? undefined : filter,
    })
      .then(page => {
        setSessions(prev => [...prev, ...page.sessions])
        setCursor(page.nextCursor)
        setHasMore(page.nextCursor != null)
      })
      .catch(() => setError('Could not load more.'))
      .finally(() => setIsLoadingMore(false))
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-dark-800 border border-dark-600
                     flex items-center justify-center text-lg text-white">←</button>
        <h1 className="text-xl font-extrabold text-white">History</h1>
      </div>

      {/* Horizontally scrolled rather than wrapped: six chips do not fit a 430px
          phone, and a second row of filters pushes the list below the fold. */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4 pb-1">
        {MODALITY_FILTERS.map(m => (
          <button
            key={m}
            onClick={() => setFilter(m)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap
              transition-colors flex-shrink-0
              ${filter === m ? 'bg-brand-teal text-black' : 'bg-dark-800 text-dark-300 border border-dark-600'}`}
          >
            {m}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-dark-800 rounded-card animate-pulse" />
          ))}
        </div>
      )}

      {error && !isLoading && (
        <div className="bg-dark-800 rounded-card border border-brand-red/30 p-4 mb-3">
          <p className="text-white text-sm">{error}</p>
        </div>
      )}

      {!isLoading && sessions.length === 0 && !error && (
        <div className="bg-dark-800 rounded-card border border-dark-600 p-5">
          <p className="text-white text-sm font-semibold">
            {filter === 'All' ? 'No finished sessions yet' : `No ${filter.toLowerCase()} sessions yet`}
          </p>
          <p className="text-dark-300 text-xs mt-2 leading-relaxed">
            {filter === 'All'
              ? 'Sessions appear here once you finish them. An abandoned session is not kept.'
              : 'Try another modality, or clear the filter.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {sessions.map(session => (
          <button
            key={session.id}
            // The calendar owns the detail view — it already renders sets, runs
            // and the per-day muscle map, and a second detail screen would be
            // two places to fix the same bug. Landing on the session's own day
            // is the closest thing to opening it.
            onClick={() => navigate(`/calendar?date=${session.dateTime.slice(0, 10)}`)}
            className="w-full bg-dark-800 rounded-card border border-dark-600 p-3.5
                       text-left active:bg-dark-700 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-white text-sm font-bold">{fmtDate(session.dateTime)}</p>
                  {session.templateName && (
                    <span className="text-brand-teal text-[10px] font-semibold px-1.5 py-0.5
                                     rounded-badge bg-brand-teal/10 truncate max-w-[120px]">
                      {session.templateName}
                    </span>
                  )}
                </div>
                <p className="text-dark-300 text-xs mt-1 tabular-nums">
                  {fmtDuration(session.duration)} · {summarise(session)}
                </p>
                <p className="text-dark-400 text-[11px] mt-1.5 leading-relaxed line-clamp-2">
                  {session.exercises.map(e => e.name).join(', ') || 'No exercises logged'}
                </p>
              </div>
              <span className="text-dark-400 text-lg leading-none flex-shrink-0">›</span>
            </div>
          </button>
        ))}
      </div>

      {!isLoading && hasMore && sessions.length > 0 && (
        <button
          onClick={loadMore}
          disabled={isLoadingMore}
          className="w-full mt-3 py-3 rounded-btn bg-dark-800 border border-dark-600
                     text-dark-200 text-sm font-semibold active:bg-dark-700 disabled:opacity-50"
        >
          {isLoadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}

      {!isLoading && !hasMore && sessions.length > 0 && (
        <p className="text-dark-400 text-xs text-center mt-4">
          That's all {sessions.length} of them.
        </p>
      )}
    </div>
  )
}

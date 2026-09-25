import { useEffect, useMemo, useState } from 'react'
import { progressService } from '../../services/progress.service'
import { ExerciseHistory, ExerciseHistoryEntry, ExerciseHistorySet } from '../../types'
import { fmtTime } from '../../pages/Workout/helpers'
import { NoteIcon } from '../icons'

/**
 * The athlete's own history with one exercise: best e1RM, top set, average
 * RPE and recent sessions (the latest expanded on arrival).
 */

const fmtDate = (iso: string) => {
  const date = new Date(iso)
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  const label = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  if (days <= 0) return `${label} · today`
  if (days === 1) return `${label} · yesterday`
  return `${label} · ${days} days ago`
}

/** One set as a line, in the units its modality recorded (never "0 kg" for a run). */
const describeSet = (set: ExerciseHistorySet): string => {
  const parts: string[] = []

  if (set.weight != null && set.reps != null) {
    parts.push(`${Math.round(set.weight * 10) / 10}kg × ${set.reps}`)
  } else if (set.weight != null && set.timeSec != null) {
    parts.push(`${Math.round(set.weight * 10) / 10}kg · ${fmtTime(set.timeSec)}`)
  } else if (set.reps != null) {
    parts.push(`${set.reps} reps`)
  }

  if (set.rounds != null) parts.push(`${set.rounds} rounds`)
  if (set.distanceKm != null) parts.push(`${set.distanceKm} km`)
  if (set.timeSec != null && set.weight == null) parts.push(fmtTime(set.timeSec))

  return parts.length > 0 ? parts.join(' · ') : '—'
}

const Tile = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className={`rounded-xl p-3 text-center ${
    accent ? 'bg-[#0d2218] border border-brand-teal/30' : 'bg-dark-700'
  }`}>
    <p className={`text-lg font-bold tabular-nums ${accent ? 'text-brand-teal' : 'text-white'}`}>
      {value}
    </p>
    <p className="text-dark-400 text-xs mt-1">{label}</p>
  </div>
)

export default function ExerciseHistoryCard({ exerciseId }: { exerciseId: string }) {
  const [history, setHistory] = useState<ExerciseHistory | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    progressService.getExerciseHistory(exerciseId)
      .then(data => {
        if (cancelled) return
        setHistory(data)
        // Most recent entry open on arrival
        setOpenId(data.entries[0]?.sessionId ?? null)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [exerciseId])

  // Averaged over rated sets only; RPE is optional
  const avgRpe = useMemo(() => {
    if (!history) return null
    const rated = history.entries.flatMap(e => e.sets.map(s => s.rpe)).filter((r): r is number => r != null)
    return rated.length === 0 ? null : Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10
  }, [history])

  const topWeight = useMemo(() => {
    if (!history) return null
    const weights = history.entries.map(e => e.topWeight).filter((w): w is number => w != null)
    return weights.length === 0 ? null : Math.max(...weights)
  }, [history])

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">Your History</p>
        <div className="h-20 bg-dark-700 rounded-xl animate-pulse" />
      </div>
    )
  }

  // A failed read is shown as an error, never as an empty history
  if (failed || !history) {
    return (
      <div className="p-4">
        <p className="text-dark-300 text-xs uppercase tracking-wider mb-2">Your History</p>
        <p className="text-dark-400 text-xs">
          Could not load your history for this exercise.
        </p>
      </div>
    )
  }

  if (history.entries.length === 0) {
    return (
      <div className="p-4">
        <p className="text-dark-300 text-xs uppercase tracking-wider mb-2">Your History</p>
        <p className="text-dark-400 text-xs leading-relaxed">
          You have not logged this one yet. Your first session will set the
          reference the app uses to suggest weights.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-dark-300 text-xs uppercase tracking-wider">Your History</p>
        <p className="text-dark-400 text-[11px]">
          {history.sessionCount} session{history.sessionCount === 1 ? '' : 's'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Tile
          label="Est. 1RM"
          value={history.bestE1rm != null ? `${history.bestE1rm}kg` : '—'}
          accent
        />
        <Tile label="Top set" value={topWeight != null ? `${topWeight}kg` : '—'} />
        <Tile label="Avg RPE" value={avgRpe != null ? `${avgRpe}` : '—'} />
      </div>

      <div className="mt-3 space-y-1.5">
        {history.entries.map(entry => (
          <Entry
            key={entry.sessionId}
            entry={entry}
            isOpen={openId === entry.sessionId}
            onToggle={() => setOpenId(openId === entry.sessionId ? null : entry.sessionId)}
          />
        ))}
      </div>

      {history.sessionCount > history.entries.length && (
        <p className="text-dark-400 text-[11px] mt-3">
          Showing the last {history.entries.length} of {history.sessionCount}.
        </p>
      )}
    </div>
  )
}

function Entry({ entry, isOpen, onToggle }: {
  entry: ExerciseHistoryEntry
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div className="bg-dark-700 rounded-xl overflow-hidden border border-dark-600">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left
                   active:bg-dark-600"
      >
        <div className="min-w-0">
          <p className="text-white text-xs font-semibold">{fmtDate(entry.dateTime)}</p>
          <p className="text-dark-400 text-[11px] mt-0.5 flex items-center gap-1">
            {entry.sets.length} set{entry.sets.length === 1 ? '' : 's'}
            {entry.e1rm != null && ` · est. ${entry.e1rm}kg`}
            {/* Flags entries that carry a note */}
            {entry.notes && (
              <span role="img" aria-label="Has a note" className="flex-shrink-0 ml-0.5">
                <NoteIcon className="w-3 h-3 text-brand-teal" />
              </span>
            )}
          </p>
        </div>
        <span className={`text-dark-400 text-base leading-none flex-shrink-0 transition-transform
                         ${isOpen ? 'rotate-90' : ''}`}>›</span>
      </button>

      {isOpen && (
        <div className="px-3 pb-2.5 border-t border-dark-600 pt-2">
          {entry.sets.map(set => (
            <div key={set.setNumber} className="flex items-baseline justify-between py-1">
              <span className="text-dark-400 text-[11px] w-8 flex-shrink-0">#{set.setNumber}</span>
              <span className="text-white text-xs font-medium tabular-nums flex-1">
                {describeSet(set)}
              </span>
              <span className="text-dark-400 text-[11px] tabular-nums flex-shrink-0">
                {set.rpe != null ? `RPE ${set.rpe}` : ''}
              </span>
            </div>
          ))}
          {entry.notes && <NoteLine text={entry.notes} />}
        </div>
      )}
    </div>
  )
}

/** The athlete's note under the sets it was written about. */
function NoteLine({ text }: { text: string }) {
  return (
    <div className="mt-2 pt-2 border-t border-dark-600 flex items-start gap-2">
      <NoteIcon className="w-3.5 h-3.5 text-dark-400 flex-shrink-0 mt-0.5" />
      <p className="text-dark-200 text-xs leading-5 whitespace-pre-wrap break-words min-w-0">
        {text}
      </p>
    </div>
  )
}

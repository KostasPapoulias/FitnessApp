import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { useFatigueStore } from '../../store/useFatigueStore'
import { useNotifications } from '../../hooks/useNotifcations'
import { fmtTime } from './helpers'

interface SnapshotExercise {
  name: string
  emoji: string
  count: number
  topWeight: number
  topReps: number
}
interface Snapshot {
  exercises: SnapshotExercise[]
  muscles: string[]
  setsLogged: number
  elapsed: number
}

export default function Finish() {
  const navigate = useNavigate()
  const location = useLocation()
  const clearExercises = useWorkoutStore(s => s.clearExercises)
  const finishSession = useWorkoutStore(s => s.finishSession)
  const { fetchFatigue } = useFatigueStore()
  const { rescheduleAfterWorkout } = useNotifications()

  const state = location.state as { result?: any; snapshot?: Snapshot } | null
  const snapshot = state?.snapshot

  // This screen owns the finish request. It runs here rather than on the live
  // workout page so there is no End button on screen while we wait — the user
  // cannot trigger a second finish from a page that no longer exists.
  const [result, setResult] = useState<any>(state?.result ?? null)
  // Seeded from the store so the summary never flashes for a frame before the
  // mount effect starts the request.
  const [saving, setSaving] = useState(() => Boolean(useWorkoutStore.getState().sessionId))
  const [saveError, setSaveError] = useState<string | null>(null)
  const startedRef = useRef(false)

  const save = () => {
    // finishSession() de-dupes concurrent calls internally; this ref stops a
    // StrictMode double-mount from even queueing the second one.
    if (startedRef.current) return
    const { sessionId } = useWorkoutStore.getState()
    if (!sessionId) return          // already finished, or arrived without one
    startedRef.current = true
    setSaving(true)
    setSaveError(null)
    finishSession()
      .then(async res => {
        if (res) setResult(res)
        // Best-effort follow-ups: a failure here must not read as a failed save
        try { await fetchFatigue() } catch { /* non-fatal */ }
        try { await rescheduleAfterWorkout(3) } catch { /* non-fatal */ }
      })
      .catch(err => {
        console.error('finish error:', err)
        startedRef.current = false   // allow a retry
        setSaveError('Your sets are saved, but the workout summary could not be completed.')
      })
      .finally(() => setSaving(false))
  }

  useEffect(() => {
    if (!snapshot) { navigate('/', { replace: true }); return }
    save()
  }, [snapshot]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!snapshot) return null

  // ── saving ──
  if (saving) {
    return (
      <div className="min-h-dvh bg-dark-900 flex items-center justify-center px-5">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">💾</div>
          <p className="text-white font-semibold">Saving your workout...</p>
          <p className="text-dark-300 text-[13px] mt-2">
            Every set you logged is already stored — just finishing up.
          </p>
        </div>
      </div>
    )
  }

  const durationSec = result?.duration ?? snapshot.elapsed
  const volume = result?.totalVolume
    ?? snapshot.exercises.reduce((v, e) => v + e.topWeight * e.topReps * e.count, 0)
  const avgRpe = result?.avgRpe

  // Prefer backend musclesAffected (has fatigue level) else snapshot names
  const muscleChips: string[] =
    result?.musclesAffected?.map((m: any) => m.muscleName) ?? snapshot.muscles

  const volumeLabel = volume >= 1000
    ? `${Math.round(volume / 100) / 10}k`
    : String(Math.round(volume))

  const stats = [
    { value: fmtTime(durationSec), label: 'Duration' },
    { value: String(snapshot.setsLogged), label: 'Sets logged' },
    { value: volumeLabel, label: 'Volume (kg)' },
  ]

  const coachTip =
    avgRpe != null && avgRpe >= 8
      ? `You pushed hard today (avg RPE ${avgRpe}) — prioritise sleep tonight; those muscle groups will need 48h+ before hitting them hard again.`
      : snapshot.setsLogged === 0
      ? 'No sets logged this time. Even a short session counts — come back stronger.'
      : 'Great session. Log a protein-rich meal within the next couple of hours to kick off recovery.'

  const handleDone = () => {
    clearExercises()
    navigate('/')
  }

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-5 pt-14 pb-8 text-center">
      <div className="text-[56px] leading-none">🏆</div>
      <h1 className="text-[26px] font-extrabold mt-3">Workout Complete</h1>
      <p className="text-dark-300 text-sm mt-1">Nice work. Here's how today went.</p>

      {saveError && (
        <div className="mt-4 text-left flex flex-col gap-2.5 rounded-card border
                        border-brand-red/40 bg-[#2a1a1a] px-4 py-3.5">
          <div className="flex gap-2.5">
            <span className="text-base">⚠️</span>
            <p className="flex-1 text-[13px] text-white leading-snug">{saveError}</p>
          </div>
          <button
            onClick={save}
            className="w-full py-2.5 rounded-btn bg-brand-teal text-black text-[13px]
                       font-bold active:scale-95 transition-transform">
            Retry
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5 mt-6">
        {stats.map(s => (
          <div key={s.label} className="bg-dark-800 border border-dark-600 rounded-card py-4 px-1.5">
            <p className="text-xl font-extrabold">{s.value}</p>
            <p className="text-dark-300 text-[11px] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Muscle chips */}
      {muscleChips.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center mt-4">
          {muscleChips.map(m => (
            <span key={m}
              className="px-3 py-1.5 rounded-full bg-dark-800 border border-dark-600
                         text-xs text-dark-200">
              {m}
            </span>
          ))}
        </div>
      )}

      {/* Per-exercise summary */}
      {snapshot.exercises.length > 0 && (
        <div className="text-left mt-5 flex flex-col gap-2.5">
          {snapshot.exercises.map((e, i) => (
            <div key={i}
              className="flex items-center gap-3 bg-dark-800 border border-dark-600
                         rounded-card px-4 py-3.5">
              <span className="text-xl">{e.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[14.5px] font-bold truncate">{e.name}</p>
                <p className="text-xs text-dark-300 mt-0.5">
                  {e.count} sets · top {e.topWeight}kg × {e.topReps}
                </p>
              </div>
              <span className="text-brand-green text-base">✓</span>
            </div>
          ))}
        </div>
      )}

      {/* Coach */}
      <div className="text-left mt-4 flex gap-2.5 bg-[#0a2a22] border border-brand-teal/25 rounded-card p-3.5">
        <span className="text-base">🤖</span>
        <div>
          <p className="text-[10px] tracking-wide text-brand-teal font-bold mb-1">
            COACH · POWERED BY GEMINI
          </p>
          <p className="text-[13px] text-dark-200 leading-relaxed">{coachTip}</p>
        </div>
      </div>

      <button
        onClick={handleDone}
        className="w-full mt-6 py-[17px] rounded-card bg-brand-teal text-black
                   text-base font-extrabold active:scale-95 transition-transform">
        Save &amp; Finish
      </button>
    </div>
  )
}

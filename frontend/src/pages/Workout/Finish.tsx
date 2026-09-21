import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { useFatigueStore } from '../../store/useFatigueStore'
import { useNotifications } from '../../hooks/useNotifcations'
import SaveToCalendar from '../../components/workout/SaveToCalendar'
import { fmtTime } from './helpers'
import { AlertTriangleIcon, TrophyIcon } from '../../components/icons'
import { ModalityIcon } from '../../components/icons'

interface SnapshotExercise {
  name: string
  modality: string
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
  /**
   * Whether the save animation has finished handing over.
   *
   * Separate from `saving` because the two end at different moments: the
   * request resolves, and only then does the card fly into the Calendar tab.
   * Seeded true when there is nothing to save — arriving here on an already
   * finished session should show the summary at once, not perform a toss for
   * a workout that was filed minutes ago.
   */
  const [settled, setSettled] = useState(() => !useWorkoutStore.getState().sessionId)

  const save = () => {
    // finishSession() de-dupes concurrent calls internally; this ref stops a
    // StrictMode double-mount from even queueing the second one.
    if (startedRef.current) return
    const { sessionId } = useWorkoutStore.getState()
    if (!sessionId) return          // already finished, or arrived without one
    startedRef.current = true
    setSaving(true)
    setSaveError(null)
    setSettled(false)   // a retry earns the animation again
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
  // Held past the request itself. `settled` is what the landing sets, so the
  // summary cannot replace the screen mid-arc; on a failure the flight is
  // skipped and the error banner below is reached immediately.
  if (saving || !settled) {
    return (
      <SaveToCalendar
        pending={saving}
        failed={Boolean(saveError)}
        onSettled={() => setSettled(true)}
        sets={snapshot.setsLogged}
        durationLabel={fmtTime(result?.duration ?? snapshot.elapsed)}
      />
    )
  }

  const durationSec = result?.duration ?? snapshot.elapsed
  const volume = result?.totalVolume
    ?? snapshot.exercises.reduce((v, e) => v + e.topWeight * e.topReps * e.count, 0)

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

  const handleDone = () => {
    clearExercises()
    navigate('/')
  }

  return (
    <div className="flex-1 bg-dark-900 text-white px-5 pt-14 pb-8 text-center">
      <TrophyIcon className="w-14 h-14 mx-auto text-brand-teal" />
      <h1 className="text-[26px] font-extrabold mt-3">Workout Complete</h1>
      <p className="text-dark-300 text-sm mt-1">Nice work. Here's how today went.</p>

      {saveError && (
        <div className="mt-4 text-left flex flex-col gap-2.5 rounded-card border
                        border-brand-red/40 bg-[#2a1a1a] px-4 py-3.5">
          <div className="flex gap-2.5">
            <AlertTriangleIcon className="w-4 h-4" />
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
              <ModalityIcon modality={e.modality} className="w-5 h-5 text-brand-teal" />
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

      <button
        onClick={handleDone}
        className="w-full mt-6 py-[17px] rounded-card bg-brand-teal text-black
                   text-base font-extrabold active:scale-95 transition-transform">
        Save &amp; Finish
      </button>
    </div>
  )
}

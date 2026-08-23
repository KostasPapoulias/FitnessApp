import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { progressService } from '../../services/progress.service'
import { exerciseEmoji, fmtTime } from './helpers'

type TargetType = 'distance' | 'time'

export default function CardioPlan() {
  const navigate = useNavigate()
  const { selectedExercises, setCardioTarget } = useWorkoutStore()
  const activity = selectedExercises[0]

  const [targetType, setTargetType] = useState<TargetType>('distance')
  const [distanceKm, setDistanceKm] = useState(5)   // km
  const [timeMin, setTimeMin] = useState(30)        // minutes
  const [recent, setRecent] = useState<{ distance: number; time: number } | null>(null)

  // Pre-fill from the athlete's most recent session of THIS activity.
  //
  // Asks for one exercise's history rather than for whole sessions. The version
  // this replaces called `getRecentSessions(20)`, which deep-included every set
  // of every modality for twenty sessions — measured at 122 KB and ~12 s — and
  // then scanned it in the browser for two numbers. The same answer is 0.8 KB.
  useEffect(() => {
    if (!activity) return
    let cancelled = false

    progressService.getExerciseHistory(activity.exercise.id, 1)
      .then(history => {
        if (cancelled) return

        // `entries` is newest-first and `limit: 1` asks for one session, so the
        // first cardio set in it is the most recent one performed.
        const set = history.entries[0]?.sets.find(
          s => s.distanceKm != null || s.timeSec != null
        )
        if (!set) return

        const dist = set.distanceKm ?? 0
        const time = set.timeSec ?? 0
        setRecent({ distance: dist, time })
        if (dist > 0) setDistanceKm(Math.round(dist * 2) / 2)
        if (time > 0) setTimeMin(Math.max(5, Math.round(time / 60)))
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [activity?.exercise.id])

  if (!activity) {
    return (
      <div className="min-h-dvh bg-dark-900 flex items-center justify-center px-5">
        <div className="text-center">
          <p className="text-white text-lg mb-4">No activity selected</p>
          <button onClick={() => navigate('/workout/start')}
            className="bg-brand-teal text-black px-6 py-3 rounded-btn font-bold">Start Workout</button>
        </div>
      </div>
    )
  }

  const start = () => {
    const target = targetType === 'distance'
      ? { type: 'distance' as const, value: distanceKm }
      : { type: 'time' as const, value: timeMin * 60 }
    setCardioTarget(target)
    navigate('/workout/active')
  }

  const bigStep = 'w-11 h-11 rounded-btn border border-dark-600 bg-dark-700 text-white text-2xl font-bold ' +
    'flex items-center justify-center active:scale-90 transition-transform flex-shrink-0'

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-5 pt-6 pb-28 overflow-y-auto">
      {/* header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full border border-dark-600 bg-dark-800 text-lg
                     flex items-center justify-center active:scale-90 transition-transform">←</button>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl">{exerciseEmoji(activity.exercise)}</span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-tight truncate">{activity.exercise.name}</h1>
            <p className="text-dark-300 text-[13px]">Set your target</p>
          </div>
        </div>
      </div>

      {/* recent */}
      <div className="flex gap-2.5 bg-dark-800 border border-dark-600 rounded-card p-3.5 mb-6">
        <span className="text-base">📊</span>
        <p className="text-[13px] text-dark-200 leading-relaxed">
          {recent
            ? <>Last time: <span className="text-white font-bold">{recent.distance.toFixed(2)} km</span>
                {recent.time > 0 && <> · <span className="text-white font-bold">{fmtTime(recent.time)}</span></>} — aim for the same or beat it.</>
            : <>No past {activity.exercise.name.toLowerCase()} logged yet. Pick a target to aim for.</>}
        </p>
      </div>

      {/* toggle */}
      <p className="text-[11px] font-bold tracking-[1.4px] text-dark-300 mb-3">TARGET</p>
      <div className="grid grid-cols-2 gap-2 mb-6 p-1 bg-dark-800 border border-dark-600 rounded-btn">
        {(['distance', 'time'] as TargetType[]).map(t => (
          <button key={t} onClick={() => setTargetType(t)}
            className={`py-2.5 rounded-[9px] text-sm font-bold transition-all
                       ${targetType === t ? 'bg-brand-teal text-black' : 'text-dark-200'}`}>
            {t === 'distance' ? 'Distance' : 'Time'}
          </button>
        ))}
      </div>

      {/* stepper */}
      {/* p-6 + gap-6 + a 120px value + two 48px buttons came to 264px against
          the 230px this card has at 320px. */}
      <div className="bg-dark-800 border border-dark-600 rounded-card p-5 mb-6 text-center">
        {targetType === 'distance' ? (
          <>
            <p className="text-[10px] tracking-widest text-dark-300 mb-4">TARGET DISTANCE</p>
            <div className="flex items-center justify-center gap-4">
              <button className={bigStep} onClick={() => setDistanceKm(v => Math.max(0.5, Math.round((v - 0.5) * 2) / 2))}>−</button>
              <div className="flex-1 min-w-0 truncate">
                <span className="text-[42px] font-extrabold leading-none tabular-nums">{distanceKm.toFixed(1)}</span>
                <span className="text-lg font-bold text-dark-300 ml-1">km</span>
              </div>
              <button className={bigStep} onClick={() => setDistanceKm(v => Math.round((v + 0.5) * 2) / 2)}>+</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[10px] tracking-widest text-dark-300 mb-4">TARGET TIME</p>
            <div className="flex items-center justify-center gap-4">
              <button className={bigStep} onClick={() => setTimeMin(v => Math.max(5, v - 5))}>−</button>
              <div className="flex-1 min-w-0 truncate">
                <span className="text-[42px] font-extrabold leading-none tabular-nums">{timeMin}</span>
                <span className="text-lg font-bold text-dark-300 ml-1">min</span>
              </div>
              <button className={bigStep} onClick={() => setTimeMin(v => v + 5)}>+</button>
            </div>
          </>
        )}
      </div>

      {/* coach */}
      <div className="flex gap-2.5 bg-[#0a2a22] border border-brand-teal/25 rounded-card p-3.5 mb-2">
        <span className="text-base">🤖</span>
        <div>
          <p className="text-[10px] tracking-wide text-brand-teal font-bold mb-1">COACH · POWERED BY GEMINI</p>
          <p className="text-[13px] text-dark-200 leading-relaxed">
            Ease into the first few minutes — settle your heart rate into the zone before you push the pace.
          </p>
        </div>
      </div>

      {/* start */}
      <div className="fixed bottom-[calc(var(--bottom-nav-h)+1rem)] left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)] max-w-[390px]">
        <button onClick={start}
          className="w-full py-[17px] rounded-card bg-brand-teal text-black text-[17px] font-extrabold
                     active:scale-95 transition-transform"
          style={{ boxShadow: '0 8px 24px -6px rgba(0,212,170,0.4)' }}>
          Go Live →
        </button>
      </div>
    </div>
  )
}

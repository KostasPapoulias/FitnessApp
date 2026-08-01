import { useEffect, useRef, useState } from 'react'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { fmtTime } from './helpers'
import { ModalityViewProps, CoachTip, LiveStartGate, EffortPrompt } from './LiveShared'

interface Split { km: number | null; sec: number; m: number; auto: boolean }

const stepBtn =
  'w-[34px] h-[34px] rounded-[9px] border border-dark-600 bg-dark-700 text-white ' +
  'text-lg font-bold flex items-center justify-center active:scale-90 transition-transform flex-shrink-0'

export default function CardioView({ onFinish, coachEnabled }: ModalityViewProps) {
  const { selectedExercises, currentExerciseIndex, cardioTarget, completeSet } = useWorkoutStore()
  const activity = selectedExercises[currentExerciseIndex]?.exercise.name ?? 'Outdoor Run'

  const [started, setStarted] = useState(false)
  const [rating, setRating] = useState(false)
  const [ending, setEnding] = useState(false)
  const endingRef = useRef(false)
  const [sec, setSec] = useState(0)
  const [running, setRunning] = useState(true)
  const [meters, setMeters] = useState(0)
  const [cals, setCals] = useState(0)
  const [speed, setSpeed] = useState(2.85) // m/s
  const [splits, setSplits] = useState<Split[]>([])

  const acc = useRef({ running, speed, meters, sec, started, lastSplitSec: 0, lastSplitM: 0 })
  acc.current.running = running
  acc.current.speed = speed
  acc.current.meters = meters
  acc.current.sec = sec
  acc.current.started = started

  useEffect(() => {
    const id = setInterval(() => {
      const a = acc.current
      if (!a.started || !a.running) return
      const nextSec = a.sec + 1
      const nextM = a.meters + a.speed
      setSec(nextSec)
      setMeters(nextM)
      setCals(c => c + 0.058 * a.speed)
      const nextKm = Math.floor(nextM / 1000)
      if (nextKm > Math.floor(a.meters / 1000)) {
        setSplits(s => [...s, { km: nextKm, sec: nextSec - a.lastSplitSec, m: nextKm * 1000, auto: true }])
        a.lastSplitSec = nextSec
        a.lastSplitM = nextKm * 1000
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const lap = () => {
    const a = acc.current
    setSplits(s => [...s, { km: null, sec: a.sec - a.lastSplitSec, m: a.meters - a.lastSplitM, auto: false }])
    a.lastSplitSec = a.sec
    a.lastSplitM = a.meters
  }
  const effort = (d: number) => setSpeed(v => Math.min(4.6, Math.max(1.8, Math.round((v + d) * 100) / 100)))

  // Log a SetCardio (distance in km, time in seconds) so history + fatigue
  // record it. The RPE comes from the athlete — an easy jog and a threshold
  // effort of the same length are not the same training load.
  const endSession = async (rpe: number) => {
    // Ref guard: the summary-set request keeps this button on screen, so a
    // second tap would log the run twice and finish twice.
    if (endingRef.current) return
    endingRef.current = true
    setEnding(true)
    // A failed summary set must not strand the user in the tracker — the
    // Finish screen surfaces the error either way.
    await completeSet({
      distance: Math.round((meters / 1000) * 100) / 100,
      time: sec,
      rpe,
      restSeconds: 0,
    })
    onFinish()
  }

  const km = meters / 1000
  const paceSecPerKm = speed > 0 ? 1000 / speed : 0
  const effortLabel = speed >= 3.6 ? 'Threshold' : speed >= 3.0 ? 'Tempo' : speed >= 2.4 ? 'Easy' : 'Recovery'

  const shownSplits = splits.slice().reverse().slice(0, 4).map((sp, i) => ({
    no: splits.length - i,
    label: sp.auto ? `Km ${sp.km}` : `Lap · ${(sp.m / 1000).toFixed(2)} km`,
    time: fmtTime(sp.sec),
  }))

  const coachTip = km < 0.5
    ? 'Start conservative — hold back for the first km and let your heart rate settle into the zone before you push.'
    : 'Nice rhythm. Keep your cadence quick and light; if breathing stays conversational you can lift the pace on the next split.'

  // goal from the plan
  const goalLabel = cardioTarget
    ? cardioTarget.type === 'distance' ? `${cardioTarget.value} km` : fmtTime(cardioTarget.value)
    : null
  const goalProgress = cardioTarget
    ? cardioTarget.type === 'distance'
      ? Math.min(1, km / cardioTarget.value)
      : Math.min(1, sec / cardioTarget.value)
    : 0

  // ── start gate ──
  if (!started) {
    return (
      <LiveStartGate
        emoji="🏃"
        label="LIVE · CARDIO"
        title={activity}
        detail={goalLabel ? `Target: ${goalLabel}. Press start when you begin moving.` : 'Free run. Press start when you begin moving.'}
        onStart={() => setStarted(true)}
      />
    )
  }

  // ── effort rating (before the set is written) ──
  if (rating) {
    return (
      <EffortPrompt
        emoji="🏃"
        label={`${activity.toUpperCase()} DONE`}
        title="Rate the effort"
        detail="Recovery is driven by how hard that felt, not just how long it took."
        summary={[
          { value: km.toFixed(2), label: 'km' },
          { value: fmtTime(sec), label: 'time' },
          { value: fmtTime(paceSecPerKm), label: 'pace / km' },
        ]}
        initial={6}
        busy={ending}
        onConfirm={endSession}
      />
    )
  }

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-5 pt-4 pb-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-brand-red text-xs font-bold tracking-wide">
          <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" />
          {running ? 'LIVE · RUNNING' : 'PAUSED · RUNNING'}
        </div>
        <div className="text-[13px] text-dark-300 font-semibold">🏃 {activity}</div>
      </div>

      {/* big elapsed */}
      <div className="text-center mt-3.5">
        <div className="text-[11px] tracking-[0.1em] text-dark-300">ELAPSED</div>
        <div className="text-[66px] font-extrabold leading-[1.05] tracking-tight">{fmtTime(sec)}</div>
      </div>

      {/* goal progress */}
      {goalLabel && (
        <div className="mt-2">
          <div className="flex justify-between text-[11px] text-dark-300 mb-1.5">
            <span>Target · {goalLabel}</span>
            <span className="text-brand-teal font-bold">{Math.round(goalProgress * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-dark-700 overflow-hidden">
            <div className="h-full bg-brand-teal transition-all" style={{ width: `${goalProgress * 100}%` }} />
          </div>
        </div>
      )}

      {/* stats */}
      <div className="grid grid-cols-3 gap-2.5 mt-4">
        {[
          { v: km.toFixed(2), u: 'km' },
          { v: fmtTime(paceSecPerKm), u: 'min / km' },
          { v: String(Math.round(cals)), u: 'kcal' },
        ].map(s => (
          <div key={s.u} className="bg-dark-800 border border-dark-600 rounded-card py-3.5 px-1.5 text-center">
            <div className="text-2xl font-extrabold">{s.v}</div>
            <div className="text-[10.5px] text-dark-300 mt-1">{s.u}</div>
          </div>
        ))}
      </div>

      {/* route map placeholder */}
      <div className="relative w-full h-[190px] mt-3.5 rounded-card overflow-hidden border border-dark-600
                      bg-gradient-to-br from-dark-800 to-dark-700 flex items-center justify-center">
        <span className="text-dark-500 text-sm">🗺️ Route map</span>
        <div className="absolute left-3 bottom-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full
                        bg-dark-900/80 border border-dark-600">
          <span className="w-2 h-2 rounded-full bg-brand-teal" style={{ boxShadow: '0 0 0 4px rgba(0,212,170,0.25)' }} />
          <span className="text-xs font-bold">{running ? 'GPS locked · tracking' : 'GPS paused'}</span>
        </div>
      </div>

      {/* effort */}
      <div className="mt-3.5 bg-dark-800 border border-dark-600 rounded-card px-4 py-3.5
                      flex items-center justify-between">
        <div>
          <div className="text-[10px] tracking-wide text-dark-400">EFFORT · TARGET PACE</div>
          <div className="text-base font-bold mt-0.5">{effortLabel}</div>
        </div>
        <div className="flex items-center gap-2">
          <button className={stepBtn} onClick={() => effort(-0.15)}>−</button>
          <span className="min-w-[58px] text-center text-[15px] font-extrabold">{fmtTime(paceSecPerKm)}/km</span>
          <button className={stepBtn} onClick={() => effort(0.15)}>+</button>
        </div>
      </div>

      {/* splits */}
      <div className="mt-3.5">
        <div className="text-[10px] tracking-widest text-dark-400 mb-2">SPLITS</div>
        <div className="flex flex-col gap-2">
          {shownSplits.length === 0 ? (
            <div className="text-center text-[12.5px] text-dark-400 py-2.5">No splits yet — tap Lap to mark one.</div>
          ) : shownSplits.map(sp => (
            <div key={sp.no} className="flex items-center gap-3 bg-dark-800 border border-dark-600 rounded-btn px-3.5 py-2.5">
              <div className="w-[26px] h-[26px] rounded-badge bg-dark-700 flex items-center justify-center
                              text-xs font-extrabold text-dark-200">{sp.no}</div>
              <div className="flex-1 text-[13.5px] font-semibold">{sp.label}</div>
              <div className="text-sm font-extrabold">{sp.time}</div>
            </div>
          ))}
        </div>
      </div>

      {coachEnabled !== false && <CoachTip text={coachTip} />}

      {/* controls */}
      <div className="grid grid-cols-2 gap-2.5 mt-4">
        <button onClick={() => setRunning(r => !r)}
          className="py-4 rounded-btn text-[15px] font-extrabold active:scale-95 transition-transform"
          style={running
            ? { background: '#2a1a1a', color: '#EF4444', border: '1px solid rgba(239,68,68,0.4)' }
            : { background: '#00D4AA', color: '#000' }}>
          {running ? '‖ Pause' : '▶ Resume'}
        </button>
        <button onClick={lap}
          className="py-4 rounded-btn border border-dark-600 bg-dark-800 text-white text-[15px] font-bold
                     active:scale-95 transition-transform">
          ⚑ Lap
        </button>
      </div>
      <button onClick={() => setRating(true)}
        className="w-full mt-2.5 py-3.5 rounded-btn border border-brand-red/40 bg-[#2a1a1a]
                   text-brand-red text-sm font-bold active:scale-95 transition-transform">
        ■ End Session
      </button>
    </div>
  )
}

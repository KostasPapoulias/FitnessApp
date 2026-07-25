import { useEffect, useRef, useState } from 'react'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { fmtTime } from './helpers'
import { ModalityViewProps, CoachTip, UpNext, LiveStartGate } from './LiveShared'

function isPerSide(name: string) {
  return /stretch|hip|lunge|pigeon|couch|90|thoracic|shoulder|side|twist|rotation/i.test(name)
}

export default function MobilityView({ elapsed, onAdvance, coachEnabled }: ModalityViewProps) {
  const { selectedExercises, currentExerciseIndex, currentSetIndex } = useWorkoutStore()
  const ex = selectedExercises[currentExerciseIndex]
  const set = ex?.sets[currentSetIndex]
  const target = Math.max(5, set?.reps || 30) // mobility PlanSets stores hold time in `reps`

  const [started, setStarted] = useState(false)
  const [secs, setSecs] = useState(target)
  const [paused, setPaused] = useState(false)
  const [side, setSide] = useState<'left' | 'right'>('left')
  const [leftDone, setLeftDone] = useState(false)

  const perSide = ex ? isPerSide(ex.exercise.name) : false

  // refs for the interval closure
  const st = useRef({ paused, side, leftDone, perSide, target, secs, started })
  st.current = { paused, side, leftDone, perSide, target, secs, started }
  const doneRef = useRef(false)

  // reset when the pose (exercise/set) changes
  useEffect(() => {
    setSecs(target); setPaused(false); setSide('left'); setLeftDone(false)
    doneRef.current = false
  }, [currentExerciseIndex, currentSetIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const complete = () => {
    if (doneRef.current) return
    doneRef.current = true
    onAdvance({ reps: st.current.target, weight: 0, rpe: set?.rpe ?? 6, restSeconds: 0 })
  }
  const completeRef = useRef(complete)
  completeRef.current = complete

  // 1s tick
  useEffect(() => {
    const id = setInterval(() => {
      const c = st.current
      if (!c.started || c.paused || doneRef.current) return
      if (c.secs > 1) { setSecs(s => s - 1); return }
      // boundary
      if (c.perSide && !c.leftDone) { setSide('right'); setLeftDone(true); setSecs(c.target) }
      else { completeRef.current() }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  if (!ex || !set) return null

  if (!started) {
    return (
      <LiveStartGate
        emoji="🧘"
        label="MOBILITY FLOW"
        title={ex.exercise.name}
        detail={`${selectedExercises.length} poses · breathe slow and ease into each hold. Press start to begin the flow.`}
        onStart={() => setStarted(true)}
      />
    )
  }

  const circ = 2 * Math.PI * 120
  const frac = target > 0 ? Math.max(0, secs) / target : 0
  const dashOffset = circ * (1 - Math.min(1, frac))

  const nextEx = currentExerciseIndex + 1 < selectedExercises.length
    ? selectedExercises[currentExerciseIndex + 1] : null
  let poseCounter = `Pose ${currentExerciseIndex + 1} of ${selectedExercises.length}`
  if (perSide) poseCounter += ` · ${side === 'left' ? 'Left side' : 'Right side'}`

  const nextLabel = perSide && !leftDone ? 'Switch Side →' : 'Next Pose →'
  const onNext = () => {
    if (perSide && !leftDone) { setSide('right'); setLeftDone(true); setSecs(target) }
    else complete()
  }

  const cue = ex.exercise.description
    || 'Ease into end-range and let the breath do the work — never force a stretch. Aim for a 6–7/10 tension, not pain.'

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-5 pt-4 pb-4">
      {/* header (teal accent for mobility) */}
      <div className="flex justify-between items-start pb-3.5 border-b border-dark-600">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-brand-teal text-xs font-bold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-brand-teal animate-pulse" /> MOBILITY FLOW
          </div>
          <div className="text-[22px] font-extrabold leading-tight mt-2.5 truncate">{ex.exercise.name}</div>
          <div className="text-[12.5px] text-dark-300 mt-0.5">{poseCounter}</div>
        </div>
        <div className="text-right ml-2.5">
          <p className="text-dark-300 text-xs">Session</p>
          <p className="text-xl font-extrabold mt-0.5">{fmtTime(elapsed)}</p>
        </div>
      </div>

      {perSide && (
        <div className="flex gap-2 mt-4">
          {(['left', 'right'] as const).map(sd => {
            const active = side === sd
            const done = sd === 'left' && leftDone && side === 'right'
            return (
              <div key={sd} className="flex-1 text-center py-2.5 rounded-[10px] text-[13px] font-bold border"
                style={{
                  borderColor: active ? '#00D4AA' : '#2A2A2A',
                  background: active ? 'rgba(0,212,170,0.14)' : '#1A1A1A',
                  color: active ? '#00D4AA' : done ? '#4ADE80' : '#888888',
                }}>
                {sd === 'left' ? 'Left' : 'Right'} {done ? '✓' : ''}
              </div>
            )
          })}
        </div>
      )}

      {/* ring */}
      <div className="flex justify-center mt-4.5" style={{ marginTop: 18 }}>
        <div className="relative w-[260px] h-[260px]">
          <svg width="260" height="260" viewBox="0 0 260 260" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="130" cy="130" r="120" fill="none" stroke="#1E1E1E" strokeWidth="13" />
            <circle cx="130" cy="130" r="120" fill="none" stroke="#00D4AA" strokeWidth="13"
              strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[64px] font-extrabold leading-none">{Math.max(0, secs)}</div>
            <div className="text-sm text-dark-300 mt-0.5">seconds left</div>
            <div className="flex items-center gap-2 mt-3 text-brand-teal text-[12.5px] font-semibold">
              <span className="w-3.5 h-3.5 rounded-full bg-brand-teal animate-pulse" />
              {paused ? 'Paused' : 'Breathe slow · in through the nose'}
            </div>
          </div>
        </div>
      </div>

      {/* cue */}
      <div className="mt-2 flex gap-2 bg-dark-800 border border-dark-600 rounded-card px-4 py-3.5">
        <span className="text-base">🧘</span>
        <div className="text-[13px] text-dark-200 leading-relaxed">{cue}</div>
      </div>

      {/* adjust */}
      <div className="flex gap-2 mt-3.5">
        {[-10, 10].map(d => (
          <button key={d} onClick={() => setSecs(s => Math.max(1, s + d))}
            className="flex-1 py-3 rounded-btn border border-dark-600 bg-dark-800 text-white text-sm font-bold
                       active:scale-95 transition-transform">
            {d > 0 ? `+${d}s` : `${d}s`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-2.5">
        <button onClick={() => setPaused(p => !p)}
          className="py-4 rounded-btn border border-dark-600 bg-dark-800 text-white text-[15px] font-bold
                     active:scale-95 transition-transform">
          {paused ? '▶ Resume' : '‖ Pause'}
        </button>
        <button onClick={onNext}
          className="py-4 rounded-btn bg-brand-teal text-black text-[15px] font-extrabold
                     active:scale-95 transition-transform">
          {nextLabel}
        </button>
      </div>

      {coachEnabled !== false && <CoachTip text="Ease into end-range and let the breath do the work — never force a stretch. Aim for a 6–7/10 tension, not pain." />}
      <UpNext
        title={perSide && !leftDone ? `${ex.exercise.name} · Right side` : (nextEx ? nextEx.exercise.name : 'Flow complete')}
        detail={perSide && !leftDone ? `Same pose, other side · ${target}s` : (nextEx ? `Hold · ${Math.max(5, nextEx.sets[0]?.reps || 30)}s` : 'Great work — you’ve moved every joint')}
      />
    </div>
  )
}

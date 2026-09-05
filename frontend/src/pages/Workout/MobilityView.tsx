import { useEffect, useRef, useState } from 'react'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { useLiveCues } from '../../hooks/useLiveCues'
import { cues } from '../../lib/speech'
import { fmtTime } from './helpers'
import { ModalityViewProps, UpNext, LiveStartGate } from './LiveShared'
import { useModalityVoice } from '../../hooks/useModalityVoice'

function isPerSide(name: string) {
  return /stretch|hip|lunge|pigeon|couch|90|thoracic|shoulder|side|twist|rotation/i.test(name)
}

export default function MobilityView({ elapsed, onAdvance, onFinish, registerVoice }: ModalityViewProps) {
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

  // A hold is the one part of the app where the athlete is deliberately still
  // with their eyes shut, so the countdown and the side change have to be
  // audible — reading the ring is exactly what they cannot do.
  const cue = useLiveCues()

  // refs for the interval closure
  const st = useRef({ paused, side, leftDone, perSide, target, secs, started })
  st.current = { paused, side, leftDone, perSide, target, secs, started }
  const doneRef = useRef(false)

  // reset when the pose (exercise/set) changes
  useEffect(() => {
    setSecs(target); setPaused(false); setSide('left'); setLeftDone(false)
    doneRef.current = false
    cue.resetCountdown()
  }, [currentExerciseIndex, currentSetIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  /** What comes after this pose, for the spoken hand-off. */
  const nextPoseName = () => {
    const nx = selectedExercises[currentExerciseIndex + 1]
    return nx ? nx.exercise.name : null
  }

  const complete = () => {
    if (doneRef.current) return
    doneRef.current = true
    cue.buzz('complete')
    cue.interrupt(cues.poseComplete(nextPoseName()))
    // Both sides count. `isPerSide` means the athlete held `target` seconds on
    // the left AND `target` on the right, and logging one of them threw half
    // the time under tension away before it reached the fatigue model.
    const held = st.current.perSide ? st.current.target * 2 : st.current.target
    onAdvance({ reps: held, weight: 0, rpe: set?.rpe ?? 6, restSeconds: 0 })
  }
  const completeRef = useRef(complete)
  completeRef.current = complete

  /** Half-way through a per-side hold: say it, buzz it, restart the clock. */
  const switchSide = () => {
    setSide('right'); setLeftDone(true); setSecs(st.current.target)
    cue.resetCountdown()
    cue.buzz('switch')
    cue.interrupt(cues.switchSide('right'))
  }
  const switchRef = useRef(switchSide)
  switchRef.current = switchSide

  const cueRef = useRef(cue)
  cueRef.current = cue

  // Announce the pose as it opens, so the first thing heard is what to get into
  // rather than a number with no movement attached to it.
  useEffect(() => {
    if (!started || !ex) return
    cue.say(cues.holdStart(ex.exercise.name, target, perSide ? 'left' : undefined))
  }, [started, currentExerciseIndex, currentSetIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // 1s tick
  useEffect(() => {
    const id = setInterval(() => {
      const c = st.current
      if (!c.started || c.paused || doneRef.current) return
      // Counted off the value about to be displayed, not the one on screen —
      // otherwise "one" is spoken while the ring still reads 2 and the hold
      // ends a second after the voice says it has.
      cueRef.current.countdown(c.secs - 1)
      if (c.secs > 1) { setSecs(s => s - 1); return }
      // boundary
      if (c.perSide && !c.leftDone) switchRef.current()
      else { completeRef.current() }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Hands are on the floor in most of these positions, so the screen is the
  // one control the athlete cannot reach. Everything the buttons below do is
  // reachable by voice.
  //
  // Above the early returns, because it is a hook and the two below it are
  // conditional. `onNext` is declared further down and that is fine — the
  // handler only ever runs long after this function has finished.
  useModalityVoice(registerVoice, command => {
    switch (command.kind) {
      case 'pauseRest':  setPaused(true); return true
      case 'resumeRest': setPaused(false); return true
      case 'mark':
      case 'skipRest':
      case 'advance':    onNext(); return true
      default:           return false
    }
  })

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
  // Tapping through has to go via the same two functions as the clock running
  // out, or a manual switch is silent while an automatic one speaks.
  const onNext = () => {
    if (perSide && !leftDone) switchSide()
    else complete()
  }

  const coaching = ex.exercise.description
    || 'Ease into end-range and let the breath do the work — never force a stretch. Aim for a 6–7/10 tension, not pain.'

  return (
    <div className="flex-1 bg-dark-900 text-white px-5 pt-4 pb-4">
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
        <div className="text-[13px] text-dark-200 leading-relaxed">{coaching}</div>
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

      <UpNext
        title={perSide && !leftDone ? `${ex.exercise.name} · Right side` : (nextEx ? nextEx.exercise.name : 'Flow complete')}
        detail={perSide && !leftDone ? `Same pose, other side · ${target}s` : (nextEx ? `Hold · ${Math.max(5, nextEx.sets[0]?.reps || 30)}s` : 'Great work — you’ve moved every joint')}
      />

      <button onClick={onFinish}
        className="w-full mt-3 py-3.5 rounded-btn border border-brand-red/40 bg-[#2a1a1a]
                   text-brand-red text-sm font-bold active:scale-95 transition-transform">
        ■ End Flow
      </button>
    </div>
  )
}

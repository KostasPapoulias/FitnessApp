import { useEffect, useState, useRef } from 'react'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { useSessionPrefsStore } from '../../store/useSessionPrefsStore'
import { hapticCountdownTick } from '../../lib/haptics'
import { announce } from '../../lib/speech'
import { rpeColor } from './helpers'

interface RestTimerProps {
  seconds: number
  setInfo: { exercise: string; setNumber: number; reps: number; weight: number; rpe: number }
  workoutTime: string
  onDone: () => void
  onSkip: () => void
  /** Pause lives in ActiveWorkout so a spoken "pause" can reach it — the voice
   *  session is owned one level up, where it can outlive this screen. */
  paused: boolean
  onPausedChange: (paused: boolean) => void
}

// Small stepper used in the "adjust next set" card
function MiniStep({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-[30px] h-[30px] flex-shrink-0 rounded-[9px] border border-dark-600 bg-dark-700
                 text-white text-lg font-bold flex items-center justify-center
                 active:scale-90 transition-transform">
      {children}
    </button>
  )
}

export default function RestTimer({
  seconds, setInfo, workoutTime, onDone, onSkip, paused, onPausedChange,
}: RestTimerProps) {
  const [remaining, setRemaining] = useState(seconds)
  const [target, setTarget] = useState(seconds)
  const doneRef = useRef(false)
  const onDoneRef = useRef(onDone)
  const pausedRef = useRef(false)

  const { haptic, audio } = useSessionPrefsStore()
  // Read through refs inside the interval: the tick closure is created once per
  // `seconds` change and would otherwise hold whatever the toggles were then.
  const cueRef = useRef({ haptic, audio })
  cueRef.current = { haptic, audio }

  useEffect(() => { onDoneRef.current = onDone }, [onDone])
  useEffect(() => { pausedRef.current = paused }, [paused])

  // Countdown — one tick/second, honouring pause
  useEffect(() => {
    doneRef.current = false
    setTarget(seconds)
    setRemaining(seconds)
    const id = setInterval(() => {
      if (pausedRef.current || doneRef.current) return
      setRemaining(prev => {
        const next = prev - 1
        if (next <= 0) {
          doneRef.current = true
          onDoneRef.current()
          return 0
        }
        // Warning at ten seconds, then a tap on each of the last three, so the
        // athlete can rack up without watching the screen. onDone owns the
        // end-of-rest alert itself.
        if (next === 10 && cueRef.current.audio) void announce('Ten seconds.')
        if (next <= 3 && cueRef.current.haptic) void hapticCountdownTick()
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [seconds])

  const adjust = (delta: number) => {
    doneRef.current = false
    setRemaining(r => Math.max(0, r + delta))
    setTarget(t => Math.max(5, t + delta))
  }

  // ── ring geometry (r = 130 → 280px box) ──
  const radius = 130
  const circumference = 2 * Math.PI * radius
  const frac = target > 0 ? Math.max(0, remaining) / target : 0
  const dashOffset = circumference * (1 - Math.min(1, frac))

  // ── next editable set (from store) ──
  const {
    selectedExercises, currentExerciseIndex, currentSetIndex, updateSet,
  } = useWorkoutStore()
  const curEx = selectedExercises[currentExerciseIndex]
  let nEx = currentExerciseIndex
  let nSet = currentSetIndex + 1
  if (curEx && nSet >= curEx.sets.length) {
    nEx = currentExerciseIndex + 1
    while (nEx < selectedExercises.length && selectedExercises[nEx].skipped) nEx++
    nSet = 0
  }
  const hasNext = nEx < selectedExercises.length
  const nextExObj = hasNext ? selectedExercises[nEx] : null
  const nextSetObj = hasNext ? nextExObj!.sets[nSet] : null
  const nextName = hasNext
    ? (nEx === currentExerciseIndex
        ? `Set ${nSet + 1} · ${curEx!.exercise.name}`
        : `Set 1 · ${nextExObj!.exercise.name}`)
    : ''
  // Calisthenics load is signed — negative is assistance from a band or a
  // machine, which the backend records as such. Clamping it at zero here (and
  // labelling it WEIGHT) is why adjusting an assisted set from the rest timer
  // could never take the load below bodyweight.
  const nextIsCalisthenics = nextExObj?.exercise.modality === 'Calisthenics'
  const loadFloor = (v: number) => nextIsCalisthenics ? v : Math.max(0, v)

  return (
    <div className="flex-1 bg-dark-900 text-white px-5 pt-4 pb-6">

      {/* Header */}
      <div className="flex justify-between items-start pb-3.5 border-b border-dark-600">
        <div className="min-w-0 flex-1">
          <p className="text-xl font-extrabold leading-tight truncate">{setInfo.exercise}</p>
          <p className="text-brand-green text-[12.5px] mt-1">
            ✓ Set {setInfo.setNumber} logged · {setInfo.reps} reps @ {setInfo.weight}kg · RPE {setInfo.rpe}
          </p>
        </div>
        <div className="text-right ml-3">
          <p className="text-dark-300 text-xs">Workout</p>
          <p className="text-xl font-extrabold mt-0.5">{workoutTime}</p>
        </div>
      </div>

      {/* Ring */}
      <div className="flex justify-center mt-5">
        {/* 280px was the page's full content width at 320px — the ring sat
            edge to edge with nothing to spare. It scales down instead now. */}
        <div className="relative w-full max-w-[280px] aspect-square">
          <svg width="100%" height="100%" viewBox="0 0 280 280" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="140" cy="140" r={radius} fill="none" stroke="#1E1E1E" strokeWidth="14" />
            <circle cx="140" cy="140" r={radius} fill="none" stroke="#00D4AA" strokeWidth="14"
              strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[68px] font-extrabold leading-none">{Math.max(0, remaining)}</span>
            <span className="text-dark-300 text-[15px] mt-0.5">seconds</span>
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-dark-300 mt-3">
        Rest target: <span className="text-white font-bold">{target}s</span>
      </p>

      {/* Adjust */}
      <div className="grid grid-cols-4 gap-2 mt-3.5">
        {[-15, -30, 30, 60].map(d => (
          <button key={d} onClick={() => adjust(d)}
            className="py-3 rounded-btn border border-dark-600 bg-dark-800
                       text-white text-sm font-bold active:scale-95 transition-transform">
            {d > 0 ? `+${d}s` : `${d}s`}
          </button>
        ))}
      </div>

      {/* Next set edit */}
      {hasNext && nextSetObj && (
        <div className="mt-4 bg-dark-800 border border-dark-600 rounded-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] tracking-widest text-dark-400">NEXT SET · ADJUST NOW</p>
            <p className="text-xs text-dark-300 max-w-[55%] truncate text-right">{nextName}</p>
          </div>
          {/* Three steppers across can't hold −/value/+ on one line: at 320px
              each column is ~68px inside its padding, which the two buttons
              alone fill. The value takes its own line above them. */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* reps */}
            <div className="bg-dark-700 border border-dark-600 rounded-btn px-1 py-2.5 text-center">
              <p className="text-[10px] tracking-wide text-dark-400 mb-1">REPS</p>
              <p className="text-[17px] font-extrabold tabular-nums mb-1.5">{nextSetObj.reps}</p>
              <div className="flex items-center justify-center gap-1.5">
                <MiniStep onClick={() => updateSet(nEx, nSet, { reps: Math.max(1, nextSetObj.reps - 1) })}>−</MiniStep>
                <MiniStep onClick={() => updateSet(nEx, nSet, { reps: nextSetObj.reps + 1 })}>+</MiniStep>
              </div>
            </div>
            {/* weight */}
            <div className="bg-dark-700 border border-dark-600 rounded-btn px-1 py-2.5 text-center">
              <p className="text-[10px] tracking-wide text-dark-400 mb-1">
                {nextIsCalisthenics ? 'LOAD' : 'WEIGHT'}
              </p>
              <p className="text-[17px] font-extrabold tabular-nums mb-1.5">{nextSetObj.weight}</p>
              <div className="flex items-center justify-center gap-1.5">
                <MiniStep onClick={() => updateSet(nEx, nSet, { weight: loadFloor(Math.round((nextSetObj.weight - 2.5) * 10) / 10) })}>−</MiniStep>
                <MiniStep onClick={() => updateSet(nEx, nSet, { weight: Math.round((nextSetObj.weight + 2.5) * 10) / 10 })}>+</MiniStep>
              </div>
            </div>
            {/* rpe */}
            <div className="bg-dark-700 border border-dark-600 rounded-btn px-1 py-2.5 text-center">
              <p className="text-[10px] tracking-wide text-dark-400 mb-1">RPE</p>
              <button
                onClick={() => updateSet(nEx, nSet, { rpe: (nextSetObj.rpe % 10) + 1 })}
                className="text-xl font-extrabold py-1.5"
                style={{ color: rpeColor(nextSetObj.rpe) }}>
                {nextSetObj.rpe}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* What will actually happen when the timer hits zero. This used to
          promise a vibration unconditionally, including when the toggle was
          off and on devices that cannot vibrate at all. */}
      {(haptic || audio) && (
        <div className="mt-3.5 flex items-center gap-2.5 px-3.5 py-3 rounded-btn border border-dashed border-dark-600">
          <span className="text-[15px]">{haptic ? '📳' : '🔊'}</span>
          <span className="text-[12.5px] text-dark-300">
            {haptic && audio ? 'Phone will vibrate and call the next set'
              : haptic ? 'Phone will vibrate when rest ends'
              : 'Next set will be called out loud'}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-[1fr_1.4fr] gap-2.5 mt-4">
        <button
          onClick={() => onPausedChange(!paused)}
          className="py-4 rounded-btn border border-dark-600 bg-dark-800
                     text-[15px] font-bold active:scale-95 transition-transform">
          {paused ? '▶ Resume' : '‖ Pause'}
        </button>
        <button
          onClick={onSkip}
          className="py-4 rounded-btn bg-brand-teal text-black
                     text-[15px] font-extrabold active:scale-95 transition-transform">
          Skip Rest → Next Set
        </button>
      </div>
    </div>
  )
}

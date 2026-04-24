import { useEffect, useState, useRef } from 'react'

interface RestTimerProps {
  seconds: number
  setInfo: { exercise: string; setNumber: number; reps: number; weight: number; rpe: number }
  nextSet?: { reps: number; weight: number; rpe: number }
  nextExercise?: string
  workoutTime: string
  onDone: () => void
  onSkip: () => void
}

export default function RestTimer({
  seconds, setInfo, nextSet, nextExercise, workoutTime, onDone, onSkip
}: RestTimerProps) {
  const [remaining, setRemaining] = useState(seconds)
  const [target, setTarget] = useState(seconds)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(intervalRef.current!)
          onDone()
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current!) }
  }, [])

  const adjust = (delta: number) => {
    setRemaining(r => Math.max(5, r + delta))
    setTarget(t => Math.max(5, t + delta))
  }

  // SVG ring calculation
  const radius = 78
  const circumference = 2 * Math.PI * radius
  const progress = remaining / target
  const dashOffset = circumference * (1 - progress)

  const rpeColors: Record<number, string> = {
    7: '#f97316', 8: '#facc15', 9: '#ef4444', 10: '#ef4444'
  }

  return (
    <div className="min-h-853 bg-dark-900 flex flex-col">

      {/* Top bar */}
      <div className="px-5 pt-4 pb-3 flex justify-between items-center
                      border-b border-dark-700">
        <div>
          <p className="text-white font-bold text-lg">{setInfo.exercise}</p>
          <p className="text-brand-green text-xs mt-0.5">
            ✓ Set {setInfo.setNumber} logged · {setInfo.reps} reps @ {setInfo.weight}kg · RPE {setInfo.rpe}
          </p>
        </div>
        <div className="text-right">
          <p className="text-dark-400 text-xs">Workout</p>
          <p className="text-white font-bold">{workoutTime}</p>
        </div>
      </div>

      {/* Ring timer */}
      <div className="flex-2 flex flex-col items-center justify-center px-5">
        <div className="relative w-48 h-48 mb-6">
          <svg width="192" height="192" viewBox="0 0 192 192"
            className="absolute inset-0">
            {/* Track */}
            <circle cx="96" cy="96" r={radius} fill="none"
              stroke="#1e1e1e" strokeWidth="12" />
            {/* Progress */}
            <circle cx="96" cy="96" r={radius} fill="none"
              stroke="#00D4AA" strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 96 96)"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-white text-5xl font-bold">{remaining}</span>
            <span className="text-dark-300 text-sm">seconds</span>
          </div>
        </div>

        <p className="text-dark-300 text-sm mb-6">
          Rest target: <span className="text-white font-semibold">{target}s</span>
        </p>

        {/* Adjust buttons */}
        <div className="flex gap-3 mb-8 w-full">
          {[-15, -30, +30, +60].map(delta => (
            <button
              key={delta}
              onClick={() => adjust(delta)}
              className="flex-1 bg-dark-800 border border-dark-600 rounded-btn
                         py-3 text-dark-300 text-sm active:scale-95 transition-transform"
            >
              {delta > 0 ? `+${delta}s` : `${delta}s`}
            </button>
          ))}
        </div>

        {/* Next set preview */}
        {(nextSet || nextExercise) && (
          <div className="w-full bg-dark-800 border border-dark-600
                          rounded-card p-4 mb-6">
            <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
              {nextExercise ? 'Next Exercise' : 'Next Set Preview'}
            </p>
            {nextExercise ? (
              <p className="text-white font-semibold">{nextExercise}</p>
            ) : nextSet ? (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Set', value: '—' },
                  { label: 'Reps', value: nextSet.reps },
                  { label: 'Weight', value: `${nextSet.weight}kg` },
                  { label: 'RPE', value: nextSet.rpe },
                ].map(item => (
                  <div key={item.label}
                    className="bg-dark-700 rounded-xl p-3 text-center">
                    <p className="text-dark-400 text-xs mb-1">{item.label}</p>
                    <p className={`font-bold text-sm
                      ${item.label === 'RPE'
                        ? '' : 'text-white'}`}
                      style={item.label === 'RPE'
                        ? { color: rpeColors[Number(item.value)] ?? '#fff' }
                        : {}}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Haptic note */}
        <div className="w-full bg-dark-800 border border-dark-600
                        rounded-xl px-4 py-3 flex items-center gap-2 mb-10">
          <span className="text-base">📳</span>
          <span className="text-dark-400 text-sm">
            Phone will vibrate when rest ends
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 pb-10 flex gap-3">
        <button
          onClick={() => {}}
          className="flex-1 bg-dark-800 border border-dark-600 rounded-btn
                     py-4 text-dark-300 font-semibold active:scale-95 transition-transform"
        >
          ⏸ Pause
        </button>
        <button
          onClick={onSkip}
          className="flex-[2] bg-brand-teal text-black font-bold py-4
                     rounded-btn active:scale-95 transition-transform"
        >
          Skip Rest → Next Set
        </button>
      </div>
    </div>
  )
}
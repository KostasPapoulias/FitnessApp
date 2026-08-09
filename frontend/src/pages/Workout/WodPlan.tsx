import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutStore, WodFormat } from '../../store/useWorkoutStore'

const FORMATS: { id: WodFormat; label: string; blurb: string }[] = [
  { id: 'amrap',   label: 'AMRAP',    blurb: 'As many rounds as possible within the cap' },
  { id: 'fortime', label: 'For Time', blurb: 'Finish the target rounds as fast as you can' },
  { id: 'emom',    label: 'EMOM',     blurb: 'Every minute on the minute' },
  { id: 'rounds',  label: 'Rounds',   blurb: 'A set number of rounds for reps' },
]

function Step({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-[30px] h-[30px] flex-shrink-0 rounded-[9px] border border-dark-600 bg-dark-700 text-white
                 text-lg font-bold flex items-center justify-center active:scale-90 transition-transform
                 disabled:opacity-30">
      {children}
    </button>
  )
}

export default function WodPlan() {
  const navigate = useNavigate()
  const {
    selectedExercises, updateSet, removeExerciseAt, setWodConfig,
  } = useWorkoutStore()

  const [format, setFormat] = useState<WodFormat>('amrap')
  const [capMin, setCapMin] = useState(12)
  const [targetRounds, setTargetRounds] = useState(5)

  const usesCap = format === 'amrap' || format === 'emom'
  const usesRounds = format === 'fortime' || format === 'rounds'

  const start = () => {
    setWodConfig({ format, capSec: capMin * 60, targetRounds })
    navigate('/workout/active')
  }

  if (selectedExercises.length === 0) {
    return (
      <div className="min-h-dvh bg-dark-900 flex items-center justify-center px-5">
        <div className="text-center">
          <p className="text-white text-lg mb-4">No movements selected</p>
          <button onClick={() => navigate('/workout/start')}
            className="bg-brand-teal text-black px-6 py-3 rounded-btn font-bold">Start Workout</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-5 pt-6 pb-28 overflow-y-auto">
      {/* header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full border border-dark-600 bg-dark-800 text-lg
                     flex items-center justify-center active:scale-90 transition-transform">←</button>
        <div>
          <h1 className="text-2xl font-extrabold leading-tight">Build WOD</h1>
          <p className="text-dark-300 text-[13px]">Format · cap · movements</p>
        </div>
      </div>

      {/* format */}
      <p className="text-[11px] font-bold tracking-[1.4px] text-dark-300 mb-3">FORMAT</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        {FORMATS.map(f => {
          const on = format === f.id
          return (
            <button key={f.id} onClick={() => setFormat(f.id)}
              className={`py-3 rounded-btn text-sm font-bold border transition-all
                         ${on ? 'bg-brand-teal text-black border-brand-teal' : 'bg-dark-800 text-dark-200 border-dark-600'}`}>
              {f.label}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-dark-400 mb-6">{FORMATS.find(f => f.id === format)!.blurb}</p>

      {/* cap / rounds */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-dark-800 border border-dark-600 rounded-card px-3 py-4 text-center"
          style={{ opacity: usesCap ? 1 : 0.4 }}>
          <p className="text-[10px] tracking-wide text-dark-400 mb-2.5">TIME CAP (MIN)</p>
          <div className="flex items-center justify-center gap-2.5">
            <Step onClick={() => setCapMin(v => Math.max(1, v - 1))} disabled={!usesCap}>−</Step>
            <span className="flex-1 min-w-0 text-center text-2xl font-extrabold tabular-nums">{capMin}</span>
            <Step onClick={() => setCapMin(v => v + 1)} disabled={!usesCap}>+</Step>
          </div>
        </div>
        <div className="bg-dark-800 border border-dark-600 rounded-card px-3 py-4 text-center"
          style={{ opacity: usesRounds ? 1 : 0.4 }}>
          <p className="text-[10px] tracking-wide text-dark-400 mb-2.5">TARGET ROUNDS</p>
          <div className="flex items-center justify-center gap-2.5">
            <Step onClick={() => setTargetRounds(v => Math.max(1, v - 1))} disabled={!usesRounds}>−</Step>
            <span className="flex-1 min-w-0 text-center text-2xl font-extrabold tabular-nums">{targetRounds}</span>
            <Step onClick={() => setTargetRounds(v => v + 1)} disabled={!usesRounds}>+</Step>
          </div>
        </div>
      </div>

      {/* movements */}
      <p className="text-[11px] font-bold tracking-[1.4px] text-dark-300 mb-3">EACH ROUND</p>
      <div className="flex flex-col gap-2.5">
        {selectedExercises.map((se, ei) => {
          const reps = se.sets[0]?.reps ?? 10
          return (
            <div key={se.exercise.id}
              className="flex items-center gap-3 bg-dark-800 border border-dark-600 rounded-card px-4 py-3">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Step onClick={() => updateSet(ei, 0, { reps: Math.max(1, reps - 1) })}>−</Step>
                <span className="w-[30px] text-center text-lg font-extrabold tabular-nums">{reps}</span>
                <Step onClick={() => updateSet(ei, 0, { reps: reps + 1 })}>+</Step>
              </div>
              <span className="flex-1 min-w-0 text-[15px] font-semibold truncate">{se.exercise.name}</span>
              <button onClick={() => removeExerciseAt(ei)} className="text-dark-400 text-lg px-1">×</button>
            </div>
          )
        })}
        <button onClick={() => navigate('/workout/exercises', { state: { modality: 'WOD', direct: true } })}
          className="w-full py-3.5 rounded-card border border-dashed border-dark-500 bg-dark-800
                     text-dark-200 text-sm font-semibold active:scale-95 transition-transform">
          + Add Movement
        </button>
      </div>

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

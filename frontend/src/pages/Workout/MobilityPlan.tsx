import { useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { exerciseEmoji } from './helpers'

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

export default function MobilityPlan() {
  const navigate = useNavigate()
  const {
    selectedExercises, updateSet, addSet, removeSet, removeExerciseAt,
  } = useWorkoutStore()

  if (selectedExercises.length === 0) {
    return (
      <div className="flex-1 bg-dark-900 flex items-center justify-center px-5">
        <div className="text-center">
          <p className="text-white text-lg mb-4">No flows selected</p>
          <button onClick={() => navigate('/workout/start')}
            className="bg-brand-teal text-black px-6 py-3 rounded-btn font-bold">Start Workout</button>
        </div>
      </div>
    )
  }

  const totalSeconds = selectedExercises.reduce(
    (sum, se) => sum + se.sets.reduce((s, set) => s + (set.reps || 0), 0), 0)

  return (
    <div className="flex-1 bg-dark-900 text-white px-5 pt-6 pb-[var(--tray-clear)] overflow-y-auto">
      {/* header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full border border-dark-600 bg-dark-800 text-lg
                     flex items-center justify-center active:scale-90 transition-transform">←</button>
        <div>
          <h1 className="text-2xl font-extrabold leading-tight">Plan Flow</h1>
          <p className="text-dark-300 text-[13px]">
            {selectedExercises.length} poses · ~{Math.round(totalSeconds / 60)} min of holds
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {selectedExercises.map((se, ei) => {
          const hold = se.sets[0]?.reps ?? 30
          const rounds = se.sets.length
          return (
            <div key={se.exercise.id} className="bg-dark-800 border border-dark-600 rounded-card p-4">
              <div className="flex items-center gap-3 mb-3.5">
                <span className="text-xl">{exerciseEmoji(se.exercise)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold truncate">{se.exercise.name}</p>
                  <p className="text-dark-300 text-xs mt-0.5">{se.exercise.muscles.map(m => m.name).join(' · ') || 'Mobility'}</p>
                </div>
                <button onClick={() => removeExerciseAt(ei)}
                  className="text-dark-400 text-lg px-1">×</button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* hold seconds — applied to every round */}
                <div className="bg-dark-700 border border-dark-600 rounded-btn px-2 py-3 text-center">
                  <p className="text-[10px] tracking-wide text-dark-400 mb-2">HOLD (SEC)</p>
                  <div className="flex items-center justify-center gap-2">
                    <Step onClick={() => se.sets.forEach((_, si) => updateSet(ei, si, { reps: Math.max(5, hold - 5) }))}>−</Step>
                    <span className="flex-1 min-w-0 text-center text-lg font-extrabold tabular-nums">{hold}</span>
                    <Step onClick={() => se.sets.forEach((_, si) => updateSet(ei, si, { reps: hold + 5 }))}>+</Step>
                  </div>
                </div>
                {/* rounds */}
                <div className="bg-dark-700 border border-dark-600 rounded-btn px-2 py-3 text-center">
                  <p className="text-[10px] tracking-wide text-dark-400 mb-2">ROUNDS</p>
                  <div className="flex items-center justify-center gap-2">
                    <Step onClick={() => removeSet(ei, rounds - 1)} disabled={rounds <= 1}>−</Step>
                    <span className="flex-1 min-w-0 text-center text-lg font-extrabold tabular-nums">{rounds}</span>
                    <Step onClick={() => addSet(ei)}>+</Step>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        <button onClick={() => navigate('/workout/exercises', { state: { modality: 'Mobility', direct: true } })}
          className="w-full py-4 rounded-card border border-dashed border-dark-500 bg-dark-800
                     text-dark-200 text-sm font-semibold active:scale-95 transition-transform">
          + Add Flow
        </button>
      </div>

      <div className="fixed bottom-[calc(var(--bottom-nav-h)+1rem)] left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)] max-w-[390px]">
        <button onClick={() => navigate('/workout/active')}
          className="w-full py-[17px] rounded-card bg-brand-teal text-black text-[17px] font-extrabold
                     active:scale-95 transition-transform"
          style={{ boxShadow: '0 8px 24px -6px rgba(0,212,170,0.4)' }}>
          Go Live →
        </button>
      </div>
    </div>
  )
}

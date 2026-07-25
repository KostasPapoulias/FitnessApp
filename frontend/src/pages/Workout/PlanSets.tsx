import { useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { rpeColor, exerciseEmoji, cycleRpe } from './helpers'

// ── small stepper button ──────────────────────────────────────────────────
function Step({ children, onClick, disabled }: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-[34px] h-[34px] rounded-[9px] border border-dark-600 bg-dark-700
                 text-white text-lg font-bold flex items-center justify-center
                 active:scale-90 transition-transform disabled:opacity-30"
    >
      {children}
    </button>
  )
}

export default function PlanSets() {
  const navigate = useNavigate()
  const {
    selectedExercises,
    updateSet, addSet, removeSet, setExerciseRest, removeExerciseAt,
  } = useWorkoutStore()

  // Aggregate stats
  const totalSets = selectedExercises.reduce(
    (sum, se) => sum + (se.skipped ? 0 : se.sets.length), 0
  )
  const estimatedMinutes = Math.max(1, Math.round(
    selectedExercises.reduce((sum, se) =>
      se.skipped ? sum
        : sum + se.sets.reduce((s, set) => s + 35 + set.restSeconds, 0), 0
    ) / 60
  ))

  const handleStart = () => navigate('/workout/active')

  if (selectedExercises.length === 0) {
    return (
      <div className="min-h-dvh bg-dark-900 flex items-center justify-center px-5">
        <div className="text-center">
          <p className="text-white text-lg mb-4">No exercises selected</p>
          <button
            onClick={() => navigate('/workout/browse')}
            className="bg-brand-teal text-black px-6 py-3 rounded-btn font-bold">
            Browse Exercises
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-dark-900 text-white">
      <div className="px-5 pt-4 pb-2">

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-4">
          <button
            onClick={() => navigate('/workout/browse')}
            className="w-10 h-10 rounded-full border border-dark-600 bg-dark-800
                       text-white text-lg flex items-center justify-center
                       flex-shrink-0 active:scale-90 transition-transform"
          >
            ←
          </button>
          <div>
            <h1 className="text-2xl font-extrabold leading-tight">Plan Sets</h1>
            <p className="text-dark-300 text-[13px] mt-0.5">
              {selectedExercises.length} exercises · configure before starting
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {[
            { value: String(totalSets), label: 'Total sets' },
            { value: String(selectedExercises.length), label: 'Exercises' },
            { value: `~${estimatedMinutes}m`, label: 'Est. duration' },
          ].map(s => (
            <div key={s.label}
              className="bg-dark-800 border border-dark-600 rounded-card
                         py-4 px-2 text-center">
              <p className="text-[22px] font-extrabold">{s.value}</p>
              <p className="text-dark-300 text-[11px] mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tip */}
        <div className="flex gap-2.5 bg-[#0a2a22] border border-brand-teal/25
                        rounded-card p-3.5 mb-4">
          <span className="text-base leading-snug">💡</span>
          <p className="text-dark-200 text-[12.5px] leading-relaxed">
            Tap −/+ to adjust each value. Tap{' '}
            <span className="text-brand-teal">copy to remaining</span>{' '}
            to apply a set's numbers to the sets below it.
          </p>
        </div>

        {/* Exercise cards */}
        <div className="flex flex-col gap-4">
          {selectedExercises.map((se, ei) => {
            const ex = se.exercise
            const rest = se.sets[0]?.restSeconds ?? 90
            return (
              <div key={ex.id}
                className="bg-dark-800 border border-dark-600 rounded-card overflow-hidden"
                style={{ opacity: se.skipped ? 0.55 : 1 }}>

                {/* Exercise header */}
                <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                  <div className="w-10 h-10 rounded-[10px] bg-dark-700 flex items-center
                                  justify-center text-xl flex-shrink-0">
                    {exerciseEmoji(ex)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold leading-tight truncate">{ex.name}</p>
                    <p className="text-dark-300 text-xs mt-0.5">{ex.modality}</p>
                  </div>
                  <span className="text-dark-300 text-xs flex-shrink-0">
                    {se.sets.length} set{se.sets.length > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[30px_1fr_1fr_64px_30px] gap-2 px-4 py-1 items-center">
                  <div />
                  <p className="text-[10px] tracking-wider text-dark-400 text-center">REPS</p>
                  <p className="text-[10px] tracking-wider text-dark-400 text-center">
                    {ex.modality === 'Calisthenics' ? 'LOAD' : 'WEIGHT'}
                  </p>
                  <p className="text-[10px] tracking-wider text-dark-400 text-center">RPE</p>
                  <div />
                </div>

                {/* Set rows */}
                {se.sets.map((s, si) => (
                  <div key={si}>
                    <div className="grid grid-cols-[30px_1fr_1fr_64px_30px] gap-2 px-4 py-1.5 items-center">
                      <div className="w-[26px] h-[26px] rounded-badge bg-dark-700 border border-dark-600
                                      flex items-center justify-center text-xs font-bold text-dark-200">
                        {si + 1}
                      </div>
                      {/* reps */}
                      <div className="flex items-center justify-center gap-1">
                        <Step onClick={() => updateSet(ei, si, { reps: Math.max(1, s.reps - 1) })}>−</Step>
                        <span className="min-w-[26px] text-center text-[15px] font-bold">{s.reps}</span>
                        <Step onClick={() => updateSet(ei, si, { reps: s.reps + 1 })}>+</Step>
                      </div>
                      {/* weight */}
                      <div className="flex items-center justify-center gap-1">
                        <Step onClick={() => updateSet(ei, si, { weight: Math.max(0, Math.round((s.weight - 2.5) * 10) / 10) })}>−</Step>
                        <span className="min-w-[30px] text-center text-[15px] font-bold">{s.weight}</span>
                        <Step onClick={() => updateSet(ei, si, { weight: Math.round((s.weight + 2.5) * 10) / 10 })}>+</Step>
                      </div>
                      {/* rpe */}
                      <button
                        onClick={() => updateSet(ei, si, { rpe: cycleRpe(s.rpe) })}
                        className="text-[15px] font-extrabold"
                        style={{ color: rpeColor(s.rpe) }}
                      >
                        {s.rpe}
                      </button>
                      {/* remove */}
                      <button
                        onClick={() => removeSet(ei, si)}
                        disabled={se.sets.length <= 1}
                        className="w-[26px] h-[26px] rounded-badge text-dark-400 text-base
                                   flex items-center justify-center disabled:opacity-30"
                      >
                        ×
                      </button>
                    </div>
                    {si < se.sets.length - 1 && (
                      <div className="text-center pb-1">
                        <button
                          onClick={() => se.sets.forEach((_, j) => {
                            if (j > si) updateSet(ei, j, {
                              reps: s.reps, weight: s.weight, rpe: s.rpe,
                            })
                          })}
                          className="text-dark-400 hover:text-brand-teal text-[11px] transition-colors"
                        >
                          ↓ copy to remaining
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* Rest row */}
                <div className="flex items-center justify-between px-4 py-3 mx-4 mt-2
                                border-t border-dark-600">
                  <div className="flex items-center gap-2 text-dark-200 text-[13.5px]">
                    <span>⏱️</span> Rest between sets
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Step onClick={() => setExerciseRest(ei, rest - 15)}>−</Step>
                    <span className="min-w-[42px] text-center text-[15px] font-bold">{rest}s</span>
                    <Step onClick={() => setExerciseRest(ei, rest + 15)}>+</Step>
                  </div>
                </div>

                {/* Add / remove exercise */}
                <div className="px-4 pb-4 flex gap-2">
                  <button
                    onClick={() => addSet(ei)}
                    className="flex-1 py-3 rounded-btn border border-dashed border-dark-500
                               text-dark-300 text-[13px] font-semibold
                               active:scale-95 transition-transform hover:text-brand-teal
                               hover:border-brand-teal/40"
                  >
                    + Add Set
                  </button>
                  <button
                    onClick={() => removeExerciseAt(ei)}
                    className="px-4 py-3 rounded-btn border border-brand-red/40 bg-[#2a1a1a]
                               text-brand-red text-[13px] font-semibold
                               active:scale-95 transition-transform"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}

          <button
            onClick={() => navigate('/workout/browse')}
            className="w-full py-4 rounded-card border border-dashed border-dark-500
                       bg-dark-800 text-dark-200 text-sm font-semibold
                       active:scale-95 transition-transform"
          >
            + Add Exercise
          </button>
        </div>

        {/* Sticky start */}
        <div className="sticky bottom-0 pt-4 pb-1 mt-5"
          style={{ background: 'linear-gradient(to top, #111 70%, transparent)' }}>
          <button
            onClick={handleStart}
            disabled={totalSets === 0}
            className="w-full py-[18px] rounded-card bg-brand-teal text-black
                       text-[17px] font-extrabold active:scale-95 transition-transform
                       disabled:opacity-40"
            style={{ boxShadow: '0 8px 24px -6px rgba(0,212,170,0.4)' }}
          >
            ▶ Start Workout — {totalSets} sets
          </button>
        </div>
      </div>
    </div>
  )
}

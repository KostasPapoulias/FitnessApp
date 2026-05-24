import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'

// Default sets based on common modality patterns
const DEFAULT_REST = 90

interface SetRow {
  reps: number
  weight: number
  rpe: number
  restSeconds: number
}

function SetTable({
  exerciseName,
  sets,
  onChange,
  modality,
}: {
  exerciseName: string
  sets: SetRow[]
  onChange: (sets: SetRow[]) => void
  modality: string
}) {
  const isCardio    = modality === 'Cardio'
  const isMobility  = modality === 'Mobility'
  const isCalisthenics = modality === 'Calisthenics'

  const updateSet = (index: number, field: keyof SetRow, value: number) => {
    const updated = sets.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
    )
    onChange(updated)
  }

  const addSet = () => {
    const last = sets[sets.length - 1]
    onChange([...sets, { ...last }])
  }

  const removeSet = (index: number) => {
    if (sets.length <= 1) return
    onChange(sets.filter((_, i) => i !== index))
  }

  // Copy values from previous set to all sets below
  const copyDown = (fromIndex: number) => {
    const source = sets[fromIndex]
    const updated = sets.map((s, i) =>
      i > fromIndex ? { ...source } : s
    )
    onChange(updated)
  }

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-card overflow-hidden mb-4">

      {/* Exercise header */}
      <div className="px-4 py-2 border-b border-dark-700 flex items-center gap-3">
        <div className="w-9 h-9 bg-dark-700 rounded-xl flex items-center
                        justify-center text-base flex-shrink-0">
          💪
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            {exerciseName}
          </p>
          <p className="text-dark-400 text-xs">{modality}</p>
        </div>
        <span className="text-dark-500 text-xs">
          {sets.length} set{sets.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Column headers */}
      <div className={`grid gap-2 px-4 py-2 border-b border-dark-700
        ${isCardio || isMobility
          ? 'grid-cols-[32px_1fr_1fr_1fr]'
          : 'grid-cols-[32px_1fr_1fr_1fr_28px]'
        }`}>
        <div />
        {isCardio ? (
          <>
            <p className="text-dark-500 text-[10px] uppercase text-center">Dist (km)</p>
            <p className="text-dark-500 text-[10px] uppercase text-center">Time (min)</p>
            <p className="text-dark-500 text-[10px] uppercase text-center">Rest (s)</p>
          </>
        ) : isMobility ? (
          <>
            <p className="text-dark-500 text-[10px] uppercase text-center">Time (s)</p>
            <p className="text-dark-500 text-[10px] uppercase text-center">Rest (s)</p>
            <p className="text-dark-500 text-[10px] uppercase text-center">RPE</p>
          </>
        ) : (
          <>
            <p className="text-dark-500 text-[10px] uppercase text-center">Reps</p>
            <p className="text-dark-500 text-[10px] uppercase text-center">
              {isCalisthenics ? '+Weight' : 'Weight'}
            </p>
            <p className="text-dark-500 text-[10px] uppercase text-center">RPE</p>
            <div />
          </>
        )}
      </div>

      {/* Set rows */}
      {sets.map((set, i) => (
        <div key={i}>
          <div className={`grid gap-2 px-4 py-2 items-center
            ${isCardio || isMobility
              ? 'grid-cols-[32px_1fr_1fr_1fr]'
              : 'grid-cols-[32px_1fr_1fr_1fr_28px]'
            }`}>

            {/* Set number */}
            <div className="w-7 h-7 bg-dark-700 rounded-lg flex items-center
                            justify-center">
              <span className="text-dark-300 text-xs font-bold">{i + 1}</span>
            </div>

            {isCardio ? (
              <>
                <NumberInput
                  value={set.reps} step={0.5}
                  onChange={v => updateSet(i, 'reps', v)}
                />
                <NumberInput
                  value={set.weight}
                  onChange={v => updateSet(i, 'weight', v)}
                />
                <NumberInput
                  value={set.restSeconds} step={15}
                  onChange={v => updateSet(i, 'restSeconds', v)}
                />
              </>
            ) : isMobility ? (
              <>
                <NumberInput
                  value={set.reps} step={10}
                  onChange={v => updateSet(i, 'reps', v)}
                />
                <NumberInput
                  value={set.restSeconds} step={15}
                  onChange={v => updateSet(i, 'restSeconds', v)}
                />
                <RPEInput
                  value={set.rpe}
                  onChange={v => updateSet(i, 'rpe', v)}
                />
              </>
            ) : (
              <>
                <NumberInput
                  value={set.reps}
                  onChange={v => updateSet(i, 'reps', v)}
                />
                <NumberInput
                  value={set.weight} step={2.5}
                  onChange={v => updateSet(i, 'weight', v)}
                />
                <RPEInput
                  value={set.rpe}
                  onChange={v => updateSet(i, 'rpe', v)}
                />
                {/* Remove set */}
                <button
                  onClick={() => removeSet(i)}
                  className="w-7 h-7 flex items-center justify-center
                             text-dark-600 hover:text-brand-red transition-colors"
                >
                  ×
                </button>
              </>
            )}
          </div>

          {/* Copy down button — appears between sets */}
          {i < sets.length - 1 && (
            <div className="flex justify-center py-0.5">
              <button
                onClick={() => copyDown(i)}
                className="text-[10px] text-dark-600 hover:text-brand-teal
                           transition-colors px-2"
              >
                ↓ copy to remaining
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Rest time for the exercise (global) */}
      <div className="px-4 py-3 border-t border-dark-700 flex items-center
                      justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">⏱️</span>
          <span className="text-dark-300 text-sm">Rest between sets</span>
        </div>
        <div className="flex items-center gap-3 bg-dark-700 rounded-xl
                        px-3 py-1.5">
          <button
            onClick={() => {
              const updated = sets.map(s => ({
                ...s, restSeconds: Math.max(15, s.restSeconds - 15)
              }))
              onChange(updated)
            }}
            className="text-dark-300 text-lg leading-none active:scale-90">
            −
          </button>
          <span className="text-white text-sm font-bold w-10 text-center">
            {sets[0]?.restSeconds ?? DEFAULT_REST}s
          </span>
          <button
            onClick={() => {
              const updated = sets.map(s => ({
                ...s, restSeconds: s.restSeconds + 15
              }))
              onChange(updated)
            }}
            className="text-dark-300 text-lg leading-none active:scale-90">
            +
          </button>
        </div>
      </div>

      {/* Add set button */}
      <div className="px-4 pb-3">
        <button
          onClick={addSet}
          className="w-full bg-dark-700 border border-dashed border-dark-500
                     rounded-xl py-2.5 text-dark-400 text-sm
                     active:scale-95 transition-transform
                     hover:border-brand-teal/40 hover:text-brand-teal"
        >
          + Add Set
        </button>
      </div>
    </div>
  )
}

//  Reusable number input with +/− 
function NumberInput({
  value, onChange, step = 1, min = 0
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
}) {
  return (
    <div className="bg-dark-700 rounded-xl flex items-center justify-between
                    px-2 py-2 gap-1">
      <button
        onClick={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))}
        className="text-dark-300 text-base leading-none w-5 flex items-center
                   justify-center active:scale-90 flex-shrink-0"
      >
        −
      </button>
      <span className="text-white text-xs font-semibold text-center flex-1">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.round((value + step) * 100) / 100)}
        className="text-dark-300 text-base leading-none w-5 flex items-center
                   justify-center active:scale-90 flex-shrink-0"
      >
        +
      </button>
    </div>
  )
}

//  RPE selector 
function RPEInput({ value, onChange }: {
  value: number; onChange: (v: number) => void
}) {
  const colors = ['','#4ade80','#4ade80','#86efac','#86efac',
    '#facc15','#facc15','#f97316','#facc15','#ef4444','#ef4444']

  return (
    <button
      onClick={() => {
        const next = value >= 10 ? 1 : value + 1
        onChange(next)
      }}
      className="rounded-xl py-2 text-xs font-bold text-center
                 bg-dark-700 transition-colors"
      style={{ color: colors[value] }}
    >
      {value}
    </button>
  )
}

// Main Plan Sets  
export default function PlanSets() {
  const navigate = useNavigate()
  const { selectedExercises, updateSets } = useWorkoutStore()

  // Local copy of sets for editing
  const [localSets, setLocalSets] = useState<Record<string, SetRow[]>>(
    Object.fromEntries(
      selectedExercises.map(se => [se.exercise.id, se.sets])
    )
  )

  const handleSetsChange = (exerciseId: string, sets: SetRow[]) => {
    setLocalSets(prev => ({ ...prev, [exerciseId]: sets }))
  }

  const handleStart = () => {
    // Save all sets back to the store
    Object.entries(localSets).forEach(([exerciseId, sets]) => {
      updateSets(exerciseId, sets)
    })
    navigate('/workout/active')
  }

  // Total sets across all exercises
  const totalSets = Object.values(localSets).reduce(
    (sum, sets) => sum + sets.length, 0
  )

  // Estimated duration (rough: 45s per set + rest time)
  const estimatedMinutes = Math.round(
    Object.values(localSets).reduce((sum, sets) =>
      sum + sets.reduce((s, set) => s + 45 + set.restSeconds, 0), 0
    ) / 60
  )

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
    <div className="min-h-853 bg-dark-900 flex flex-col">

      {/* Header */}
      <div className="px-5 pt-4 pb-4 border-b border-dark-700">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate("/workout/browse")}
            className="w-9 h-9 bg-dark-800 border border-dark-600 rounded-full
                       flex items-center justify-center text-white
                       active:scale-90 transition-transform flex-shrink-0"
          >
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-white text-xl font-bold">Plan Sets</h1>
            <p className="text-dark-400 text-xs">
              {selectedExercises.length} exercises · configure before starting
            </p>
          </div>
        </div>

        {/* Summary strip */}
        <div className="flex gap-3">
          <div className="flex-1 bg-dark-800 border border-dark-600
                          rounded-xl p-3 text-center">
            <p className="text-white font-bold text-base">{totalSets}</p>
            <p className="text-dark-400 text-xs">Total sets</p>
          </div>
          <div className="flex-1 bg-dark-800 border border-dark-600
                          rounded-xl p-3 text-center">
            <p className="text-white font-bold text-base">
              {selectedExercises.length}
            </p>
            <p className="text-dark-400 text-xs">Exercises</p>
          </div>
          <div className="flex-1 bg-dark-800 border border-dark-600
                          rounded-xl p-3 text-center">
            <p className="text-white font-bold text-base">
              ~{estimatedMinutes}m
            </p>
            <p className="text-dark-400 text-xs">Est. duration</p>
          </div>
        </div>
      </div>

      {/* Exercise set tables */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-16">

        {/* Quick tip */}
        <div className="bg-dark-800 border border-dark-700 rounded-card
                        px-4 py-3 mb-4 flex items-start gap-2">
          <span className="text-sm flex-shrink-0">💡</span>
          <p className="text-dark-400 text-xs leading-relaxed">
            Tap RPE to cycle through values. Tap "↓ copy to remaining"
            to apply the same values to all sets below.
          </p>
        </div>

        {selectedExercises.map(se => (
          <SetTable
            key={se.exercise.id}
            exerciseName={se.exercise.name}
            modality={se.exercise.modality}
            sets={localSets[se.exercise.id] ?? se.sets}
            onChange={sets => handleSetsChange(se.exercise.id, sets)}
          />
        ))}
      </div>

      {/* Start button */}
      <div className="fixed bottom-12 left-1/2 -translate-x-1/2
                      w-full max-w-[430px] bg-dark-900/95 backdrop-blur
                      border-t border-dark-700 px-5 pb-10 pt-1">
        <button
          onClick={handleStart}
          className="w-full bg-brand-red text-white font-bold py-4
                     rounded-btn text-base active:scale-95 transition-transform
                     flex items-center justify-center gap-2"
        >
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          Start Workout — {totalSets} sets
        </button>
      </div>
    </div>
  )
}
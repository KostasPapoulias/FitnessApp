import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { exerciseService } from '../../services/exercise.service'
import { useWorkoutStore } from '../../store/useWorkoutStore'

export default function ExerciseDetail() {
  const navigate = useNavigate()
  const location = useLocation()
  const exerciseId: string = location.state?.exerciseId

  const { addExercise, removeExercise, selectedExercises } = useWorkoutStore()
  const [exercise, setExercise] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!exerciseId) return
    exerciseService.getById(exerciseId)
      .then(setExercise)
      .finally(() => setIsLoading(false))
  }, [exerciseId])

  const isSelected = selectedExercises.some(
    se => se.exercise.id === exerciseId
  )

  const toggleAdd = () => {
    if (!exercise) return
    if (isSelected) removeExercise(exerciseId)
    else addExercise(exercise)
  }

  if (isLoading) return (
    <div className="min-h-dvh bg-dark-900 flex items-center justify-center">
      <div className="text-dark-300">Loading...</div>
    </div>
  )

  if (!exercise) return (
    <div className="min-h-dvh bg-dark-900 flex items-center justify-center">
      <div className="text-dark-300">Exercise not found</div>
    </div>
  )

  const roleColors: Record<string, string> = {
    Primary:   'bg-brand-red/20 text-brand-red border-brand-red/50',
    Secondary: 'bg-brand-orange/20 text-brand-orange border-brand-orange/50',
    Stabiliser: 'bg-dark-600 text-dark-200 border-dark-500',
  }

  return (
    <div className="min-h-dvh bg-dark-900 flex flex-col">

      {/* Header */}
      <div className="px-5 pt-14 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 bg-dark-800 rounded-full flex items-center
                     justify-center text-white border border-dark-600">
          ←
        </button>
        <h1 className="text-white text-xl font-bold flex-1">Exercise Detail</h1>
        <button className="text-brand-yellow text-2xl">⭐</button>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">

        {/* Hero */}
        <div className="mx-5 bg-dark-800 rounded-card overflow-hidden border border-dark-600">
          <div className="bg-[#0d2218] p-6 text-center border-b border-dark-600">
            <div className="text-5xl mb-3">💪</div>
            <h2 className="text-white text-2xl font-bold">{exercise.name}</h2>
            <div className="flex justify-center gap-2 mt-3 flex-wrap">
              <span className="bg-brand-teal text-black text-xs font-bold
                               px-3 py-1 rounded-full">
                AI ✦ Recommended
              </span>
              <span className="bg-dark-700 text-dark-300 text-xs px-3 py-1 rounded-full">
                {exercise.modality}
              </span>
            </div>
          </div>

          {/* Muscles */}
          <div className="p-4 border-b border-dark-600">
            <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
              Muscles Targeted
            </p>
            <div className="flex gap-2 flex-wrap">
              {exercise.muscles.map((m: any) => (
                <div key={m.name}
                  className={`border rounded-lg px-3 py-2 ${roleColors[m.role] ?? roleColors.Stabiliser}`}>
                  <p className="text-xs font-semibold">{m.name}</p>
                  <p className="text-[10px] opacity-70">{m.role}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tracking format */}
          <div className="p-4 border-b border-dark-600">
            <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
              Tracking Format
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Sets', value: '3–5' },
                { label: 'Reps', value: '5–12' },
                { label: 'Weight', value: 'kg' },
                { label: 'RPE', value: '1–10' },
              ].map(item => (
                <div key={item.label}
                  className="bg-dark-700 rounded-xl p-3 text-center">
                  <p className="text-dark-300 text-[10px] mb-1">{item.label}</p>
                  <p className="text-white text-sm font-bold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          {exercise.description && (
            <div className="p-4 border-b border-dark-600">
              <p className="text-dark-300 text-xs uppercase tracking-wider mb-2">
                Form & Technique
              </p>
              <p className="text-dark-200 text-sm leading-relaxed">
                {exercise.description}
              </p>
            </div>
          )}

          {/* Equipment */}
          {exercise.equipment.length > 0 && (
            <div className="p-4 border-b border-dark-600">
              <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
                Equipment
              </p>
              <div className="flex gap-2 flex-wrap">
                {exercise.equipment.map((eq: string) => (
                  <span key={eq}
                    className="bg-dark-700 text-dark-200 text-sm px-3 py-2
                               rounded-lg border border-dark-500">
                    {eq}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Personal best */}
          <div className="p-4">
            <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
              Your Personal Best
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#0d2218] border border-brand-teal/30
                              rounded-xl p-3 text-center">
                <p className="text-brand-teal text-lg font-bold">
                  {exercise.personalBest
                    ? `${exercise.personalBest.weight}kg`
                    : '—'
                  }
                </p>
                <p className="text-dark-400 text-xs mt-1">Max weight</p>
              </div>
              <div className="bg-dark-700 rounded-xl p-3 text-center">
                <p className="text-white text-lg font-bold">
                  {exercise.timesLogged ?? 0}×
                </p>
                <p className="text-dark-400 text-xs mt-1">Times logged</p>
              </div>
              <div className="bg-dark-700 rounded-xl p-3 text-center">
                <p className="text-white text-lg font-bold">—</p>
                <p className="text-dark-400 text-xs mt-1">Avg RPE</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 pb-8 pt-3 border-t border-dark-700 flex gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex-1 bg-dark-800 text-white border border-dark-600
                     py-4 rounded-btn font-semibold active:scale-95 transition-transform"
        >
          ← Back
        </button>
        <button
          onClick={toggleAdd}
          className={`flex-2 py-4 rounded-btn font-bold text-sm
                     active:scale-95 transition-transform flex-[2]
                     ${isSelected
                       ? 'bg-dark-700 text-brand-teal border border-brand-teal'
                       : 'bg-brand-teal text-black'
                     }`}
        >
          {isSelected ? '✓ Added to Workout' : '+ Add to Workout'}
        </button>
      </div>
    </div>
  )
}
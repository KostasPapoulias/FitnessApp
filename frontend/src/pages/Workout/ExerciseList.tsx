import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { exerciseService } from '../../services/exercise.service'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { Exercise } from '../../types'

const SUB_FILTERS: Record<string, string[]> = {
  Legs:      ['All', 'Quads', 'Hamstrings', 'Glutes', 'Calves'],
  Chest:     ['All', 'Upper', 'Mid', 'Lower'],
  Back:      ['All', 'Lats', 'Traps', 'Lower Back'],
  Shoulders: ['All', 'Front Delt', 'Side Delt', 'Rear Delt'],
  Arms:      ['All', 'Biceps', 'Triceps', 'Forearms'],
  Core:      ['All', 'Abs', 'Obliques'],
}

export default function ExerciseList() {
  const navigate = useNavigate()
  const location = useLocation()
  const category: string = location.state?.category ?? 'Legs'
  const modality: string = location.state?.modality ?? 'Strength'

  const { selectedExercises, addExercise, removeExercise } = useWorkoutStore()

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [search, setSearch] = useState('')
  const [subFilter, setSubFilter] = useState('All')
  const [isLoading, setIsLoading] = useState(true)

  const subFilters = SUB_FILTERS[category] ?? ['All']

  useEffect(() => {
    setIsLoading(true)
    exerciseService.getExercises({ category, modality })
      .then(setExercises)
      .finally(() => setIsLoading(false))
  }, [category, modality])

  const filtered = exercises.filter(ex => {
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase())
    const matchesSub = subFilter === 'All' ||
      ex.muscles.some(m => m.name.toLowerCase().includes(subFilter.toLowerCase()))
    return matchesSearch && matchesSub
  })

  // AI picks — exercises with no fatigue warning, high impact factor
  const aiPicks = filtered
    .filter(ex => !ex.fatigueWarning)
    .slice(0, 3)
    .map(ex => ex.name)

  const isSelected = (id: string) =>
    selectedExercises.some(se => se.exercise.id === id)

  const toggleExercise = (exercise: Exercise) => {
    if (isSelected(exercise.id)) {
      removeExercise(exercise.id)
    } else {
      addExercise(exercise)
    }
  }

  const selectedCount = selectedExercises.length

  return (
    <div className="min-h-853 bg-dark-900 flex flex-col">

      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 bg-dark-800 rounded-full flex items-center
                     justify-center text-white border border-dark-600">
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-white text-xl font-bold">{category}</h1>
          <p className="text-dark-300 text-xs">{modality}</p>
        </div>
        {selectedCount > 0 && (
          <div className="bg-brand-teal/20 border border-brand-teal/40
                          rounded-full px-3 py-1">
            <span className="text-brand-teal text-sm font-semibold">
              {selectedCount} added
            </span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-5 mb-3">
        <div className="bg-dark-800 border border-dark-600 rounded-btn
                        flex items-center gap-3 px-4 py-3">
          <span className="text-dark-400">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search in ${category}...`}
            className="flex-1 bg-transparent text-white text-sm
                       placeholder-dark-400 outline-none"
          />
        </div>
      </div>

      {/* Sub-filters */}
      <div className="px-5 mb-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {subFilters.map(f => (
            <button
              key={f}
              onClick={() => setSubFilter(f)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs
                         font-medium border transition-all
                         ${subFilter === f
                           ? 'bg-brand-teal text-black border-brand-teal'
                           : 'bg-dark-800 text-dark-300 border-dark-600'
                         }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* AI picks */}
      {aiPicks.length > 0 && (
        <div className="mx-5 mb-3 bg-[#0a2a22] border border-brand-teal/30
                        rounded-card p-3">
          <p className="text-brand-teal text-xs font-semibold mb-2">
            🤖 AI picks for your goal (Hypertrophy)
          </p>
          <div className="flex gap-2 flex-wrap">
            {aiPicks.map(name => (
              <span key={name}
                className="bg-brand-teal/20 border border-brand-teal/40
                           text-brand-teal text-xs px-2 py-1 rounded-lg font-semibold">
                {name} ✦
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Exercise list */}
      <div className="flex-1 overflow-y-auto px-5 pb-36">
        <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
          {filtered.length} exercises
        </p>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-dark-800 rounded-card animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(exercise => {
              const selected = isSelected(exercise.id)
              const isAiPick = aiPicks.includes(exercise.name)

              return (
                <div
                  key={exercise.id}
                  className={`rounded-card border transition-all overflow-hidden
                             ${selected
                               ? 'border-brand-teal bg-[#0d2218]'
                               : exercise.fatigueWarning
                               ? 'border-brand-red/40 bg-[#1a0d0d]'
                               : 'border-dark-600 bg-dark-800'
                             }`}
                >
                  <div className="flex items-center gap-3 p-3">
                    {/* Icon */}
                    <div className={`w-11 h-11 rounded-xl flex items-center
                                    justify-center text-xl flex-shrink-0
                                    ${selected ? 'bg-brand-teal/20' : 'bg-dark-700'}`}>
                      💪
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0" onClick={() =>
                      navigate('/exercise-detail',
                        { state: { exerciseId: exercise.id } })
                    }>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-semibold">
                          {exercise.name}
                        </span>
                        {isAiPick && (
                          <span className="bg-brand-teal text-black text-[9px]
                                          font-bold px-1.5 py-0.5 rounded-full">
                            AI ✦
                          </span>
                        )}
                      </div>
                      <p className="text-dark-400 text-xs mt-0.5 truncate">
                        {exercise.muscles.map(m => m.name).join(' · ')}
                        {exercise.equipment.length > 0
                          ? ` · ${exercise.equipment[0]}`
                          : ''}
                      </p>
                      {exercise.fatigueWarning && (
                        <p className="text-brand-red text-xs mt-0.5">
                          ⚠ High muscle fatigue — not recommended
                        </p>
                      )}
                      <div className="flex gap-1.5 mt-1.5">
                        <span className="bg-dark-700 text-dark-300 text-[10px]
                                        px-2 py-0.5 rounded-full">
                          {exercise.modality}
                        </span>
                        <span className="bg-dark-700 text-dark-300 text-[10px]
                                        px-2 py-0.5 rounded-full">
                          Sets × Reps × Weight
                        </span>
                      </div>
                    </div>

                    {/* Add/Remove button */}
                    <button
                      onClick={() => toggleExercise(exercise)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center
                                 flex-shrink-0 transition-all
                                 ${selected
                                   ? 'bg-brand-teal text-black'
                                   : 'bg-dark-700 text-dark-400'
                                 }`}
                    >
                      {selected ? '✓' : '+'}
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Create custom */}
            <div className="border border-dashed border-dark-500 rounded-card
                            p-4 flex items-center justify-center gap-2">
              <span className="text-dark-400 text-sm">+ Create Custom Exercise</span>
            </div>
          </div>
        )}
      </div>

      {/* Floating tray */}
      {selectedCount > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2
                        w-[calc(100%-2rem)] max-w-[398px] bg-dark-800
                        border border-brand-teal/50 rounded-card p-3
                        flex items-center gap-3 shadow-2xl z-40">
          <div className="flex-1">
            <p className="text-white text-sm font-semibold">
              {selectedCount} exercise{selectedCount > 1 ? 's' : ''} ready
            </p>
            <p className="text-dark-400 text-xs">
              {selectedExercises.map(se => se.exercise.name).join(', ')}
            </p>
          </div>
          <button
            onClick={() => navigate('/workout/plan')}
            className="bg-brand-teal text-black text-sm font-bold
                       px-4 py-2.5 rounded-btn active:scale-95 transition-transform
                       flex-shrink-0"
          >
            Plan Sets →
          </button>
        </div>
      )}
    </div>
  )
}
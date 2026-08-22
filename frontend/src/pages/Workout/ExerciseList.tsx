import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { exerciseService } from '../../services/exercise.service'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { Exercise } from '../../types'
import { exerciseEmoji } from './helpers'

// Muscle sub-filters, as label → the muscle names the API actually returns.
//
// These were bare strings matched with `includes` against the muscle name, and
// most of them could never match: "Quads" is not a substring of "Quadriceps",
// and "Upper" / "Side Delt" name regions of a muscle the model does not split.
// Chest and Shoulders therefore have no muscle row at all — the equipment row
// is what narrows those.
const MUSCLE_FILTERS: Record<string, { label: string; muscles: string[] }[]> = {
  Legs: [
    { label: 'Quads', muscles: ['Quadriceps'] },
    { label: 'Hamstrings', muscles: ['Hamstrings'] },
    { label: 'Glutes', muscles: ['Glutes'] },
    { label: 'Calves', muscles: ['Calves'] },
  ],
  Back: [
    { label: 'Lats', muscles: ['Lats'] },
    { label: 'Traps', muscles: ['Traps'] },
    { label: 'Lower Back', muscles: ['Lower Back'] },
  ],
  Arms: [
    { label: 'Biceps', muscles: ['Biceps'] },
    { label: 'Triceps', muscles: ['Triceps'] },
    { label: 'Forearms', muscles: ['Forearms'] },
  ],
  Core: [
    { label: 'Abs', muscles: ['Abs'] },
    { label: 'Obliques', muscles: ['Obliques'] },
  ],
}

// How the modality reads in the header + what the tray does next
const MODALITY_META: Record<string, { title: string; sub: string; cta: string; plan: string }> = {
  Strength:     { title: 'Exercises',   sub: 'Select exercises',            cta: 'Plan Sets →',   plan: '/workout/plan' },
  Calisthenics: { title: 'Calisthenics', sub: 'Pick your movements',        cta: 'Plan Sets →',   plan: '/workout/plan' },
  Cardio:       { title: 'Cardio',       sub: 'Choose an activity',         cta: 'Set Target →',  plan: '/workout/plan/cardio' },
  Mobility:     { title: 'Mobility',     sub: 'Choose your flows',          cta: 'Plan Flow →',   plan: '/workout/plan/mobility' },
  WOD:          { title: 'WOD',          sub: 'Pick the movements',         cta: 'Build WOD →',   plan: '/workout/plan/wod' },
}

export default function ExerciseList() {
  const navigate = useNavigate()
  const location = useLocation()
  const category: string | undefined = location.state?.category
  const modality: string = location.state?.modality ?? 'Strength'
  const singleSelect = modality === 'Cardio'

  const { selectedExercises, addExercise, removeExercise, setSingleExercise } = useWorkoutStore()

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [search, setSearch] = useState('')
  const [subFilter, setSubFilter] = useState('All')
  const [equipmentFilter, setEquipmentFilter] = useState('All')
  const [isLoading, setIsLoading] = useState(true)

  const muscleFilters = category ? (MUSCLE_FILTERS[category] ?? []) : []
  const meta = MODALITY_META[modality] ?? MODALITY_META.Strength

  useEffect(() => {
    setIsLoading(true)
    // Both filters are about the list that is on screen, so neither survives a
    // change of it — a stuck "Cable Machine" on a screen with none reads as an
    // empty catalogue.
    setSubFilter('All')
    setEquipmentFilter('All')
    // Strength narrows by muscle group; every other modality lists by modality only.
    exerciseService.getExercises(category ? { category, modality } : { modality })
      .then(setExercises)
      .finally(() => setIsLoading(false))
  }, [category, modality])

  // Built from what came back rather than a fixed list, so it can never offer a
  // filter that empties the screen. Worth a row now that the same movement
  // exists in barbell, dumbbell, machine and cable versions.
  const equipmentOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ex of exercises) {
      for (const item of ex.equipment) counts.set(item, (counts.get(item) ?? 0) + 1)
    }
    return [...counts.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
  }, [exercises])

  const activeMuscles = muscleFilters.find(f => f.label === subFilter)?.muscles

  const filtered = exercises.filter(ex => {
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase())
    const matchesSub = !activeMuscles || ex.muscles.some(m => activeMuscles.includes(m.name))
    const matchesEquipment = equipmentFilter === 'All' || ex.equipment.includes(equipmentFilter)
    return matchesSearch && matchesSub && matchesEquipment
  })

  // Suggestions must be things they can actually do today: fresh enough, not
  // loading an injury, and not requiring kit they never listed.
  const aiPicks = filtered
    .filter(ex => !ex.fatigueWarning && !ex.injuryCaution && !ex.needsMissingEquipment)
    .slice(0, 3)
    .map(ex => ex.name)
  const isSelected = (id: string) => selectedExercises.some(se => se.exercise.id === id)

  const toggleExercise = (exercise: Exercise) => {
    if (singleSelect) {
      setSingleExercise(exercise) // cardio: exactly one activity
      return
    }
    if (isSelected(exercise.id)) removeExercise(exercise.id)
    else addExercise(exercise)
  }

  const selectedCount = selectedExercises.length
  const headerTitle = category ?? meta.title
  const headerSub = category ? modality : meta.sub

  return (
    <div className="min-h-dvh bg-dark-900 flex flex-col">

      {/* Header */}
      <div className="px-5 pt-6 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 bg-dark-800 rounded-full flex items-center
                     justify-center text-white border border-dark-600">
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-white text-xl font-bold">{headerTitle}</h1>
          <p className="text-dark-300 text-xs">{headerSub}</p>
        </div>
        {selectedCount > 0 && (
          <div className="bg-brand-teal/20 border border-brand-teal/40 rounded-full px-3 py-1">
            <span className="text-brand-teal text-sm font-semibold">
              {singleSelect ? 'selected' : `${selectedCount} added`}
            </span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-5 mb-3">
        <div className="bg-dark-800 border border-dark-600 rounded-btn flex items-center gap-3 px-4 py-3">
          <span className="text-dark-400">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${headerTitle.toLowerCase()}...`}
            className="flex-1 bg-transparent text-white text-sm placeholder-dark-400 outline-none"
          />
        </div>
      </div>

      {/* Sub-filters (strength muscle groups only) */}
      {muscleFilters.length > 0 && (
        <div className="px-5 mb-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {['All', ...muscleFilters.map(f => f.label)].map(f => (
              <button key={f} onClick={() => setSubFilter(f)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                           ${subFilter === f
                             ? 'bg-brand-teal text-black border-brand-teal'
                             : 'bg-dark-800 text-dark-300 border-dark-600'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Equipment. The catalogue carries the same movement on a barbell, a
          dumbbell, a machine and a cable, so "what is in front of me" narrows
          the list faster than anything else. Second colour so the two rows do
          not read as one set of chips. */}
      {equipmentOptions.length > 1 && (
        <div className="px-5 mb-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {['All', ...equipmentOptions].map(f => (
              <button key={f} onClick={() => setEquipmentFilter(f)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                           ${equipmentFilter === f
                             ? 'bg-dark-100 text-black border-dark-100'
                             : 'bg-dark-800 text-dark-300 border-dark-600'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI picks (only when muscle-group browsing) */}
      {category && aiPicks.length > 0 && (
        <div className="mx-5 mb-3 bg-[#0a2a22] border border-brand-teal/30 rounded-card p-3">
          <p className="text-brand-teal text-xs font-semibold mb-2">🤖 Recovered & recommended</p>
          <div className="flex gap-2 flex-wrap">
            {aiPicks.map(name => (
              <span key={name}
                className="bg-brand-teal/20 border border-brand-teal/40 text-brand-teal text-xs px-2 py-1 rounded-lg font-semibold">
                {name} ✦
              </span>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 pb-36">
        <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
          {filtered.length} {singleSelect ? 'activities' : 'exercises'}
        </p>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-dark-800 rounded-card animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          // The moment the feature exists for. Someone searched for a movement
          // and it is not here; offering the search text as the name is the
          // difference between a dead end and one tap.
          <div className="bg-dark-800 border border-dark-600 rounded-card p-5 text-center">
            <p className="text-white text-sm font-semibold">
              {search ? `No match for "${search}"` : 'Nothing here yet'}
            </p>
            <p className="text-dark-400 text-xs mt-1 mb-4">
              If you train it and the library doesn't have it, add it yourself.
            </p>
            <button
              onClick={() => navigate('/workout/exercises/new', {
                state: { name: search, modality },
              })}
              className="bg-brand-teal text-black text-sm font-bold px-4 py-2.5
                         rounded-btn active:scale-95 transition-transform"
            >
              Create "{search || 'a new exercise'}"
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(exercise => {
              const selected = isSelected(exercise.id)
              return (
                <div key={exercise.id}
                  className={`rounded-card border transition-all overflow-hidden
                             ${selected
                               ? 'border-brand-teal bg-[#0d2218]'
                               : exercise.fatigueWarning
                               ? 'border-brand-red/40 bg-[#1a0d0d]'
                               : 'border-dark-600 bg-dark-800'}`}>
                  <div className="flex items-center gap-3 p-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0
                                    ${selected ? 'bg-brand-teal/20' : 'bg-dark-700'}`}>
                      {exerciseEmoji(exercise)}
                    </div>
                    <div className="flex-1 min-w-0"
                      onClick={() => navigate('/exercise-detail', { state: { exerciseId: exercise.id } })}>
                      <span className="text-white text-sm font-semibold">{exercise.name}</span>
                      <p className="text-dark-400 text-xs mt-0.5 truncate">
                        {exercise.muscles.map(m => m.name).join(' · ') || exercise.modality}
                        {exercise.equipment.length > 0 ? ` · ${exercise.equipment[0]}` : ''}
                      </p>
                      {exercise.fatigueWarning && (
                        <p className="text-brand-red text-xs mt-0.5">⚠ High muscle fatigue — not recommended</p>
                      )}
                      {exercise.injuryCaution && (
                        <p className="text-brand-yellow text-xs mt-0.5">
                          ⚠ Loads an area you're working around
                        </p>
                      )}
                      {/* Says why this one sank to the bottom. Without the
                          line it just looks like an odd sort order. */}
                      {exercise.needsMissingEquipment && (
                        <p className="text-dark-400 text-xs mt-0.5">
                          Needs equipment you haven't listed
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleExercise(exercise)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all
                                 ${selected ? 'bg-brand-teal text-black' : 'bg-dark-700 text-dark-400'}`}>
                      {selected ? (singleSelect ? '●' : '✓') : '+'}
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Also offered below a list that DID return results — the search
                matching something is not the same as it matching what they
                came for, and that case has no empty state to fall into. */}
            <button
              onClick={() => navigate('/workout/exercises/new', {
                state: { name: search, modality },
              })}
              className="rounded-card border border-dashed border-dark-600 bg-transparent
                         py-3 text-dark-400 text-sm active:bg-dark-800 transition-colors"
            >
              + Create your own exercise
            </button>
          </div>
        )}
      </div>

      {/* Continue tray */}
      {selectedCount > 0 && (
        <div className="fixed bottom-[calc(var(--bottom-nav-h)+1rem)] left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)]
                        max-w-[390px] bg-dark-800 border border-brand-teal/50 rounded-card p-3
                        flex items-center gap-3 shadow-2xl z-40">
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold">
              {singleSelect
                ? selectedExercises[0]?.exercise.name
                : `${selectedCount} exercise${selectedCount > 1 ? 's' : ''} ready`}
            </p>
            {!singleSelect && (
              <p className="text-dark-400 text-xs truncate">
                {selectedExercises.map(se => se.exercise.name).join(', ')}
              </p>
            )}
          </div>
          <button onClick={() => navigate(meta.plan)}
            className="bg-brand-teal text-black text-sm font-bold px-4 py-2.5 rounded-btn
                       active:scale-95 transition-transform flex-shrink-0">
            {meta.cta}
          </button>
        </div>
      )}
    </div>
  )
}

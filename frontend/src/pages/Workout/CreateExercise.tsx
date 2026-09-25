import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { exerciseService } from '../../services/exercise.service'
import { onboardingService, MuscleOption, EquipmentOption } from '../../services/onboarding.service'
import { INPUT_BASE } from '../../components/forms/Fields'
import { CardioTracking, ExerciseCategory } from '../../types'

/**
 * Create a custom exercise. Asks only what the athlete can know — muscles as
 * primary or secondary; the server derives all calibration numbers.
 */

type Role = 'primary' | 'secondary'

const TRACKING_OPTIONS: { value: CardioTracking; label: string; sub: string }[] = [
  {
    value: 'gps',
    label: 'GPS can follow it',
    sub: 'Outdoors, covering ground — running, cycling, walking. You get a map and a route.',
  },
  {
    value: 'machine',
    label: 'It has a pace, but nothing measures it',
    sub: 'A treadmill, an erg, a pool. You set the speed by hand and no route is drawn.',
  },
  {
    value: 'reps',
    label: 'It is counted, not measured',
    sub: 'No distance at any effort — skips, floors, jacks. You get a counter instead of a map.',
  },
]

const MODALITY_HINT: Record<string, string> = {
  Strength: 'Loaded with weight — barbell, dumbbell, machine or cable.',
  Calisthenics: 'Bodyweight, optionally with added load.',
  Cardio: 'Continuous work, scored on time or distance.',
  WOD: 'A metcon movement, scored in rounds or against a clock.',
  Mobility: 'Stretching or flow work. Restorative — it adds no fatigue.',
}

export default function CreateExercise() {
  const navigate = useNavigate()
  const location = useLocation()

  // Prefilled from a search that found nothing
  const presetName: string = location.state?.name ?? ''
  const presetModality: string | undefined = location.state?.modality

  const [modalities, setModalities] = useState<{ id: string; name: string }[]>([])
  const [muscles, setMuscles] = useState<MuscleOption[]>([])
  const [equipment, setEquipment] = useState<EquipmentOption[]>([])
  const [categories, setCategories] = useState<ExerciseCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [name, setName] = useState(presetName)
  const [modalityId, setModalityId] = useState('')
  /** How this cardio movement is measured — asked because a wrong answer is immediately visible. */
  const [cardioTracking, setCardioTracking] = useState<CardioTracking>('gps')
  const [description, setDescription] = useState('')
  const [roleByMuscle, setRoleByMuscle] = useState<Record<string, Role>>({})
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [equipmentIds, setEquipmentIds] = useState<string[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Four independent lookups, batched
    Promise.all([
      exerciseService.getModalities(),
      onboardingService.getOptions(),
      exerciseService.getCategories().catch(() => [] as ExerciseCategory[]),
    ])
      .then(([mods, options, cats]) => {
        setModalities(mods)
        setMuscles(options.muscles)
        setEquipment(options.equipment)
        setCategories(cats)

        const preset = presetModality
          ? mods.find((m: { name: string }) => m.name === presetModality)
          : null
        setModalityId(preset?.id ?? mods[0]?.id ?? '')
      })
      .catch(() => setError('Could not load the exercise options. Check your connection.'))
      .finally(() => setIsLoading(false))
  }, [presetModality])

  const modalityName = modalities.find(m => m.id === modalityId)?.name ?? ''

  const cycleMuscle = (muscleId: string) => {
    // One control cycles off → primary → secondary → off
    setRoleByMuscle(prev => {
      const next = { ...prev }
      if (!next[muscleId]) next[muscleId] = 'primary'
      else if (next[muscleId] === 'primary') next[muscleId] = 'secondary'
      else delete next[muscleId]
      return next
    })
  }

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter(x => x !== id) : [...list, id]

  const primaryCount = useMemo(
    () => Object.values(roleByMuscle).filter(r => r === 'primary').length,
    [roleByMuscle]
  )

  // Mirrors the server's rules so the button can explain what is missing
  const problem =
    name.trim().length < 2 ? 'Give it a name.' :
    !modalityId ? 'Choose what kind of exercise it is.' :
    primaryCount === 0 ? 'Mark at least one muscle as primary.' :
    null

  const save = async () => {
    if (problem) return
    setSaving(true)
    setError(null)
    try {
      const created = await exerciseService.create({
        name: name.trim(),
        modalityId,
        description: description.trim() || undefined,
        muscles: Object.entries(roleByMuscle).map(([muscleId, role]) => ({ muscleId, role })),
        categoryIds,
        equipmentIds,
        // Ignored server-side for non-cardio modalities
        cardioTracking,
      })
      // To the new exercise's detail screen
      navigate('/exercise-detail', { state: { exerciseId: created.id }, replace: true })
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not save that exercise. Try again.')
      setSaving(false)
    }
  }

  if (isLoading) return (
    <div className="flex-1 bg-dark-900 flex items-center justify-center">
      <div className="text-dark-300 text-sm">Loading…</div>
    </div>
  )

  return (
    <div className="flex-1 bg-dark-900 flex flex-col">

      {/* Header */}
      <div className="px-5 pt-2 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-dark-800 border border-dark-600
                     text-dark-300 flex items-center justify-center"
        >
          ‹
        </button>
        <div>
          <h1 className="text-white text-xl font-bold">New exercise</h1>
          <p className="text-dark-400 text-xs">Something the library doesn't have</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-[var(--tray-clear)] flex flex-col gap-5">

        {/* Name */}
        <div>
          <label className="text-dark-300 text-xs uppercase tracking-wider">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Bulgarian Split Squat"
            maxLength={80}
            className={`${INPUT_BASE} mt-2`}
          />
        </div>

        {/* Modality */}
        <div>
          <label className="text-dark-300 text-xs uppercase tracking-wider">Kind</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {modalities.map(m => (
              <button
                key={m.id}
                onClick={() => setModalityId(m.id)}
                className={`px-3 py-2 rounded-btn text-sm font-medium border transition-colors
                           ${modalityId === m.id
                             ? 'bg-brand-teal/20 border-brand-teal text-white'
                             : 'bg-dark-800 border-dark-600 text-dark-300'}`}
              >
                {m.name}
              </button>
            ))}
          </div>
          {MODALITY_HINT[modalityName] && (
            <p className="text-dark-400 text-xs mt-2">{MODALITY_HINT[modalityName]}</p>
          )}
        </div>

        {/* Measurement type — cardio only */}
        {modalityName === 'Cardio' && (
          <div>
            <label className="text-dark-300 text-xs uppercase tracking-wider">
              How is it measured?
            </label>
            <div className="flex flex-col gap-2 mt-2">
              {TRACKING_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCardioTracking(option.value)}
                  className={`rounded-card border px-4 py-3 text-left transition-colors
                             ${cardioTracking === option.value
                               ? 'border-brand-teal bg-[#0a2a22]'
                               : 'border-dark-600 bg-dark-800'}`}
                >
                  <span className={`block text-sm font-bold ${
                    cardioTracking === option.value ? 'text-brand-teal' : 'text-white'}`}>
                    {option.label}
                  </span>
                  <span className="block text-dark-400 text-xs mt-0.5 leading-snug">
                    {option.sub}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Muscles */}
        <div>
          <label className="text-dark-300 text-xs uppercase tracking-wider">
            Muscles worked
          </label>
          <p className="text-dark-400 text-xs mt-1 mb-2">
            Tap once for primary, twice for secondary. Primary means the exercise
            is really for that muscle — this is what drives your recovery times.
          </p>
          <div className="flex flex-wrap gap-2">
            {muscles.map(muscle => {
              const role = roleByMuscle[muscle.id]
              return (
                <button
                  key={muscle.id}
                  onClick={() => cycleMuscle(muscle.id)}
                  className={`px-3 py-2 rounded-btn text-sm font-medium border transition-colors
                             ${role === 'primary'
                               ? 'bg-brand-teal/25 border-brand-teal text-white'
                               : role === 'secondary'
                               ? 'bg-brand-teal/10 border-brand-teal/40 text-brand-teal'
                               : 'bg-dark-800 border-dark-600 text-dark-300'}`}
                >
                  {muscle.name}
                  {role === 'primary' && ' · 1°'}
                  {role === 'secondary' && ' · 2°'}
                </button>
              )
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-dark-300 text-xs uppercase tracking-wider">
            How to do it <span className="text-dark-500 normal-case">· optional</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Setup and the cues that matter."
            rows={3}
            maxLength={1000}
            className={`${INPUT_BASE} mt-2 resize-none`}
          />
        </div>

        {/* Categories */}
        {categories.length > 0 && (
          <div>
            <label className="text-dark-300 text-xs uppercase tracking-wider">
              Categories <span className="text-dark-500 normal-case">· optional</span>
            </label>
            <div className="flex flex-wrap gap-2 mt-2">
              {categories.map(category => (
                <button
                  key={category.id}
                  onClick={() => setCategoryIds(prev => toggleIn(prev, category.id))}
                  className={`px-3 py-2 rounded-btn text-sm font-medium border transition-colors
                             ${categoryIds.includes(category.id)
                               ? 'bg-brand-teal/20 border-brand-teal text-white'
                               : 'bg-dark-800 border-dark-600 text-dark-300'}`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Equipment */}
        <div>
          <label className="text-dark-300 text-xs uppercase tracking-wider">
            Equipment <span className="text-dark-500 normal-case">· optional</span>
          </label>
          <p className="text-dark-400 text-xs mt-1 mb-2">
            Used to sort the list for whatever you're training with.
          </p>
          <div className="flex flex-wrap gap-2">
            {equipment.map(item => (
              <button
                key={item.id}
                onClick={() => setEquipmentIds(prev => toggleIn(prev, item.id))}
                className={`px-3 py-2 rounded-btn text-sm font-medium border transition-colors
                           ${equipmentIds.includes(item.id)
                             ? 'bg-brand-teal/20 border-brand-teal text-white'
                             : 'bg-dark-800 border-dark-600 text-dark-300'}`}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-brand-red text-sm">{error}</p>
        )}
      </div>

      {/* Save tray, above the nav */}
      <div className="fixed bottom-[calc(var(--bottom-nav-h)+1rem)] left-1/2 -translate-x-1/2
                      w-[calc(100%-2.5rem)] max-w-[390px] z-40">
        <button
          onClick={save}
          disabled={!!problem || saving}
          className="w-full bg-brand-teal text-black font-bold py-3.5 rounded-btn
                     active:scale-95 transition-transform disabled:opacity-40
                     disabled:active:scale-100 shadow-2xl"
        >
          {saving ? 'Saving…' : problem ?? 'Create exercise'}
        </button>
      </div>
    </div>
  )
}

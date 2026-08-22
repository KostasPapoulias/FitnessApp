import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  onboardingService, EquipmentOption, MuscleOption, InjuryInput,
} from '../services/onboarding.service'
import { useOnboardingStore } from '../store/useOnboardingStore'

// The optional stage: what you can train with, and what you need to train
// around. Reachable from the Home prompt card and from Profile.
//
// Never gates anything. Skipping it costs suggestion quality, not access — so
// every exit from this screen is a valid one, including the back arrow.
//
// Equipment here RANKS the exercise list, it does not filter it. Nothing gets
// hidden for want of a barbell; unavailable movements just sort to the bottom.
// Only an injury marked "avoid" actually removes anything.

// Where people train, as whole places rather than parts lists. Picking a
// preset ticks its equipment — you can then adjust individual items, which is
// how someone says "commercial gym, but no rower".
const PRESETS: { id: string; icon: string; label: string; blurb: string; items: string[] }[] = [
  {
    id: 'gym', icon: '🏢', label: 'Full gym',
    blurb: 'Commercial gym — machines, cables, racks',
    items: ['Barbell', 'Dumbbell', 'Kettlebell', 'EZ Bar', 'Trap Bar', 'Machine',
            'Cable Machine', 'Smith Machine', 'Bench', 'Pull-up Bar', 'Dip Bars',
            'Treadmill', 'Rower', 'Bike', 'Elliptical', 'Stair Climber',
            'Plyo Box', 'Medicine Ball', 'Resistance Band', 'Jump Rope',
            'Ab Wheel', 'Foam Roller', 'Yoga Mat', 'Bodyweight'],
  },
  {
    id: 'home', icon: '🏠', label: 'Home setup',
    blurb: 'Dumbbells, bands, a mat — the usual home kit',
    items: ['Dumbbell', 'Kettlebell', 'Resistance Band', 'Yoga Mat', 'Jump Rope',
            'Ab Wheel', 'Foam Roller', 'Bench', 'Bodyweight'],
  },
  {
    id: 'park', icon: '🌳', label: 'Calisthenics park',
    blurb: 'Bars, rings and your own bodyweight',
    items: ['Pull-up Bar', 'Dip Bars', 'Gymnastic Rings', 'Bodyweight',
            'Resistance Band', 'Jump Rope'],
  },
  {
    id: 'box', icon: '🏋️', label: 'CrossFit box',
    blurb: 'Rig, bumpers, rings, rower — and a sled',
    items: ['Barbell', 'Dumbbell', 'Kettlebell', 'Bench', 'Pull-up Bar',
            'Gymnastic Rings', 'Plyo Box', 'Medicine Ball', 'Rower', 'Bike',
            'Jump Rope', 'Sled', 'Battle Ropes', 'Ab Wheel', 'Bodyweight'],
  },
  {
    id: 'bodyweight', icon: '🤸', label: 'Bodyweight only',
    blurb: 'No equipment at all',
    items: ['Bodyweight'],
  },
]

// Grouped so the list reads as a place rather than an alphabetical dump. Names
// must match Equipment.name in seed.ts; anything unlisted falls into "Other" so
// a new seed entry appears instead of vanishing.
const GROUPS: { title: string; items: string[] }[] = [
  { title: 'Free weights', items: ['Barbell', 'Dumbbell', 'Kettlebell', 'EZ Bar', 'Trap Bar', 'Medicine Ball'] },
  { title: 'Machines & cardio', items: ['Machine', 'Cable Machine', 'Smith Machine', 'Treadmill', 'Rower', 'Bike', 'Elliptical', 'Stair Climber'] },
  { title: 'Bodyweight & rigs', items: ['Bodyweight', 'Pull-up Bar', 'Dip Bars', 'Gymnastic Rings', 'Bench', 'Plyo Box'] },
  { title: 'Accessories', items: ['Resistance Band', 'Jump Rope', 'Ab Wheel', 'Sled', 'Battle Ropes', 'Foam Roller', 'Yoga Mat'] },
]

const SEVERITIES: { value: 'avoid' | 'caution'; label: string; blurb: string }[] = [
  { value: 'caution', label: 'Work around it', blurb: 'Still shown, with a warning' },
  { value: 'avoid',   label: 'Avoid entirely', blurb: 'Hidden from suggestions' },
]

export default function TrainingSetup() {
  const navigate = useNavigate()
  // Refetched after save so the "Finish your setup" card on Home actually
  // disappears. Without this the store kept its stale optionalStageDoneAt and
  // the prompt came back on every visit until the app was restarted.
  const refreshOnboarding = useOnboardingStore(s => s.fetchState)

  const [equipment, setEquipment] = useState<EquipmentOption[]>([])
  const [muscles, setMuscles] = useState<MuscleOption[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [injuries, setInjuries] = useState<InjuryInput[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([onboardingService.getOptions(), onboardingService.getState()])
      .then(([options, state]) => {
        setEquipment(options.equipment)
        setMuscles(options.muscles)
        setSelected(new Set(state.equipmentIds))
        setInjuries(state.injuries.map(i => ({
          muscleId: i.muscleId ?? null,
          label: i.label,
          severity: i.severity ?? 'caution',
        })))
      })
      .catch(() => setError('Could not load your options. Please go back and try again.'))
      .finally(() => setLoading(false))
  }, [])

  const byName = useMemo(
    () => new Map(equipment.map(e => [e.name, e])),
    [equipment]
  )

  // A preset reads as active when everything it covers is ticked. It is a
  // shortcut, not a mode — ticking one extra item does not clear it.
  const activePreset = useMemo(() => {
    if (selected.size === 0) return null
    return PRESETS.find(p => {
      const ids = p.items.map(n => byName.get(n)?.id).filter(Boolean) as string[]
      return ids.length > 0 && ids.every(id => selected.has(id))
    })?.id ?? null
  }, [selected, byName])

  const applyPreset = (preset: typeof PRESETS[number]) => {
    const ids = preset.items.map(n => byName.get(n)?.id).filter(Boolean) as string[]
    setSelected(prev => {
      // Tapping the active preset clears it, so a mistap is undoable without
      // hunting through the grid to untick fifteen things.
      const alreadyOn = ids.every(id => prev.has(id))
      return alreadyOn ? new Set() : new Set(ids)
    })
  }

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const addInjury = (muscle: MuscleOption) => {
    if (injuries.some(i => i.muscleId === muscle.id)) return
    setInjuries(prev => [...prev, {
      muscleId: muscle.id, label: muscle.name, severity: 'caution',
    }])
  }

  const removeInjury = (muscleId: string | null | undefined) =>
    setInjuries(prev => prev.filter(i => i.muscleId !== muscleId))

  const setSeverity = (muscleId: string | null | undefined, severity: 'avoid' | 'caution') =>
    setInjuries(prev => prev.map(i => i.muscleId === muscleId ? { ...i, severity } : i))

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      // Injuries last: that call is what stamps optionalStageDoneAt, so if
      // equipment fails the stage stays open rather than being marked done
      // with half its answers missing.
      await onboardingService.setEquipment([...selected])
      await onboardingService.setInjuries(injuries)
      await refreshOnboarding()
      navigate('/', { replace: true })
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not save. Please try again.')
      setSaving(false)   // stays on the screen so the selection is not lost
    }
  }

  // Anything the seed added that GROUPS does not name yet.
  const grouped = new Set(GROUPS.flatMap(g => g.items))
  const ungrouped = equipment.filter(e => !grouped.has(e.name))

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-dark-300">Loading…</p>
      </div>
    )
  }

  return (
    <div className="px-5 pt-4 pb-8">

      <button onClick={() => navigate(-1)} className="text-dark-300 mb-5 text-sm">
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-white">Training setup</h1>
      <p className="text-dark-300 text-sm mt-1.5 mb-7 leading-relaxed">
        Optional. It sorts exercises you can do to the top — nothing gets hidden
        for want of equipment.
      </p>

      {/*  Presets  */}
      <h2 className="text-white font-semibold mb-1">Where do you train?</h2>
      <p className="text-dark-400 text-xs mb-3">
        Pick the closest match, then adjust below.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-8">
        {PRESETS.map(p => (
          <button key={p.id} onClick={() => applyPreset(p)}
            className={`text-left p-3 rounded-card border transition-colors
                        ${activePreset === p.id
                          ? 'bg-brand-teal/10 border-brand-teal'
                          : 'bg-dark-800 border-dark-600'}`}>
            <span className="text-xl block mb-1">{p.icon}</span>
            <span className={`block text-sm font-semibold
                              ${activePreset === p.id ? 'text-brand-teal' : 'text-white'}`}>
              {p.label}
            </span>
            <span className="block text-dark-400 text-[11px] mt-0.5 leading-snug">
              {p.blurb}
            </span>
          </button>
        ))}
      </div>

      {/*  Equipment  */}
      <h2 className="text-white font-semibold mb-1">Equipment</h2>
      <p className="text-dark-400 text-xs mb-4">
        {selected.size === 0
          ? 'Nothing selected — all exercises shown in the default order.'
          : `${selected.size} selected`}
      </p>

      {GROUPS.map(group => {
        const items = group.items.map(n => byName.get(n)).filter(Boolean) as EquipmentOption[]
        if (items.length === 0) return null
        return (
          <div key={group.title} className="mb-5">
            <p className="text-dark-400 text-[11px] uppercase tracking-wide mb-2">
              {group.title}
            </p>
            <div className="flex flex-wrap gap-2">
              {items.map(e => (
                <Pill key={e.id} label={e.name}
                      selected={selected.has(e.id)} onClick={() => toggle(e.id)} />
              ))}
            </div>
          </div>
        )
      })}

      {ungrouped.length > 0 && (
        <div className="mb-5">
          <p className="text-dark-400 text-[11px] uppercase tracking-wide mb-2">Other</p>
          <div className="flex flex-wrap gap-2">
            {ungrouped.map(e => (
              <Pill key={e.id} label={e.name}
                    selected={selected.has(e.id)} onClick={() => toggle(e.id)} />
            ))}
          </div>
        </div>
      )}

      {/*  Injuries  */}
      <h2 className="text-white font-semibold mt-9 mb-1">Anything to train around?</h2>
      <p className="text-dark-400 text-xs mb-4 leading-relaxed">
        Tap a muscle you're carrying an injury in. This only affects what we
        suggest — it won't change your recovery readings.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {muscles.map(m => (
          <Pill key={m.id} label={m.name} tone="warn"
                selected={injuries.some(i => i.muscleId === m.id)}
                onClick={() =>
                  injuries.some(i => i.muscleId === m.id)
                    ? removeInjury(m.id)
                    : addInjury(m)} />
        ))}
      </div>

      {injuries.map(injury => (
        <div key={injury.muscleId ?? injury.label}
             className="bg-dark-800 border border-dark-600 rounded-card p-3.5 mb-2.5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white font-semibold text-sm">{injury.label}</span>
            <button onClick={() => removeInjury(injury.muscleId)}
                    className="text-dark-400 text-xs">Remove</button>
          </div>
          <div className="flex gap-2">
            {SEVERITIES.map(s => (
              <button key={s.value}
                onClick={() => setSeverity(injury.muscleId, s.value)}
                className={`flex-1 px-3 py-2.5 rounded-btn text-left border transition-colors
                            ${injury.severity === s.value
                              ? 'bg-brand-yellow/10 border-brand-yellow'
                              : 'bg-dark-900 border-dark-600'}`}>
                <span className={`block text-xs font-semibold
                                  ${injury.severity === s.value ? 'text-brand-yellow' : 'text-white'}`}>
                  {s.label}
                </span>
                <span className="block text-dark-400 text-[10px] mt-0.5">{s.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="text-brand-red text-sm mt-4">{error}</p>}

      {/* In normal flow, not fixed. A fixed bar escaped AppLayout's centred
          430px column and stretched the full window width, and sat underneath
          the bottom nav besides. */}
      <button onClick={save} disabled={saving}
        className="w-full bg-brand-teal text-black font-bold py-3.5 rounded-btn mt-8
                   active:scale-95 transition-transform disabled:opacity-50">
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

function Pill({ label, selected, onClick, tone = 'teal' }: {
  label: string; selected: boolean; onClick: () => void; tone?: 'teal' | 'warn'
}) {
  const active = tone === 'warn'
    ? 'bg-brand-yellow/10 border-brand-yellow text-brand-yellow'
    : 'bg-brand-teal/10 border-brand-teal text-brand-teal'

  return (
    <button onClick={onClick}
      className={`px-3.5 py-2 rounded-full border text-[13px] font-medium transition-colors
                  ${selected ? active : 'bg-dark-800 border-dark-600 text-dark-300'}`}>
      {label}
    </button>
  )
}

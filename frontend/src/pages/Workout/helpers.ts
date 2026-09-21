import { Exercise } from '../../types'

// ── RPE → colour / tint / word ────────────────────────────────────────────
// Mirrors the SomaTrack design tokens: green → yellow → orange → red.
export function rpeColor(n: number): string {
  if (n <= 4) return '#4ADE80' // brand-green
  if (n <= 6) return '#FACC15' // brand-yellow
  if (n <= 8) return '#F97316' // brand-orange
  return '#EF4444'             // brand-red
}

export function rpeTint(n: number): string {
  if (n <= 4) return 'rgba(74,222,128,0.14)'
  if (n <= 6) return 'rgba(250,204,21,0.14)'
  if (n <= 8) return 'rgba(249,115,22,0.16)'
  return 'rgba(239,68,68,0.16)'
}

const RPE_WORDS = [
  '', 'Very easy', 'Very easy', 'Easy', 'Easy', 'Moderate',
  'Moderate', 'Challenging', 'Hard', 'Very hard', 'Max effort',
]

export function rpeWord(n: number): string {
  return RPE_WORDS[n] ?? ''
}

export type RpeMode = 'standard' | 'beginner' | 'pro'

export function rpeLabel(n: number, mode: RpeMode): string {
  if (mode === 'beginner') return rpeWord(n)
  if (mode === 'pro') return `RPE ${n}`
  return `${n} — ${rpeWord(n)}`
}

// Cycle 1..10 wrapping
export function cycleRpe(n: number, delta = 1): number {
  return ((n - 1 + delta + 10) % 10) + 1
}

// The emoji this file used to map modalities to now lives in
// `components/icons.tsx` as ModalityIcon. It stays there rather than here
// because this is a .ts file and an icon is JSX — which is also why the
// session summary below carries the modality and lets the screen draw it.

// ── Finish-screen summary ─────────────────────────────────────────────────
export interface FinishSnapshot {
  exercises: { name: string; modality: string; count: number; topWeight: number; topReps: number }[]
  muscles: string[]
  setsLogged: number
  elapsed: number
}

/**
 * What the Finish screen shows, captured before `finishSession()` clears the
 * store. Shared by the live workout and quick log so the two cannot drift into
 * summarising the same session differently.
 */
export function summariseSession(
  selectedExercises: { exercise: Exercise; sets: { reps: number; weight: number }[] }[],
  completedSets: { exerciseId: string; setIndex: number }[],
  elapsed: number
): FinishSnapshot {
  const exercises = selectedExercises
    .filter(se => completedSets.some(cs => cs.exerciseId === se.exercise.id))
    .map(se => {
      const doneIdx = completedSets
        .filter(cs => cs.exerciseId === se.exercise.id)
        .map(cs => cs.setIndex)
      const doneSets = doneIdx.map(i => se.sets[i]).filter(Boolean)
      const best = doneSets.reduce(
        (a, b) => (b.weight > a.weight ? b : a), doneSets[0] ?? { weight: 0, reps: 0 })
      return {
        name: se.exercise.name,
        modality: se.exercise.modality ?? '',
        count: doneSets.length,
        topWeight: best?.weight ?? 0,
        topReps: best?.reps ?? 0,
      }
    })
  const muscles = new Set<string>()
  selectedExercises.forEach(se => {
    if (completedSets.some(cs => cs.exerciseId === se.exercise.id))
      se.exercise.muscles.forEach(m => muscles.add(m.name))
  })
  return {
    exercises,
    muscles: [...muscles],
    setsLogged: completedSets.length,
    elapsed,
  }
}

// mm:ss — rounds first, so derived values (e.g. pace = 1000 / speed) don't
// leak their fractional seconds into the string.
export function fmtTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

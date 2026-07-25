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

// ── Exercise emoji (the data model has no icon field) ─────────────────────
export function exerciseEmoji(ex?: Pick<Exercise, 'modality'>): string {
  switch (ex?.modality) {
    case 'Cardio':       return '🏃'
    case 'Mobility':     return '🧘'
    case 'Calisthenics': return '🤸'
    case 'Strength':     return '🏋️'
    default:             return '💪'
  }
}

// mm:ss
export function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.max(0, seconds) % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

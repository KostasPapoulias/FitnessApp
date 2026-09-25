import { useAuthStore } from '../../store/useAuthStore'

/**
 * Which body illustration to colour. Loaded via `import.meta.glob`, so the
 * female artwork is optional and a missing file falls back to the default.
 */

// Narrowed to front5*/back5* — an eager raw glob inlines every match into the bundle.
const files = import.meta.glob(['../../assets/front5*.svg', '../../assets/back5*.svg'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const byName: Record<string, string> = {}
for (const [path, contents] of Object.entries(files)) {
  byName[path.slice(path.lastIndexOf('/') + 1)] = contents
}

export type BodySide = 'front' | 'back'

/** The body SVG for a side; only `female` switches, everything else uses the default. */
export const bodySvg = (side: BodySide, gender?: string | null): string => {
  const base = `${side}5.svg`
  const female = gender?.toLowerCase().trim() === 'female'
  return (female ? byName[`${side}5-female.svg`] : undefined) ?? byName[base] ?? ''
}

/** Vertical lift for the female figure, whose trace has a proportionally taller head. */
export const bodyOffsetY = (gender?: string | null): string =>
  gender?.toLowerCase().trim() === 'female' ? '-12%' : '0%'

/** The signed-in athlete's recorded gender, for callers that draw a body. */
export const useBodyGender = (): string | null =>
  useAuthStore(s => s.user?.profile?.gender ?? null)

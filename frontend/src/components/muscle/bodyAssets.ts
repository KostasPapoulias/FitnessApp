import { useAuthStore } from '../../store/useAuthStore'

/**
 * Which body illustration to draw the fatigue colours onto.
 *
 * Resolved through `import.meta.glob` rather than static imports so the female
 * artwork is optional: a build with only the default files still compiles, and
 * dropping `front5-female.svg` / `back5-female.svg` into `assets/` switches it
 * on with no code change. A missing file falls back rather than breaking, which
 * is the behaviour that matters — this is a picture, and half a body map is
 * worse than the wrong one.
 */

// Narrowed to the two families rather than `*.svg`: an eager raw glob inlines
// every match into the bundle as a string, and the ungrouped source artwork
// sitting beside these would ship with it for nothing.
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

/**
 * `male` is the default rather than a choice.
 *
 * `other` and `prefer_not_to_say` are real answers in the onboarding
 * vocabulary, and neither implies an anatomy to draw — they get the default
 * body, the same as an unanswered profile. Guessing from anything else on the
 * profile would be worse than defaulting.
 */
export const bodySvg = (side: BodySide, gender?: string | null): string => {
  const base = `${side}5.svg`
  if (gender?.toLowerCase().trim() !== 'female') return byName[base]
  return byName[`${side}5-female.svg`] ?? byName[base]
}

/**
 * How far up to lift a body inside its box, as a share of the box height.
 *
 * Both figures fill their box top to bottom, so the female does not render
 * lower — she reads lower. Her trace gives the head about 19% of the figure's
 * height where the male's takes 8%, which pushes her whole torso down the
 * screen at the same scale.
 *
 * The number is measured, not eyeballed: her trap line sits at 0.201 of the
 * figure height against his 0.160, and chest at 0.266 against 0.227. Lifting by
 * 4% puts her shoulders where his are. The mismatch shrinks down the body and
 * is gone by the calves, so this trades a slightly high foot line for a torso
 * that lines up — the torso is what the eye reads.
 *
 * A lift and not a rescale: her viewBox is narrower (0.44 against 0.50), so she
 * already renders about 10% narrower in the same box, and refitting her to gain
 * vertical slack would only widen that gap.
 */
export const bodyOffsetY = (gender?: string | null): string =>
  gender?.toLowerCase().trim() === 'female' ? '-12%' : '0%'

/** The signed-in athlete's recorded gender, for callers that draw a body. */
export const useBodyGender = (): string | null =>
  useAuthStore(s => s.user?.profile?.gender ?? null)

import { useEffect } from 'react'
import { create } from 'zustand'
import { useOnboardingStore } from '../../store/useOnboardingStore'

// A single contextual tip, anchored to real UI with the user's own data in it.
//
// Chosen over an intro slideshow deliberately: explaining the body map against
// a blank body map is abstract, and a deck shown before the app has any of your
// data gets tapped through. These appear the first time you reach the screen
// they describe, and never again once dismissed.
//
// Only ONE is visible at a time app-wide — see useCoachMark below. Two tooltips
// on one screen is a nag, not an explanation.

export const HINTS = {
  readiness:   'home.readiness',
  bodyMap:     'home.bodyMap',
  aiStrip:     'home.aiStrip',
  workout:     'workout.start',
  calendar:    'calendar.history',
  trainingSetup: 'home.trainingSetup',
  // Two, because discovering that voice exists and learning what to say to it
  // happen on different screens, minutes apart, and the second only makes sense
  // once there is a live set on screen to talk about.
  voiceSetup:  'workout.voiceSetup',
  voiceLive:   'workout.voiceLive',
} as const

export type HintKey = typeof HINTS[keyof typeof HINTS]

// Which hints are currently mounted, and at what priority.
//
// A store rather than a module-level Map because the competing hints are
// siblings with no shared parent — Home's readiness badge and its body map sit
// side by side. A plain Map would be read during the first render, before the
// later siblings had registered, and the wrong one would win until something
// else happened to re-render.
interface RegistryStore {
  mounted: Record<string, number>
  register: (key: string, priority: number) => void
  unregister: (key: string) => void
}

const useRegistry = create<RegistryStore>()((set) => ({
  mounted: {},
  register: (key, priority) =>
    set(s => ({ mounted: { ...s.mounted, [key]: priority } })),
  unregister: (key) =>
    set(s => {
      const { [key]: _removed, ...rest } = s.mounted
      return { mounted: rest }
    }),
}))

/**
 * Decides whether a given hint should be on screen right now.
 *
 * `priority` breaks ties when several unseen hints share a screen: the lowest
 * number wins and the rest wait until it is dismissed. Without an ordering the
 * render order decides, which changes whenever the JSX is rearranged.
 */
export const useCoachMark = (
  hintKey: HintKey,
  { enabled = true, priority = 0 }: { enabled?: boolean; priority?: number } = {}
) => {
  const { loaded, seenHints, dismissHint } = useOnboardingStore()
  const mounted = useRegistry(s => s.mounted)
  const register = useRegistry(s => s.register)
  const unregister = useRegistry(s => s.unregister)

  // A hint that is disabled (its screen is loading, say) must not hold the
  // single visible slot hostage while it waits.
  useEffect(() => {
    if (!enabled) return
    register(hintKey, priority)
    return () => unregister(hintKey)
  }, [hintKey, priority, enabled, register, unregister])

  let winner: string | null = null
  let bestPriority = Infinity
  for (const [key, p] of Object.entries(mounted)) {
    if (seenHints.has(key)) continue
    if (p < bestPriority) { winner = key; bestPriority = p }
  }

  return {
    visible: loaded && enabled && !seenHints.has(hintKey) && winner === hintKey,
    dismiss: () => dismissHint(hintKey),
  }
}

type Placement = 'top' | 'bottom'

export default function CoachMark({
  hintKey, title, body, placement = 'bottom', enabled = true, priority = 0, className = '',
}: {
  hintKey: HintKey
  title: string
  body: string
  placement?: Placement
  enabled?: boolean
  priority?: number
  className?: string
}) {
  const { visible, dismiss } = useCoachMark(hintKey, { enabled, priority })

  if (!visible) return null

  return (
    <div
      className={`absolute z-30 w-64 ${className}
                  ${placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'}`}
      role="status"
    >
      {/* Arrow. Rotated square rather than a border triangle so it inherits the
          same background and border as the card and stays attached to it. */}
      <div
        className={`absolute left-6 w-3 h-3 rotate-45 bg-dark-700 border-brand-teal/40
                    ${placement === 'bottom'
                      ? '-top-1.5 border-l border-t'
                      : '-bottom-1.5 border-r border-b'}`}
      />

      <div className="relative bg-dark-700 border border-brand-teal/40 rounded-card
                      px-4 py-3 shadow-lg shadow-black/40">
        <p className="text-brand-teal text-xs font-bold uppercase tracking-wide mb-1">
          {title}
        </p>
        <p className="text-dark-200 text-sm leading-relaxed">{body}</p>
        <button
          onClick={dismiss}
          className="text-white text-xs font-semibold mt-2.5 active:opacity-60"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

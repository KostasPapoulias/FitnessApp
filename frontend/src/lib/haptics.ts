import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

/**
 * Vibration through @capacitor/haptics (which covers the web too), with a
 * `navigator.vibrate` fallback. Every call is best-effort and never throws.
 */

const vibrate = (pattern: number | number[]) => {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  } catch {
    // A device that won't vibrate is not an error
  }
}

/** Rest is over — the strongest pattern, to be felt from across the room. */
export const hapticRestComplete = async () => {
  try {
    await Haptics.notification({ type: NotificationType.Success })
  } catch {
    vibrate([200, 100, 200, 100, 300])
  }
}

/** A set was logged. One short confirmation tap. */
export const hapticSetLogged = async () => {
  try {
    await Haptics.impact({ style: ImpactStyle.Medium })
  } catch {
    vibrate(60)
  }
}

/** A voice command was understood and is about to run. */
export const hapticCommandHeard = async () => {
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    vibrate(35)
  }
}

/** Rest is nearly over — a quiet nudge to rack up and get set. */
export const hapticCountdownTick = async () => {
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    vibrate(25)
  }
}

/** A split, round or lap during continuous effort — heavier, to be felt while moving. */
export const hapticMilestone = async () => {
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy })
  } catch {
    vibrate([90, 60, 90])
  }
}

/** Switch sides mid-hold: two long pulses, unique in the app. */
export const hapticSwitchSide = async () => {
  try {
    await Haptics.notification({ type: NotificationType.Warning })
  } catch {
    vibrate([160, 90, 160])
  }
}

/** Start a scrub selection; iOS drops `selectionChanged` outside a start/end pair. */
export const hapticSelectionStart = async () => {
  try { await Haptics.selectionStart() } catch { /* best-effort, see above */ }
}

/** One notch on the scrubber — the lightest tick available. */
export const hapticSelectionTick = async () => {
  try {
    await Haptics.selectionChanged()
  } catch {
    vibrate(8)
  }
}

export const hapticSelectionEnd = async () => {
  try { await Haptics.selectionEnd() } catch { /* best-effort, see above */ }
}

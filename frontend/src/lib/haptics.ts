import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

/**
 * Vibration, on whatever the device actually offers.
 *
 * @capacitor/haptics has a web implementation over `navigator.vibrate`, so the
 * plugin call is the single path for native and browser alike. The explicit
 * fallback below is for the case its web layer refuses rather than vibrates —
 * and every call is best-effort: a phone with the taptic engine disabled, or
 * iOS Safari (which implements none of this), must not throw into a workout.
 */

const vibrate = (pattern: number | number[]) => {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  } catch {
    // A device that won't vibrate is not an error worth surfacing mid-set.
  }
}

/** Rest is over. Deliberately the loudest pattern in the app — it has to carry
 *  from a phone face-down on a bench across the room. */
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

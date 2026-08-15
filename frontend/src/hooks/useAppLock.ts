import { useCallback, useEffect, useRef, useState } from 'react'
import { securityService } from '../services/security.service'
import { useWorkoutStore } from '../store/useWorkoutStore'

/**
 * Whether the app should be showing its PIN screen.
 *
 * Locks on launch, and again after the app has been in the background long
 * enough that someone else could plausibly have picked up the phone. Glancing
 * away for a few seconds does not count — a lock that fires every time you
 * check a message is one people turn off.
 *
 * Unlocked state lives in sessionStorage, so it survives a reload of the same
 * tab but never a fresh launch.
 *
 * Whether a PIN exists is cached on the device and believed on launch, so the
 * pad is the FIRST thing painted rather than something that drops over an app
 * the user has already started reading. Waiting for the server meant a round
 * trip to a remote database — a few hundred milliseconds of app, then a lock.
 * Caching it weakens nothing: the PIN itself is only ever checked server-side,
 * so a tampered flag can at worst show a pad that any correct PIN opens, or
 * skip a pad in front of an app the device owner was already signed into.
 */

const UNLOCK_KEY = 'somatrack_unlocked'
/** Device-local mirror of "this account has a PIN". A hint, never a decision. */
const PIN_CACHE_KEY = 'somatrack_pin_enabled'
/** Background time before re-locking. */
const GRACE_MS = 2 * 60 * 1000

const cachedPinEnabled = () => localStorage.getItem(PIN_CACHE_KEY) === '1'
const sessionUnlocked = () => sessionStorage.getItem(UNLOCK_KEY) === '1'

/**
 * Keep the launch-time hint in step with the server.
 *
 * Anything that adds or removes a PIN must call this. A stale `true` is the
 * dangerous direction: the next launch would present a pad for a PIN that no
 * longer exists, and since the PIN is verified server-side there would be no
 * way through it but signing out.
 */
export const rememberPinEnabled = (enabled: boolean) =>
  localStorage.setItem(PIN_CACHE_KEY, enabled ? '1' : '0')

export const useAppLock = (isAuthenticated: boolean) => {
  const [pinEnabled, setPinEnabled] = useState(cachedPinEnabled)
  // `isAuthenticated` is already correct on the first render — it is seeded
  // from the stored token — so this initialiser can be trusted, and a locked
  // device paints its pad before anything else has a chance to.
  const [locked, setLocked] = useState(
    () => isAuthenticated && cachedPinEnabled() && !sessionUnlocked()
  )
  const [checked, setChecked] = useState(false)
  const hiddenSince = useRef<number | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      // Signed out. The cache is per-account, and leaving it set would show the
      // next person to sign in on this device a pad belonging to someone else.
      localStorage.removeItem(PIN_CACHE_KEY)
      setPinEnabled(false)
      setLocked(false)
      setChecked(true)
      return
    }

    let cancelled = false
    securityService.getPinStatus()
      .then(status => {
        if (cancelled) return
        setPinEnabled(status.enabled)
        rememberPinEnabled(status.enabled)
        // sessionStorage is cleared when the app is closed, so a fresh launch
        // always locks even though a reload does not.
        setLocked(status.enabled && !sessionUnlocked())
      })
      .catch(() => {
        // Can't reach the server: don't lock the user out of an app they may
        // be able to use offline. The gate is convenience, not authorisation —
        // and a PIN cannot be verified from here anyway, so an optimistic lock
        // held now would be a lock with no way out of it.
        if (!cancelled) setLocked(false)
      })
      .finally(() => { if (!cancelled) setChecked(true) })

    return () => { cancelled = true }
  }, [isAuthenticated])

  // Re-lock after a spell in the background
  useEffect(() => {
    if (!pinEnabled) return

    const onVisibility = () => {
      if (document.hidden) {
        hiddenSince.current = Date.now()
        return
      }
      const away = hiddenSince.current ? Date.now() - hiddenSince.current : 0
      hiddenSince.current = null

      // Never lock over a live session. Pressing the side button mid-run is
      // reflexive — pocketing the phone at a crossing — and coming back to a
      // PIN pad on top of a running clock is the opposite of what this gate is
      // for: the phone never left the owner's hand. Read rather than
      // subscribed, so an active workout does not re-render the lock gate.
      const inSession = useWorkoutStore.getState().sessionId !== null

      if (away > GRACE_MS && !inSession) {
        sessionStorage.removeItem(UNLOCK_KEY)
        setLocked(true)
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pinEnabled])

  const unlock = useCallback(() => {
    sessionStorage.setItem(UNLOCK_KEY, '1')
    setLocked(false)
  }, [])

  /** Called after enabling a PIN in settings, so it doesn't lock immediately. */
  const markEnabled = useCallback((enabled: boolean) => {
    setPinEnabled(enabled)
    rememberPinEnabled(enabled)
    if (enabled) sessionStorage.setItem(UNLOCK_KEY, '1')
  }, [])

  // `locked` is no longer gated on `checked`: the cached flag is what makes the
  // pad appear on the first frame, and requiring the server's answer first is
  // exactly the delay this hook exists to remove. `checked` is still returned
  // so App can hold its splash until the answer lands.
  // Anded with auth rather than trusted on its own: signing out from the pad
  // itself clears auth synchronously and the unlock only lands in an effect,
  // which left the pad on screen for a frame after the account it belonged to
  // was gone.
  return { locked: locked && isAuthenticated, checked, unlock, pinEnabled, markEnabled }
}

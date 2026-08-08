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
 */

const UNLOCK_KEY = 'somatrack_unlocked'
/** Background time before re-locking. */
const GRACE_MS = 2 * 60 * 1000

export const useAppLock = (isAuthenticated: boolean) => {
  const [pinEnabled, setPinEnabled] = useState(false)
  const [locked, setLocked] = useState(false)
  const [checked, setChecked] = useState(false)
  const hiddenSince = useRef<number | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
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
        // sessionStorage is cleared when the app is closed, so a fresh launch
        // always locks even though a reload does not.
        const alreadyUnlocked = sessionStorage.getItem(UNLOCK_KEY) === '1'
        setLocked(status.enabled && !alreadyUnlocked)
      })
      .catch(() => {
        // Can't reach the server: don't lock the user out of an app they may
        // be able to use offline. The gate is convenience, not authorisation.
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
    if (enabled) sessionStorage.setItem(UNLOCK_KEY, '1')
  }, [])

  return { locked: locked && checked, unlock, pinEnabled, markEnabled }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { securityService } from '../services/security.service'
import { useWorkoutStore } from '../store/useWorkoutStore'

/**
 * Whether to show the PIN screen: on launch, and after 2+ minutes in the
 * background (never over a live session). Unlocked state lives in
 * sessionStorage. Whether a PIN exists is cached on the device and trusted on
 * the first frame, so the pad paints first; the PIN itself is only ever
 * verified by the server.
 */

const UNLOCK_KEY = 'somatrack_unlocked'
/** Device-local mirror of "this account has a PIN" — a hint, never a decision. */
const PIN_CACHE_KEY = 'somatrack_pin_enabled'
/** Background time before re-locking. */
const GRACE_MS = 2 * 60 * 1000

const cachedPinEnabled = () => localStorage.getItem(PIN_CACHE_KEY) === '1'
const sessionUnlocked = () => sessionStorage.getItem(UNLOCK_KEY) === '1'

/**
 * Keep the cached flag in step with the server. Anything that adds or removes
 * a PIN must call this — a stale `true` would show a pad with no PIN behind it.
 */
export const rememberPinEnabled = (enabled: boolean) =>
  localStorage.setItem(PIN_CACHE_KEY, enabled ? '1' : '0')

export const useAppLock = (isAuthenticated: boolean) => {
  const [pinEnabled, setPinEnabled] = useState(cachedPinEnabled)
  // Safe on the first render: isAuthenticated is seeded from the stored token
  const [locked, setLocked] = useState(
    () => isAuthenticated && cachedPinEnabled() && !sessionUnlocked()
  )
  const [checked, setChecked] = useState(false)
  const hiddenSince = useRef<number | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      // Signed out: clear the per-account cache
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
        // A fresh launch always locks; a reload (same session) does not
        setLocked(status.enabled && !sessionUnlocked())
      })
      .catch(() => {
        // Offline: don't lock — a PIN can't be verified without the server
        if (!cancelled) setLocked(false)
      })
      .finally(() => { if (!cancelled) setChecked(true) })

    return () => { cancelled = true }
  }, [isAuthenticated])

  // Re-lock after time in the background
  useEffect(() => {
    if (!pinEnabled) return

    const onVisibility = () => {
      if (document.hidden) {
        hiddenSince.current = Date.now()
        return
      }
      const away = hiddenSince.current ? Date.now() - hiddenSince.current : 0
      hiddenSince.current = null

      // Never lock over a live session (read, not subscribed, to avoid re-renders)
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

  // `locked` does not wait for the server (the cached flag paints the pad
  // first); `checked` lets App hold its splash. ANDed with auth so signing out
  // from the pad removes it at once.
  return { locked: locked && isAuthenticated, checked, unlock, pinEnabled, markEnabled }
}

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Keeps the screen awake during a live session — iOS suspends JavaScript (and
 * GPS) when the screen sleeps. It cannot stop a deliberate side-button press;
 * useRunTracker records those gaps.
 */

// Not in older TS DOM lib definitions; requesting it does not depend on this.
type WakeLockSentinelLike = { released: boolean; release: () => Promise<void> }

const supported = (): boolean =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator

export const useWakeLock = () => {
  const sentinel = useRef<WakeLockSentinelLike | null>(null)
  const wanted = useRef(false)
  const [held, setHeld] = useState(false)

  const acquire = useCallback(async () => {
    if (!supported() || sentinel.current) return
    try {
      const lock = await (navigator as any).wakeLock.request('screen')
      sentinel.current = lock
      setHeld(true)
      // The browser drops the lock when the page hides; clearing our handle lets it be re-requested
      lock.addEventListener?.('release', () => {
        sentinel.current = null
        setHeld(false)
      })
    } catch {
      // Denied or lost focus: tracking continues while the screen stays on
      setHeld(false)
    }
  }, [])

  /** Must be called from a user gesture (iOS). Call it in the Start handler. */
  const request = useCallback(() => {
    wanted.current = true
    void acquire()
  }, [acquire])

  const release = useCallback(() => {
    wanted.current = false
    const lock = sentinel.current
    sentinel.current = null
    setHeld(false)
    void lock?.release().catch(() => {})
  }, [])

  // Re-acquire on returning to the foreground, plus a poll — a lock can also
  // drop while visible with no event at all
  useEffect(() => {
    const reacquire = () => {
      if (!document.hidden && wanted.current && !sentinel.current) void acquire()
    }
    document.addEventListener('visibilitychange', reacquire)
    const poll = window.setInterval(reacquire, 20_000)
    return () => {
      document.removeEventListener('visibilitychange', reacquire)
      clearInterval(poll)
    }
  }, [acquire])

  // Release on unmount
  useEffect(() => () => {
    void sentinel.current?.release().catch(() => {})
  }, [])

  return { request, release, held, supported: supported() }
}

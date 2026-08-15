import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Keeps the screen awake for the duration of a live session.
 *
 * This is the whole reason outdoor tracking works at all in a web app: iOS
 * suspends JavaScript the instant the screen sleeps, and a suspended page reads
 * no GPS. Holding a wake lock keeps the page running, at the cost of the single
 * largest battery draw a phone has.
 *
 * What it does NOT do is survive a deliberate press of the side button. Wake
 * lock prevents the screen TIMING OUT; nothing in a browser can stop someone
 * putting the phone to sleep on purpose. Tracking pauses when they do, which is
 * why useRunTracker records gaps rather than assuming continuity.
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
      // The browser drops the lock on its own when the page is hidden. Clearing
      // our handle here is what lets the visibility listener re-request it.
      lock.addEventListener?.('release', () => {
        sentinel.current = null
        setHeld(false)
      })
    } catch {
      // Denied, or the tab lost focus mid-request. The session still tracks
      // for as long as the screen happens to stay on.
      setHeld(false)
    }
  }, [])

  /**
   * Must be called from a user gesture — iOS rejects a request that is not tied
   * to one, and a `useEffect` fires after paint, outside the activation window.
   * Call it directly in the Start handler.
   */
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

  // Re-acquire on return to the foreground. Switching apps, a notification
  // pulled down, an incoming call — all release the lock, and none of them
  // should end a run that is still going.
  //
  // The poll is not redundant with the visibility listener. A lock can also be
  // dropped while the page stays visible — a low-battery mode kicking in, the
  // OS reclaiming it, or a `release` event that never fires at all — and there
  // is no event for any of those. Without it the screen quietly starts sleeping
  // again mid-run and nothing in the app knows.
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

  // A lock outliving the component would keep the screen lit on a screen that
  // no longer needs it
  useEffect(() => () => {
    void sentinel.current?.release().catch(() => {})
  }, [])

  return { request, release, held, supported: supported() }
}

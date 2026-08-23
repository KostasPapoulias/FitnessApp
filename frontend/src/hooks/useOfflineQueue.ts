import { useEffect } from 'react'
import { useWorkoutStore } from '../store/useWorkoutStore'

/**
 * Keeps the offline set outbox draining without anyone having to think about it.
 *
 * Mounted once, in `AppLayout`. Three triggers, and each covers a case the
 * others miss:
 *
 *  - **on mount** — the app was closed while sets were still queued. This is
 *    also what recomputes the badge count after a cold launch, since the store
 *    starts at 0 and the queue lives in IndexedDB.
 *  - **`online`** — the browser's own signal. Reliable when it fires and
 *    absolutely not guaranteed to: a phone can hold a Wi-Fi association with no
 *    route to the internet and never fire it at all.
 *  - **returning to the foreground** — which is what actually happens in a
 *    basement. The athlete walks up the stairs with the screen locked; there is
 *    no `online` event because the connection never technically dropped, and
 *    the next thing the app sees is `visibilitychange`.
 *
 * A failed flush is not retried on a timer. The queue is not urgent — the
 * ordering that matters is enforced in `finishSession`, which drains it before
 * turning sets into fatigue — and a retry loop on a phone with no signal is
 * just battery.
 */
export function useOfflineQueue(): void {
  const flush = useWorkoutStore(s => s.flushSetQueue)

  useEffect(() => {
    void flush()

    const onOnline = () => { void flush() }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flush()
    }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [flush])
}

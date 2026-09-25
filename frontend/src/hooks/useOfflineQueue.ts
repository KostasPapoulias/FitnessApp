import { useEffect } from 'react'
import { useWorkoutStore } from '../store/useWorkoutStore'

/**
 * Drains the offline set outbox (mounted once in AppLayout): on mount, on the
 * `online` event, and on returning to the foreground — `online` often never
 * fires. No timer retries; finishSession drains the queue itself.
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

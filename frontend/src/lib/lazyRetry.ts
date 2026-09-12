import { ComponentType, lazy } from 'react'

// React.lazy with one retry. A dropped chunk fetch throws during render, and
// without this the nearest boundary replaces the whole screen.
export const lazyRetry = <P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>
) =>
  lazy(() =>
    load().catch(async error => {
      // Long enough for a flaky connection to come back, short enough that
      // nobody standing there with a running clock notices the difference.
      await new Promise(resolve => setTimeout(resolve, 900))
      return load().catch(() => { throw error })
    })
  )

/** Prefetch a chunk so the fetch happens before it is needed. */
export const warmChunk = (load: () => Promise<unknown>): void => {
  void load().catch(() => {})
}

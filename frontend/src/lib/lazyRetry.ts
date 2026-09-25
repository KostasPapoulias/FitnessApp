import { ComponentType, lazy } from 'react'

// React.lazy with one retry, so a dropped chunk fetch does not replace the screen.
export const lazyRetry = <P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>
) =>
  lazy(() =>
    load().catch(async error => {
      // Brief pause for a flaky connection
      await new Promise(resolve => setTimeout(resolve, 900))
      return load().catch(() => { throw error })
    })
  )

/** Prefetch a chunk so the fetch happens before it is needed. */
export const warmChunk = (load: () => Promise<unknown>): void => {
  void load().catch(() => {})
}

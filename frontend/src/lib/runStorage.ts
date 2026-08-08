/**
 * Crash-survival for a run in progress.
 *
 * Everything a live session knows lives in React state, and React state is gone
 * the moment the page reloads — a pull-to-refresh, an OS kill under memory
 * pressure, a stray navigation. Losing forty minutes of running to that is the
 * failure people do not forgive, so the session is mirrored to IndexedDB as it
 * accumulates and read back on launch.
 *
 * IndexedDB rather than localStorage: the point array reaches a hundred-odd
 * kilobytes on a long run, and localStorage writes are synchronous — flushing
 * that on the main thread every few seconds would show up as jank in the timer.
 */

import { TrackPoint } from './geo'

const DB_NAME = 'somatrack_run'
const DB_VERSION = 1
const STORE = 'active'
/** One record; a second concurrent run is not a thing. */
const KEY = 'current'

/** A saved run older than this is treated as abandoned, not resumable. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000

/** A pause the app did not take deliberately — a lock, a reload, a kill. */
export interface TrackGap {
  from: number
  to: number
}

export interface SavedRun {
  /** Which activity this belongs to, so a run is never resumed into another. */
  activityKey: string
  startedAt: number
  /** Milliseconds deliberately paused, excluded from elapsed. */
  pausedMs: number
  meters: number
  points: TrackPoint[]
  gaps: TrackGap[]
  /** Last time this record was written — the basis for detecting dead time. */
  savedAt: number
}

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

/**
 * Every operation here is best-effort. Private browsing, a full disk and a
 * corrupt database all throw, and none of them is a reason to interrupt a run
 * that is otherwise being tracked perfectly well — the persistence is
 * insurance, and insurance that crashes the thing it protects is worse than
 * none.
 */
const withStore = async <T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> => {
  try {
    const db = await openDb()
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, mode)
      const request = work(tx.objectStore(STORE))
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
      tx.oncomplete = () => db.close()
    })
  } catch {
    return null
  }
}

export const saveRun = (run: SavedRun): Promise<unknown> =>
  withStore('readwrite', store => store.put(run, KEY))

export const clearRun = (): Promise<unknown> =>
  withStore('readwrite', store => store.delete(KEY))

/**
 * Load a resumable run, or null.
 *
 * Anything stale is deleted rather than returned — an abandoned run from
 * yesterday reappearing on the start screen is worse than losing it, because
 * the user has to work out what it is before they can get rid of it.
 */
export const loadRun = async (activityKey: string): Promise<SavedRun | null> => {
  const saved = await withStore<SavedRun>('readonly', store => store.get(KEY))
  if (!saved) return null

  const stale = Date.now() - saved.savedAt > STALE_AFTER_MS
  if (stale || saved.activityKey !== activityKey) {
    if (stale) await clearRun()
    return null
  }

  return saved
}

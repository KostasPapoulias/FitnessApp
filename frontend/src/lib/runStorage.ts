/**
 * Crash survival for a run in progress: the live session is mirrored to
 * IndexedDB (async, unlike localStorage) and read back on launch.
 */

import { Split, SplitState, TrackPoint } from './geo'

const DB_NAME = 'somatrack_run'
const DB_VERSION = 1
const STORE = 'active'
/** A single record — only one run at a time. */
const KEY = 'current'

/** A saved run older than this is treated as abandoned, not resumable. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000

/** An unplanned pause: a lock, a reload, a kill. */
export interface TrackGap {
  from: number
  to: number
}

export interface SavedRun {
  /** The activity it belongs to, so a run is never resumed into another. */
  activityKey: string
  startedAt: number
  /** Milliseconds deliberately paused, excluded from elapsed. */
  pausedMs: number
  meters: number
  points: TrackPoint[]
  gaps: TrackGap[]
  /** Splits and their running state, mirrored (they cannot be rebuilt from the simplified track). */
  splitState?: SplitState
  /** Laps the athlete marked by hand. */
  laps?: Split[]
  /** Last write time, used to detect dead time. */
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

/** Every operation is best-effort — storage failures must never interrupt a run. */
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

/** Load a resumable run, or null; stale records are deleted. */
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

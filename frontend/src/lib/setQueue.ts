/**
 * IndexedDB outbox for sets logged without a connection. Replay is safe
 * because the API upserts on (workoutExerciseId, setNumber). Same best-effort
 * pattern as runStorage.ts.
 */

const DB_NAME = 'somatrack_outbox'
const DB_VERSION = 1
const STORE = 'sets'

/** Queued sets older than this are dropped — their session is long finished. */
export const QUEUE_STALE_AFTER_MS = 24 * 60 * 60 * 1000

/** Give up on an entry the server keeps refusing. */
const MAX_ATTEMPTS = 8

export interface QueuedSet {
  /** `${sessionId}:${workoutExerciseId}:${setNumber}` — the upsert key. */
  id: string
  sessionId: string
  /** The body `workoutService.logSet` would have posted. */
  payload: Record<string, unknown>
  queuedAt: number
  attempts: number
}

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

/** Every operation is best-effort — storage failures never interrupt a workout. */
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

export const queueKey = (
  sessionId: string,
  workoutExerciseId: string,
  setNumber: number
): string => `${sessionId}:${workoutExerciseId}:${setNumber}`

/** Add or replace a queued set (re-logging offline is a correction, as online). */
export const enqueueSet = async (
  sessionId: string,
  payload: Record<string, unknown>
): Promise<boolean> => {
  const workoutExerciseId = String(payload.workoutExerciseId ?? '')
  const setNumber = Number(payload.setNumber ?? 0)
  if (!workoutExerciseId || !setNumber) return false

  const entry: QueuedSet = {
    id: queueKey(sessionId, workoutExerciseId, setNumber),
    sessionId,
    payload,
    queuedAt: Date.now(),
    attempts: 0,
  }

  const result = await withStore('readwrite', store => store.put(entry))
  return result !== null
}

export const queuedSets = async (): Promise<QueuedSet[]> => {
  const all = await withStore<QueuedSet[]>('readonly', store => store.getAll())
  if (!all) return []

  const fresh = all.filter(entry => Date.now() - entry.queuedAt <= QUEUE_STALE_AFTER_MS)
  if (fresh.length !== all.length) {
    await Promise.all(
      all.filter(e => !fresh.includes(e)).map(e => withStore('readwrite', s => s.delete(e.id)))
    )
  }

  // Oldest first, so a partial flush saves the earlier sets
  return fresh.sort((a, b) => a.queuedAt - b.queuedAt)
}

export const queuedCount = async (): Promise<number> => (await queuedSets()).length

export const dequeueSet = (id: string): Promise<unknown> =>
  withStore('readwrite', store => store.delete(id))

export const recordAttempt = async (entry: QueuedSet): Promise<void> => {
  const attempts = entry.attempts + 1
  if (attempts >= MAX_ATTEMPTS) {
    // Permanently refused: drop it so the queue can drain
    await dequeueSet(entry.id)
    return
  }
  await withStore('readwrite', store => store.put({ ...entry, attempts }))
}

/** Drop everything for one session — used when a session is deleted. */
export const clearSessionQueue = async (sessionId: string): Promise<void> => {
  const all = await queuedSets()
  await Promise.all(
    all.filter(e => e.sessionId === sessionId).map(e => dequeueSet(e.id))
  )
}

/**
 * Whether a failure means "no connection" (queue it) rather than "rejected"
 * (drop it): no axios `response`, or a 5xx.
 */
export const isRetriableFailure = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response?.status
  if (status === undefined) return true
  return status >= 500 || status === 408 || status === 429
}

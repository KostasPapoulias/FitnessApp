/**
 * The outbox for sets logged with no connection.
 *
 * Gyms are basements. `completeSet` posted straight to Railway and, on failure,
 * did nothing but set "Check your connection and log it again" — which is
 * advice the athlete cannot act on until they walk outside, and by then they
 * have done three more sets they also cannot log.
 *
 * IndexedDB, and the shape deliberately mirrors `runStorage.ts`: same
 * best-effort wrapper, same "persistence must never break the thing it
 * protects" rule. localStorage would be simpler, but its writes are synchronous
 * on the main thread and this runs during a rest timer.
 *
 * What makes replay safe is a property of the backend, not of this file: the
 * API upserts a set on `(workoutExerciseId, setNumber)`, so sending the same
 * entry twice corrects it in place rather than double-counting volume and
 * fatigue. That is why an entry can be retried without any coordination, and
 * why a flush that half-succeeds is not a problem.
 */

const DB_NAME = 'somatrack_outbox'
const DB_VERSION = 1
const STORE = 'sets'

/**
 * A queued set older than this is dropped rather than sent.
 *
 * Not arbitrary: past this point the session it belongs to has almost certainly
 * been finished (or swept as abandoned by the backend), and a set arriving
 * after the finish is not counted in that session's fatigue anyway — it would
 * just sit in the database as a row nothing derives from. Silently correct
 * history days later is worse than losing one set.
 */
export const QUEUE_STALE_AFTER_MS = 24 * 60 * 60 * 1000

/** Give up on an entry the server keeps refusing for a non-network reason. */
const MAX_ATTEMPTS = 8

export interface QueuedSet {
  /** `${sessionId}:${workoutExerciseId}:${setNumber}` — the upsert key. */
  id: string
  sessionId: string
  /** The exact body `workoutService.logSet` would have posted. */
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

/**
 * Every operation is best-effort — private browsing, a full disk and a corrupt
 * database all throw, and none of them is a reason to interrupt a workout.
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

export const queueKey = (
  sessionId: string,
  workoutExerciseId: string,
  setNumber: number
): string => `${sessionId}:${workoutExerciseId}:${setNumber}`

/**
 * Add or replace a queued set.
 *
 * Replace, not append: re-logging the same set while still offline is a
 * correction, exactly as it is online. Appending would replay both versions and
 * leave whichever happened to land last.
 */
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

  // Oldest first, so sets replay in the order they were performed. The backend
  // does not care, but a partial flush that stops halfway should leave the
  // EARLIER sets saved, not a scattered subset.
  return fresh.sort((a, b) => a.queuedAt - b.queuedAt)
}

export const queuedCount = async (): Promise<number> => (await queuedSets()).length

export const dequeueSet = (id: string): Promise<unknown> =>
  withStore('readwrite', store => store.delete(id))

export const recordAttempt = async (entry: QueuedSet): Promise<void> => {
  const attempts = entry.attempts + 1
  if (attempts >= MAX_ATTEMPTS) {
    // Something about this entry is permanently unacceptable to the server.
    // Retrying forever would mean a queue that never drains and a badge that
    // never clears, which reads as the app being broken.
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
 * Whether a failed request looks like "no connection" rather than "no".
 *
 * The distinction decides whether a set is queued or discarded, and getting it
 * wrong is bad in both directions: queueing a 400 means retrying a payload the
 * server will never accept until MAX_ATTEMPTS gives up, and discarding a
 * network failure loses the set the queue exists to save.
 *
 * Axios reports a network failure as an error with no `response` at all, which
 * is the only reliable signal available in a browser — the browser deliberately
 * does not say *why* a cross-origin request failed. A 5xx counts too: the
 * server is there but unable to accept the write, and that is worth retrying.
 */
export const isRetriableFailure = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response?.status
  if (status === undefined) return true
  return status >= 500 || status === 408 || status === 429
}

/**
 * The exercise catalogue, cached in memory.
 *
 * Measured against the real database, `GET /api/exercises` spent ~5 s of a
 * ~6.6 s response inside one `findMany` — and 165 of the 172 rows it returns
 * are seed data that changes only when the seed is re-run. Every open of the
 * exercise picker was re-reading a table that had not changed since deploy.
 *
 * Two things make the cache safe here, and neither is generally true:
 *
 *  - **The shared catalogue has no per-user component.** It is split from the
 *    athlete's own custom exercises deliberately, so the cached half is
 *    identical for everybody and the uncached half is the handful of rows they
 *    created themselves.
 *  - **Nothing derives from it being fresh.** Fatigue, readiness and
 *    progression all read training history, never this. A catalogue a few
 *    minutes stale shows an exercise's description slightly late; it cannot
 *    make a number wrong.
 *
 * Process-local, which means each Railway instance keeps its own copy and a
 * horizontal scale-out gives you N caches rather than a shared one. That is
 * fine at this size and deliberately not solved with Redis: the failure mode is
 * "one instance shows a new custom exercise a few minutes before another", and
 * the cure would be an entire piece of infrastructure.
 */

import prisma from '../lib/prisma'
import { log } from '../lib/logger'

/**
 * How long a cached catalogue is served before it is re-read.
 *
 * Five minutes rather than "forever with explicit invalidation only", because
 * the seed can be re-run against a live database (`prisma db seed` is documented
 * as safe to repeat) and that write happens entirely outside this process —
 * there is no hook it could fire. A TTL means the worst case is five minutes of
 * staleness rather than until the next deploy.
 */
const TTL_MS = 5 * 60 * 1000

/**
 * The fields the exercise list actually serialises.
 *
 * `select`, not `include`. The include-everything version pulled 270 KB from
 * the database to build a 127 KB response — every column of every joined row,
 * including ones the mapper drops on the floor.
 */
const CATALOGUE_SELECT = {
  id: true,
  name: true,
  description: true,
  createdByUserId: true,
  modalityId: true,
  modality: { select: { name: true } },
  muscleLinks: {
    select: { muscleId: true, impactFactor: true, muscle: { select: { name: true } } },
  },
  categoryLinks: { select: { category: { select: { id: true, name: true } } } },
  equipmentLinks: { select: { equipmentId: true, equipment: { select: { name: true } } } },
} as const

export type CatalogueExercise = Awaited<
  ReturnType<typeof prisma.exercise.findMany<{ select: typeof CATALOGUE_SELECT }>>
>[number]

interface CacheEntry {
  rows: CatalogueExercise[]
  loadedAt: number
}

let cache: CacheEntry | null = null

/**
 * In-flight load, shared by every caller that arrives while it is running.
 *
 * Without this, a cold start under load has every concurrent request miss the
 * cache and issue the same 5-second query — the cache would make the worst case
 * worse rather than better, which is the classic stampede.
 */
let inFlight: Promise<CatalogueExercise[]> | null = null

const loadSharedCatalogue = async (): Promise<CatalogueExercise[]> => {
  const rows = await prisma.exercise.findMany({
    // The shared half only. A user's own exercises are read per request.
    where: { createdByUserId: null },
    select: CATALOGUE_SELECT,
    orderBy: { name: 'asc' },
  })
  cache = { rows, loadedAt: Date.now() }
  return rows
}

/** The seed catalogue, from cache when it is warm and fresh. */
export const sharedCatalogue = async (): Promise<CatalogueExercise[]> => {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.rows

  if (inFlight) return inFlight

  inFlight = loadSharedCatalogue()
    .catch(error => {
      // A failed refresh must not evict a good cache. Serving a slightly stale
      // catalogue through a database blip is strictly better than serving an
      // error, and this endpoint is the exercise picker — the screen the
      // athlete is standing in the gym looking at.
      log.warn('Exercise catalogue refresh failed; serving stale', error)
      if (cache) return cache.rows
      throw error
    })
    .finally(() => { inFlight = null })

  return inFlight
}

/**
 * Drop the cache.
 *
 * Called when a custom exercise is created. Strictly speaking it need not be —
 * custom exercises are not in the cached half — but the count and the ordering
 * the client sees come from the merged list, and an invalidation here costs one
 * re-read on an action that already writes to the database.
 */
export const invalidateCatalogue = (): void => {
  cache = null
}

/** For tests and for the health of anyone debugging this. */
export const catalogueCacheState = (): { warm: boolean; ageMs: number | null; rows: number } => ({
  warm: cache !== null,
  ageMs: cache ? Date.now() - cache.loadedAt : null,
  rows: cache?.rows.length ?? 0,
})

/**
 * The athlete's own exercises. Never cached — there are a handful of them, they
 * are private to one user, and a newly created one has to appear immediately.
 */
export const customExercisesFor = (userId: string): Promise<CatalogueExercise[]> =>
  prisma.exercise.findMany({
    where: { createdByUserId: userId },
    select: CATALOGUE_SELECT,
    orderBy: { name: 'asc' },
  })

/**
 * Sort two catalogue rows the way Postgres does.
 *
 * `ignorePunctuation` is not cosmetic. Postgres's collation sorts "L-Sit Hold"
 * after "Leg Press" because it disregards the hyphen; a bare `localeCompare`
 * sorts it before "Lat Pulldown" because it does not. Moving the filtering out
 * of SQL therefore moved the ordering too, and four exercises silently changed
 * position in the picker. Verified against the live catalogue: with this
 * option, the in-memory order is identical to `ORDER BY name ASC`.
 */
export const byCatalogueName = (
  a: { name: string },
  b: { name: string }
): number => a.name.localeCompare(b.name, 'en', { ignorePunctuation: true })

/**
 * Filtering happens here, in memory, over the cached rows.
 *
 * It used to be a WHERE clause, which meant every distinct filter combination
 * was its own uncacheable query. Over ~172 rows the in-memory version is
 * microseconds and it is what makes one cached read serve every variation of
 * category / modality / search the picker can produce.
 */
export const filterCatalogue = (
  rows: CatalogueExercise[],
  filters: { category?: string; modality?: string; search?: string }
): CatalogueExercise[] => {
  const category = filters.category?.trim().toLowerCase()
  const modality = filters.modality?.trim().toLowerCase()
  const search = filters.search?.trim().toLowerCase()

  return rows.filter(exercise => {
    if (category && !exercise.categoryLinks.some(
      link => link.category.name.toLowerCase() === category
    )) return false

    if (modality && exercise.modality.name.toLowerCase() !== modality) return false

    // `contains … mode: 'insensitive'` in Postgres, reproduced exactly.
    if (search && !exercise.name.toLowerCase().includes(search)) return false

    return true
  })
}

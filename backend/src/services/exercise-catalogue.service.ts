/**
 * The shared exercise catalogue, cached in memory per process. Safe because it
 * is identical for every user and nothing numeric derives from it; each user's
 * custom exercises are read separately and never cached.
 */

import prisma from '../lib/prisma'
import { log } from '../lib/logger'

/** Cache lifetime; a TTL because re-running the seed happens outside this process. */
const TTL_MS = 5 * 60 * 1000

/** Only the fields the exercise list serialises. */
const CATALOGUE_SELECT = {
  id: true,
  name: true,
  description: true,
  createdByUserId: true,
  modalityId: true,
  modality: { select: { name: true } },
  // Calibration: turns distance into comparable work
  referenceSpeedKmh: true,
  // What measures the movement (gps / machine / reps) — decides the cardio screen
  cardioTracking: true,
  referenceCadenceRpm: true,
  repUnit: true,
  muscleLinks: {
    select: { muscleId: true, impactFactor: true, muscle: { select: { name: true } } },
  },
  categoryLinks: { select: { category: { select: { id: true, name: true } } } },
  equipmentLinks: { select: { equipmentId: true, equipment: { select: { name: true } } } },
  // Thumbnail only; the detail screen fetches the animation separately
  media: { select: { thumbnailUrl: true } },
} as const

export type CatalogueExercise = Awaited<
  ReturnType<typeof prisma.exercise.findMany<{ select: typeof CATALOGUE_SELECT }>>
>[number]

interface CacheEntry {
  rows: CatalogueExercise[]
  loadedAt: number
}

let cache: CacheEntry | null = null

/** Shared in-flight load, so a cold start does not issue the same query per request. */
let inFlight: Promise<CatalogueExercise[]> | null = null

const loadSharedCatalogue = async (): Promise<CatalogueExercise[]> => {
  const rows = await prisma.exercise.findMany({
    // The shared half only
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
      // A failed refresh keeps serving the stale cache
      log.warn('Exercise catalogue refresh failed; serving stale', error)
      if (cache) return cache.rows
      throw error
    })
    .finally(() => { inFlight = null })

  return inFlight
}

/** Drop the cache (called when a custom exercise is created). */
export const invalidateCatalogue = (): void => {
  cache = null
}

/** Cache state, for tests and debugging. */
export const catalogueCacheState = (): { warm: boolean; ageMs: number | null; rows: number } => ({
  warm: cache !== null,
  ageMs: cache ? Date.now() - cache.loadedAt : null,
  rows: cache?.rows.length ?? 0,
})

/** The athlete's own exercises; never cached. */
export const customExercisesFor = (userId: string): Promise<CatalogueExercise[]> =>
  prisma.exercise.findMany({
    where: { createdByUserId: userId },
    select: CATALOGUE_SELECT,
    orderBy: { name: 'asc' },
  })

/**
 * Sort like Postgres does: `ignorePunctuation` matches its collation, so the
 * in-memory order equals `ORDER BY name ASC`.
 */
export const byCatalogueName = (
  a: { name: string },
  b: { name: string }
): number => a.name.localeCompare(b.name, 'en', { ignorePunctuation: true })

/** Filters the cached rows by category, modality and search, in memory. */
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

    // Case-insensitive contains, as Postgres `mode: 'insensitive'`
    if (search && !exercise.name.toLowerCase().includes(search)) return false

    return true
  })
}

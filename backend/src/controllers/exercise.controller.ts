import { Response } from 'express';
import { prisma } from '../server';
import { buildEffectiveFatigueMap } from '../services/fatigue.service';
import { rankByConstraints, getTrainingConstraints } from '../services/training-constraints.service';
import {
  CustomExerciseError, createCustomExercise, prepareCustomExercise,
} from '../services/custom-exercise.service';
import {
  byCatalogueName, customExercisesFor, filterCatalogue, invalidateCatalogue,
  sharedCatalogue,
} from '../services/exercise-catalogue.service';
import { AuthRequest } from '../server';
import { log } from '../lib/logger';

// Get all exercises
// GET /api/exercises?category=Legs&modality=Strength&search=squat
// filtering by category, modality, and search term
export const getExercises = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { category, modality, search } = req.query

    // Five independent reads, issued together rather than one after another.
    // Measured against the real database, the sequential version cost ~1.5 s
    // more per request at a ~515 ms round trip — see TODO item 18.
    //
    // In practice only four of these reach Postgres: the shared catalogue is
    // served from memory (see exercise-catalogue.service), which is where most
    // of this endpoint's time used to go.
    const [shared, custom, fatigueCurrent, constraints, favorites] = await Promise.all([
      sharedCatalogue(),
      customExercisesFor(req.userId!),
      prisma.muscleFatigueCurrent.findMany({ where: { userId: req.userId! } }),
      // Equipment the athlete has, and anything they are training around. Both
      // are no-ops until the optional onboarding stage has been answered.
      getTrainingConstraints(req.userId!),
      // Joined into the same batch rather than issued after it: this endpoint
      // is already the one the picker hits on every open, and on the remote
      // database a fifth sequential round trip costs more than the query does.
      //
      // Guarded rather than asserted, unlike its neighbours — this router is
      // `optionalAuth`, and `where: { userId: undefined }` is not "no rows",
      // it is EVERY row, which would star the whole catalogue for a signed-out
      // caller.
      req.userId
        ? prisma.favoriteExercise.findMany({
            where: { userId: req.userId },
            select: { exerciseId: true },
          })
        : Promise.resolve([]),
    ])

    const favoriteIds = new Set(favorites.map(f => f.exerciseId))

    // Filtering moved out of SQL and into memory. Over ~172 rows it is
    // microseconds, and it is what lets one cached read serve every
    // combination of category / modality / search the picker can produce — as
    // a WHERE clause, each combination was its own uncacheable query.
    const exercises = filterCatalogue([...shared, ...custom], {
      category: category ? String(category) : undefined,
      modality: modality ? String(modality) : undefined,
      search: search ? String(search) : undefined,
    }).sort(byCatalogueName)

    // Fatigue for this user, to flag exercises that load something already spent.
    const fatigueMap = buildEffectiveFatigueMap(fatigueCurrent)

    const { ranked, hiddenCount, missingEquipmentCount } =
      rankByConstraints(exercises, constraints)

    // Add fatigue warning to each exercise
    const exercisesWithFatigue = ranked.map(exercise => {
      const maxFatigue = Math.max(
        0,
        ...exercise.muscleLinks.map(
          ml => fatigueMap.get(ml.muscleId) ?? 0
        )
      )

      return {
        id: exercise.id,
        name: exercise.name,
        description: exercise.description,
        modality: exercise.modality.name,
        referenceSpeedKmh: exercise.referenceSpeedKmh,
        // What the run screen is allowed to offer. 'gps' gets a map and a
        // follow; 'machine' a dial and a pace but no route; 'reps' a counter
        // and no pace at all, because none exists at any effort.
        cardioTracking: exercise.cardioTracking,
        referenceCadenceRpm: exercise.referenceCadenceRpm,
        repUnit: exercise.repUnit,
        muscles: exercise.muscleLinks.map(ml => ({
          id: ml.muscleId,
          name: ml.muscle.name,
          impactFactor: ml.impactFactor
        })),
        categories: exercise.categoryLinks.map(cl => cl.category.name),
        equipment: exercise.equipmentLinks.map(el => el.equipment.name),
        isCustom: exercise.createdByUserId !== null,
        fatigueWarning: maxFatigue >= 70, //  show red warning
        maxMuscleFatigue: Math.round(maxFatigue),
        // Loads a muscle the athlete flagged as "work around it". Shown, but
        // the client marks it.
        injuryCaution: exercise.caution,
        // Needs kit they did not tick. Still listed — sorted to the bottom —
        // so the catalogue never looks like it is missing exercises.
        needsMissingEquipment: exercise.needsMissingEquipment,
        // Sent on every row so the list can offer a Favourites filter without
        // a second request. Deliberately does NOT affect `rankByConstraints`:
        // a star says "I like this movement", not "I can do it today", and
        // letting it reorder the list would bury the equipment and injury
        // signals that exist to keep someone from getting hurt.
        isFavorite: favoriteIds.has(exercise.id),
      }
    })

    // Surfaced so the client can explain itself: hiddenByInjury is the only
    // thing actually removed, and unavailable counts what got demoted.
    res.json({
      success: true,
      data: exercisesWithFatigue,
      meta: {
        hiddenByInjury: hiddenCount,
        needsMissingEquipment: missingEquipmentCount
      }
    })

  } catch (error) {
    log.error('getExercises failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }

};

//   Get single exercise
// GET /api/exercises/:id
// Full detail 
export const getExerciseById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    // Scoped the same way the list is. `findUnique` on the id alone handed any
    // caller another athlete's custom exercise — including its name and
    // description, which people write in their own words — to anyone who
    // guessed a uuid. Harmless while nobody could create one; not harmless now
    // that they can.
    const exercise = await prisma.exercise.findFirst({
      where: {
        id,
        OR: [{ createdByUserId: null }, { createdByUserId: req.userId! }],
      },
      include: {
        modality: true,
        muscleLinks: {
          include: { muscle: true }
        },
        categoryLinks: {
          include: { category: true }
        },
        equipmentLinks: {
          include: { equipment: true }
        },
        media: true
      }
    })

    if (!exercise) {
      res.status(404).json({ success: false, error: 'Exercise not found' })
      return
    }

    // Three independent per-user reads, issued together. They were sequential,
    // which on the remote database is ~3 round trips stacked behind the lookup
    // above for no reason — none of them depends on the others.
    const [personalBest, timesLogged, favorite] = await Promise.all([
      // Get personal best for this exercise for this user
      prisma.workoutSet.findFirst({
        where: {
          setType: 'STRENGTH',
          workoutExercise: {
            exerciseId: id,
            session: { userId: req.userId! }
          }
        },
        include: { strength: true },
        orderBy: { strength: { weight: 'desc' } }
      }),

      // Count how many times user has logged this exercise
      prisma.workoutExercise.count({
        where: {
          exerciseId: id,
          session: { userId: req.userId! }
        }
      }),

      // Guarded, not asserted — see getExercises. On this route an unguarded
      // `userId: undefined` would find the first star by anyone and light the
      // icon for a signed-out reader.
      req.userId
        ? prisma.favoriteExercise.findUnique({
            where: { userId_exerciseId: { userId: req.userId, exerciseId: id } },
            select: { exerciseId: true },
          })
        : Promise.resolve(null),
    ])

    res.json({
      success: true,
      data: {
        id: exercise.id,
        name: exercise.name,
        description: exercise.description,
        modality: exercise.modality.name,
        referenceSpeedKmh: exercise.referenceSpeedKmh,
        cardioTracking: exercise.cardioTracking,
        referenceCadenceRpm: exercise.referenceCadenceRpm,
        repUnit: exercise.repUnit,
        muscles: exercise.muscleLinks.map(ml => ({
          name: ml.muscle.name,
          impactFactor: ml.impactFactor,
          // Primary = high impact, Secondary = medium, Stabiliser = low
          role: ml.impactFactor >= 0.8 ? 'Primary' :
                ml.impactFactor >= 0.5 ? 'Secondary' : 'Stabiliser'
        })),
        categories: exercise.categoryLinks.map(cl => cl.category.name),
        equipment: exercise.equipmentLinks.map(el => el.equipment.name),
        media: exercise.media,
        personalBest: personalBest?.strength
          ? {
              weight: personalBest.strength.weight,
              reps: personalBest.strength.reps
            }
          : null,
        timesLogged,
        isFavorite: favorite !== null,
      }
    })

  } catch (error) {
    log.error('getExerciseById failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//   Create a custom exercise
// POST /api/exercises
//
// `Exercise.createdByUserId` existed, the list endpoint filtered on it, and
// `getExercises` returned an `isCustom` flag — with no route that could ever
// set it. This is the missing half.
//
// The athlete supplies what they can actually know about their own movement:
// what it is called, which modality it belongs to, which muscles it works and
// how hard, what kit it needs. Everything the fatigue model consumes is derived
// from that in custom-exercise.service.ts and never typed directly.
export const createExercise = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name, modalityId, modality, description, muscles, categoryIds, equipmentIds,
      cardioTracking,
    } = req.body as Record<string, unknown>

    const prepared = await prepareCustomExercise(req.userId!, {
      name,
      // The form posts ids; the service resolves an id or a name either way.
      modality: modalityId ?? modality,
      description,
      muscles: Array.isArray(muscles)
        ? muscles.map((m: any) => ({ muscle: m?.muscleId ?? m?.muscle, role: m?.role }))
        : muscles,
      categories: categoryIds,
      equipment: equipmentIds,
      cardioTracking,
    })

    const created = await createCustomExercise(req.userId!, prepared)

    // The new row is not in the cached half — custom exercises are read per
    // request — but the merged list's ordering and counts are, so drop it.
    invalidateCatalogue()

    res.status(201).json({ success: true, data: created })

  } catch (error) {
    if (error instanceof CustomExerciseError) {
      // A clash or a full shelf is the athlete's own state, not a fault — 409
      // so the client can say which, rather than showing a generic failure.
      res.status(error.code === 'invalid' ? 400 : 409)
        .json({ success: false, error: error.message })
      return
    }
    log.error('createExercise failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//   Get all categories
// GET /api/exercises/categories
// Returns categories with the current fatigue state for the user
export const getCategories = async (req: AuthRequest, res: Response) => {
  try {
    const categories = await prisma.exerciseCategory.findMany({
      include: {
        exerciseLinks: {
          include: {
            exercise: {
              include: {
                muscleLinks: {
                  include: { muscle: true }
                }
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    })

    // Get current fatigue for this user
    const fatigueCurrent = await prisma.muscleFatigueCurrent.findMany({
      where: { userId: req.userId! }
    })

    // Build a map of muscleId -> fatigueLevel for fast lookup
    const fatigueMap = buildEffectiveFatigueMap(fatigueCurrent)

    // For each category calculate its overall fatigue
    // based on the muscles of exercises in that category
    const categoriesWithFatigue = categories.map(category => {
      const muscleIds = new Set<string>()

      category.exerciseLinks.forEach(link => {
        link.exercise.muscleLinks.forEach(ml => {
          muscleIds.add(ml.muscleId)
        })
      })

      const fatigueLevels = Array.from(muscleIds).map(
        id => fatigueMap.get(id) ?? 0
      )

      const avgFatigue = fatigueLevels.length > 0
        ? fatigueLevels.reduce((a, b) => a + b, 0) / fatigueLevels.length
        : 0

      // Convert number to label for the UI
      const fatigueStatus =
        avgFatigue >= 70 ? 'high' :
        avgFatigue >= 35 ? 'moderate' :
        'recovered'

      return {
        id: category.id,
        name: category.name,
        exerciseCount: category.exerciseLinks.length,
        fatigueLevel: Math.round(avgFatigue),
        fatigueStatus // 'high' | 'moderate' | 'recovered'
      }
    })

    res.json({ success: true, data: categoriesWithFatigue })

  } catch (error) {
    log.error('getCategories failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//    Get modalities 
// GET /api/exercises/modalities
export const getModalities = async (_req: AuthRequest, res: Response) => {
  try {
    void _req;
    const modalities = await prisma.modality.findMany({
      orderBy: { name: 'asc' }
    })
    res.json({ success: true, data: modalities })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//   Star an exercise
// POST /api/exercises/:id/favorite
//
// Idempotent: starring something already starred is a success, not a 409. The
// star is a toggle in the UI and toggles get double-tapped, so the endpoint
// that backs one has to be safe to call twice — `upsert` against the composite
// primary key makes the second call a no-op instead of a unique violation the
// client would have to interpret.
export const addFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    // Scoped exactly like getExerciseById. Without this, a starred uuid is an
    // existence oracle for other athletes' custom exercises — and worse, the
    // foreign key would happily accept the row, so their movement would then
    // appear by name in this user's favourites list.
    const exercise = await prisma.exercise.findFirst({
      where: {
        id,
        OR: [{ createdByUserId: null }, { createdByUserId: req.userId! }],
      },
      select: { id: true },
    })

    if (!exercise) {
      res.status(404).json({ success: false, error: 'Exercise not found' })
      return
    }

    await prisma.favoriteExercise.upsert({
      where: { userId_exerciseId: { userId: req.userId!, exerciseId: id } },
      update: {},
      create: { userId: req.userId!, exerciseId: id },
    })

    res.status(201).json({ success: true, data: { exerciseId: id, isFavorite: true } })

  } catch (error) {
    log.error('addFavorite failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//   Unstar an exercise
// DELETE /api/exercises/:id/favorite
//
// Also idempotent, and for a sharper reason than the POST: unstarring twice is
// what happens every time a tap is retried on a bad connection. `deleteMany`
// rather than `delete` because `delete` throws P2025 when the row is already
// gone — which is the exact state the caller was asking for.
export const removeFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    // No ownership lookup here, unlike the POST. The delete is already scoped
    // to this user's own rows, so the worst a bad id can do is delete nothing,
    // and a 404 would leak the same existence signal the POST is careful about.
    await prisma.favoriteExercise.deleteMany({
      where: { userId: req.userId!, exerciseId: id },
    })

    res.json({ success: true, data: { exerciseId: id, isFavorite: false } })

  } catch (error) {
    log.error('removeFavorite failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

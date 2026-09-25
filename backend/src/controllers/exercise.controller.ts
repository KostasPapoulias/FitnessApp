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

// GET /api/exercises?category=Legs&modality=Strength&search=squat
// The catalogue plus the user's custom exercises, filtered, ranked by
// equipment/injury constraints and annotated with fatigue and favourites.
export const getExercises = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { category, modality, search } = req.query

    // Independent reads, batched; the shared catalogue comes from memory
    const [shared, custom, fatigueCurrent, constraints, favorites] = await Promise.all([
      sharedCatalogue(),
      customExercisesFor(req.userId!),
      prisma.muscleFatigueCurrent.findMany({ where: { userId: req.userId! } }),
      // Equipment and injury constraints (no-ops until answered)
      getTrainingConstraints(req.userId!),
      // Guarded: under optionalAuth, `userId: undefined` would match every row
      req.userId
        ? prisma.favoriteExercise.findMany({
            where: { userId: req.userId },
            select: { exerciseId: true },
          })
        : Promise.resolve([]),
    ])

    const favoriteIds = new Set(favorites.map(f => f.exerciseId))

    // Filtered in memory over the cached catalogue
    const exercises = filterCatalogue([...shared, ...custom], {
      category: category ? String(category) : undefined,
      modality: modality ? String(modality) : undefined,
      search: search ? String(search) : undefined,
    }).sort(byCatalogueName)

    // Effective fatigue per muscle, to flag exercises hitting a spent muscle
    const fatigueMap = buildEffectiveFatigueMap(fatigueCurrent)

    const { ranked, hiddenCount, missingEquipmentCount } =
      rankByConstraints(exercises, constraints)

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
        // What the cardio screen offers: 'gps' map, 'machine' dial, 'reps' counter
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
        // Null where the media library has no artwork; the client shows an icon
        thumbnailUrl: exercise.media?.[0]?.thumbnailUrl ?? null,
        isCustom: exercise.createdByUserId !== null,
        fatigueWarning: maxFatigue >= 70,
        maxMuscleFatigue: Math.round(maxFatigue),
        // Works a muscle marked 'caution'
        injuryCaution: exercise.caution,
        // Needs equipment the athlete lacks; listed, sorted last
        needsMissingEquipment: exercise.needsMissingEquipment,
        // Does not affect ranking — a favourite is a preference, not availability
        isFavorite: favoriteIds.has(exercise.id),
      }
    })

    // Tells the client what was hidden (injury) and demoted (equipment)
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

// GET /api/exercises/:id — full detail, scoped to shared or the caller's own exercises
export const getExerciseById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    // Custom exercises are visible only to their owner
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

    // Independent per-user reads, batched
    const [personalBest, timesLogged, favorite] = await Promise.all([
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

      prisma.workoutExercise.count({
        where: {
          exerciseId: id,
          session: { userId: req.userId! }
        }
      }),

      // Guarded — see getExercises
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
          // Primary ≥ 0.8 impact, Secondary ≥ 0.5, otherwise Stabiliser
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

// POST /api/exercises — create a custom exercise. The athlete describes the
// movement; its calibration is derived in custom-exercise.service.
export const createExercise = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name, modalityId, modality, description, muscles, categoryIds, equipmentIds,
      cardioTracking,
    } = req.body as Record<string, unknown>

    const prepared = await prepareCustomExercise(req.userId!, {
      name,
      // Accepts a modality id or name
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

    // The merged list's order and counts changed
    invalidateCatalogue()

    res.status(201).json({ success: true, data: created })

  } catch (error) {
    if (error instanceof CustomExerciseError) {
      // Invalid input 400; duplicate or limit 409
      res.status(error.code === 'invalid' ? 400 : 409)
        .json({ success: false, error: error.message })
      return
    }
    log.error('createExercise failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/exercises/categories — categories with the user's average fatigue across their muscles
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

    const fatigueCurrent = await prisma.muscleFatigueCurrent.findMany({
      where: { userId: req.userId! }
    })

    // muscleId → effective fatigue level
    const fatigueMap = buildEffectiveFatigueMap(fatigueCurrent)

    // Average fatigue across every muscle the category's exercises work
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

      const fatigueStatus =
        avgFatigue >= 70 ? 'high' :
        avgFatigue >= 35 ? 'moderate' :
        'recovered'

      return {
        id: category.id,
        name: category.name,
        exerciseCount: category.exerciseLinks.length,
        fatigueLevel: Math.round(avgFatigue),
        fatigueStatus
      }
    })

    res.json({ success: true, data: categoriesWithFatigue })

  } catch (error) {
    log.error('getCategories failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

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

// POST /api/exercises/:id/favorite — idempotent (upsert on the composite key)
export const addFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    // Scoped like getExerciseById, so other users' custom exercises cannot be starred
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

// DELETE /api/exercises/:id/favorite — idempotent; deleteMany does not throw when absent
export const removeFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    // Scoped to the user's own rows, so no ownership lookup is needed
    await prisma.favoriteExercise.deleteMany({
      where: { userId: req.userId!, exerciseId: id },
    })

    res.json({ success: true, data: { exerciseId: id, isFavorite: false } })

  } catch (error) {
    log.error('removeFavorite failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

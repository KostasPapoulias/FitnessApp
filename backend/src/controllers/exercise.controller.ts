import { Response } from 'express';
import { prisma } from '../server';
import { buildEffectiveFatigueMap } from '../services/fatigue.service';
import { rankByConstraints, getTrainingConstraints } from '../services/training-constraints.service';
import {
  CustomExerciseError, createCustomExercise, prepareCustomExercise,
} from '../services/custom-exercise.service';
import { AuthRequest } from '../server';
import { log } from '../lib/logger';

// Get all exercises
// GET /api/exercises?category=Legs&modality=Strength&search=squat
// filtering by category, modality, and search term
export const getExercises = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {category, modality, search } = req.query

    const exercises = await prisma.exercise.findMany({
      where: {
        //filter by caetegory
        ...(category && {
          categoryLinks: {
            some: {
              category: {name: String(category)}
            }
          }
        }),
        //filter by modality
        ...(modality && {
          modality: {name: String(modality) }
        }),
        //filter by search 
        ...(search && {
          name: {contains: String(search), mode: 'insensitive'}
        }),
        OR: [
          {createdByUserId: null },
          {createdByUserId: req.userId}
        ]
      },
      include: {
        modality: true,
        muscleLinks: {
          include: {muscle: true}
        },
        categoryLinks: {
          include: {category: true}
        },
        equipmentLinks: {
          include: {equipment: true}
        }
      },
      orderBy: {name: 'asc'}
    });

  // Get fatigue for the user to flag high-fatigue exercises
    const fatigueCurrent = await prisma.muscleFatigueCurrent.findMany({
      where: { userId: req.userId! }
    })
    const fatigueMap = buildEffectiveFatigueMap(fatigueCurrent)

    // Equipment the athlete has, and anything they are training around. Both
    // are no-ops until the optional onboarding stage has been answered.
    const constraints = await getTrainingConstraints(req.userId!)
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
        needsMissingEquipment: exercise.needsMissingEquipment
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

    // Get personal best for this exercise for this user
    const personalBest = await prisma.workoutSet.findFirst({
      where: {
        setType: 'STRENGTH',
        workoutExercise: {
          exerciseId: id,
          session: { userId: req.userId! }
        }
      },
      include: { strength: true },
      orderBy: { strength: { weight: 'desc' } }
    })

    // Count how many times user has logged this exercise
    const timesLogged = await prisma.workoutExercise.count({
      where: {
        exerciseId: id,
        session: { userId: req.userId! }
      }
    })

    res.json({
      success: true,
      data: {
        id: exercise.id,
        name: exercise.name,
        description: exercise.description,
        modality: exercise.modality.name,
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
        timesLogged
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
    const { name, modalityId, modality, description, muscles, categoryIds, equipmentIds } =
      req.body as Record<string, unknown>

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
    })

    const created = await createCustomExercise(req.userId!, prepared)
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

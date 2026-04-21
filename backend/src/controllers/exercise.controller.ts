import { Response } from 'express';
import { prisma } from '../server';
import { AuthRequest } from '../server';

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
    const fatigueMap = new Map(
      fatigueCurrent.map(f => [f.muscleId, f.fatigueLevel])
    )

    // Add fatigue warning to each exercise
    const exercisesWithFatigue = exercises.map(exercise => {
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
        maxMuscleFatigue: Math.round(maxFatigue)
      }
    })

    res.json({ success: true, data: exercisesWithFatigue })

  } catch (error) {
    console.error('getExercises error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }

};

//   Get single exercise
// GET /api/exercises/:id
// Full detail 
export const getExerciseById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    const exercise = await prisma.exercise.findUnique({
      where: { id },
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
    console.error('getExerciseById error:', error)
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
    const fatigueMap = new Map(
      fatigueCurrent.map(f => [f.muscleId, f.fatigueLevel])
    )

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
    console.error('getCategories error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//    Get modalities 
// GET /api/exercises/modalities
export const getModalities = async (_req: AuthRequest, res: Response) => {
  try {
    const modalities = await prisma.modality.findMany({
      orderBy: { name: 'asc' }
    })
    res.json({ success: true, data: modalities })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

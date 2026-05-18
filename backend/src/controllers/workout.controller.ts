import { Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'

//   START SESSION 
// POST /api/workout/sessions
// Called when user taps "Start Workout"
// Creates an empty session and returns the ID
export const startSession = async (req: AuthRequest, res: Response) => {
  try {
    const { notes, weatherCondition } = req.body

    const session = await prisma.workoutSession.create({
      data: {
        userId: req.userId!,
        notes,
        weatherCondition,
        dateTime: new Date()
      }
    })

    res.status(201).json({ success: true, data: session })

  } catch (error) {
    console.error('startSession error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//    ADD EXERCISE TO SESSION 
// POST /api/workout/sessions/:id/exercises
// Called when user confirms exercise selection
export const addExercise = async (req: AuthRequest, res: Response) => {
  try {
    const { id: sessionId } = req.params
    const { exerciseId, orderIndex, notes } = req.body

    // Verify session belongs to this user
    const session = await prisma.workoutSession.findFirst({
      where: { id: sessionId, userId: req.userId! }
    })
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' })
      return
    }

    const workoutExercise = await prisma.workoutExercise.create({
      data: { sessionId, exerciseId, orderIndex, notes },
      include: { exercise: { include: { muscleLinks: true } } }
    })

    res.status(201).json({ success: true, data: workoutExercise })

  } catch (error) {
    console.error('addExercise error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//    LOG A SET 
// POST /api/workout/sessions/:id/sets
// Called when user taps "Set Done" during active workout
export const logSet = async (req: AuthRequest, res: Response) => {
  try {
    const { id: sessionId } = req.params
    const {
      workoutExerciseId,
      setNumber,
      setType,
      rpe,
      restSeconds,
      // Modality-specific data
      reps, weight,          // STRENGTH
      addedWeight,           // CALISTHENICS
      distance, time,        // CARDIO / WOD
      duration               // MOBILITY
    } = req.body

    // Verify session belongs to this user
    const session = await prisma.workoutSession.findFirst({
      where: { id: sessionId, userId: req.userId! }
    })
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' })
      return
    }

    // Create the base set + the modality-specific child in one transaction
    const workoutSet = await prisma.$transaction(async (tx) => {
      const set = await tx.workoutSet.create({
        data: {
          workoutExerciseId,
          setNumber,
          setType,
          rpe,
          restSeconds
        }
      })

      // Create the child record based on modality
      switch (setType) {
        case 'STRENGTH':
          await tx.setStrength.create({
            data: { setId: set.id, reps, weight }
          })
          break
        case 'CALISTHENICS':
          await tx.setCalisthenics.create({
            data: { setId: set.id, reps, addedWeight: addedWeight ?? 0 }
          })
          break
        case 'CARDIO':
          await tx.setCardio.create({
            data: { setId: set.id, distance, time }
          })
          break
        case 'WOD':
          await tx.setWOD.create({
            data: { setId: set.id, distance, time }
          })
          break
        case 'MOBILITY':
          await tx.setMobility.create({
            data: { setId: set.id, time: duration }
          })
          break
      }

      return set
    })

    res.status(201).json({ success: true, data: workoutSet })

  } catch (error) {
    console.error('logSet error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//   FINISH SESSION 
// POST /api/workout/sessions/:id/finish
//  Calculates total volume + avg RPE
//  Runs the fatigue algorithm for every muscle involved
//  Updates MuscleFatigueCurrent + writes MuscleFatigueLog
export const finishSession = async (req: AuthRequest, res: Response) => {
  try {
    const { id: sessionId } = req.params
    const { duration } = req.body

    // Load the full session with all exercises, sets, and muscle links
    const session = await prisma.workoutSession.findFirst({
      where: { id: sessionId, userId: req.userId! },
      include: {
        workoutExercises: {
          include: {
            exercise: {
              include: {
                muscleLinks: {
                  include: { muscle: true }
                }
              }
            },
            sets: {
              include: {
                strength: true,
                calisthenics: true,
                cardio: true,
                wod: true,
                mobility: true
              }
            }
          }
        }
      }
    })

    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' })
      return
    }

    // Calculate session totals 
    let totalVolume = 0
    let totalRpe = 0
    let rpeCount = 0

    // muscleDeltas accumulates fatigue per muscle across ALL exercises
    // Map: muscleId -> { delta, muscle }
    const muscleDeltas = new Map<string, {
      delta: number
      muscleName: string
    }>()

    for (const workoutExercise of session.workoutExercises) {
      const exercise = workoutExercise.exercise
      const muscleLinks = exercise.muscleLinks

      for (const set of workoutExercise.sets) {
        const rpe = set.rpe ?? 7 // default RPE if not set
        const rpeMultiplier = rpe / 10 // RPE 10 = 1.0, RPE 5 = 0.5

        // Calculate volume based on set type
        let setVolume = 0
        let setIntensity = 0

        if (set.strength) {
          setVolume = set.strength.reps * set.strength.weight
          // Intensity for fatigue = reps × weight × rpe multiplier
          setIntensity = set.strength.reps * set.strength.weight * rpeMultiplier
        } else if (set.calisthenics) {
          setVolume = set.calisthenics.reps * (70 + set.calisthenics.addedWeight)
          setIntensity = set.calisthenics.reps * rpeMultiplier * 10
        } else if (set.cardio) {
          setVolume = (set.cardio.distance ?? 0) * 1000
          setIntensity = (set.cardio.time ?? 0) * rpeMultiplier
        } else if (set.mobility) {
          setVolume = set.mobility.time ?? 0
          setIntensity = (set.mobility.time ?? 0) * rpeMultiplier * 0.1
        }

        totalVolume += setVolume

        if (set.rpe) {
          totalRpe += set.rpe
          rpeCount++
        }

        //  Calculate fatigue delta per muscle 
        // Formula: intensity × impact_factor × normalisation_constant
        for (const muscleLink of muscleLinks) {
          const fatigueDelta = setIntensity * muscleLink.impactFactor * 0.1

          const existing = muscleDeltas.get(muscleLink.muscleId)
          if (existing) {
            existing.delta += fatigueDelta
          } else {
            muscleDeltas.set(muscleLink.muscleId, {
              delta: fatigueDelta,
              muscleName: muscleLink.muscle.name
            })
          }
        }
      }
    }

    const avgRpe = rpeCount > 0 ? totalRpe / rpeCount : 0

    //  Update database in one transaction 
    await prisma.$transaction(async (tx) => {

      //  Update the session with final stats
      await tx.workoutSession.update({
        where: { id: sessionId },
        data: {
          duration,
          totalVolume,
          avgRpe,
          dateTime: new Date()
        }
      })

      //  Update fatigue for each muscle involved
      for (const [muscleId, { delta }] of muscleDeltas) {

        // Get current fatigue level
        const current = await tx.muscleFatigueCurrent.findUnique({
          where: { userId_muscleId: { userId: req.userId!, muscleId } }
        })

        const currentLevel = current?.fatigueLevel ?? 0
        // Fatigue level is capped at 100
        const newLevel = Math.min(100, currentLevel + delta)

        // Recovery time = default 48 hours at 100% fatigue
        const recoveryHours = newLevel * 0.48
        const recoveryTargetAt = new Date(
          Date.now() + recoveryHours * 60 * 60 * 1000
        )

        //  Upsert MuscleFatigueCurrent
        await tx.muscleFatigueCurrent.upsert({
          where: {
            userId_muscleId: { userId: req.userId!, muscleId }
          },
          update: { fatigueLevel: newLevel, recoveryTargetAt },
          create: {
            userId: req.userId!,
            muscleId,
            fatigueLevel: newLevel,
            recoveryTargetAt
          }
        })

        //  Write to MuscleFatigueLog , activity history
        await tx.muscleFatigueLog.create({
          data: {
            userId: req.userId!,
            muscleId,
            workoutSessionId: sessionId,
            source: 'workout',
            delta,
            fatigueLevelAfter: newLevel
          }
        })
      }
    })

    //   STEP 4: Return summary 
    // Reload updated fatigue to send back to frontend
    const updatedFatigue = await prisma.muscleFatigueCurrent.findMany({
      where: { userId: req.userId! },
      include: { muscle: true }
    })

    res.json({
      success: true,
      data: {
        sessionId,
        totalVolume: Math.round(totalVolume),
        avgRpe: Math.round(avgRpe * 10) / 10,
        duration,
        musclesAffected: Array.from(muscleDeltas.entries()).map(
          ([muscleId, { delta, muscleName }]) => ({
            muscleId,
            muscleName,
            delta: Math.round(delta),
            newLevel: Math.round(
              updatedFatigue.find(f => f.muscleId === muscleId)?.fatigueLevel ?? 0
            )
          })
        )
      }
    })

  } catch (error) {
    console.error('finishSession error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//   GET SESSION HISTORY 
// GET /api/workout/sessions
// Used by Calendar screen
export const getSessions = async (req: AuthRequest, res: Response) => {
  try {
    const { month, year, limit } = req.query

    const where: any = { userId: req.userId! }

    // Filter by month/year for calendar view
    if (month && year) {
      const start = new Date(Number(year), Number(month) - 1, 1)
      const end = new Date(Number(year), Number(month), 1)
      where.dateTime = { gte: start, lt: end }
    }

    const sessions = await prisma.workoutSession.findMany({
      where,
      include: {
        workoutExercises: {
          include: {
            exercise: {
              include: {
                categoryLinks: { include: { category: true } },
                muscleLinks: { include: { muscle: true } }
              }
            },
            sets: {
              include: { strength: true, cardio: true, calisthenics: true }
            }
          },
          orderBy: { orderIndex: 'asc' }
        }
      },
      orderBy: { dateTime: 'desc' },
      take: limit ? Number(limit) : 50
    })

    res.json({ success: true, data: sessions })

  } catch (error) {
    console.error('getSessions error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//   GET SINGLE SESSION 
// GET /api/workout/sessions/:id
export const getSessionById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    const session = await prisma.workoutSession.findFirst({
      where: { id, userId: req.userId! },
      include: {
        workoutExercises: {
          include: {
            exercise: {
              include: {
                muscleLinks: { include: { muscle: true } },
                categoryLinks: { include: { category: true } }
              }
            },
            sets: {
              include: {
                strength: true,
                calisthenics: true,
                cardio: true,
                wod: true,
                mobility: true
              },
              orderBy: { setNumber: 'asc' }
            }
          },
          orderBy: { orderIndex: 'asc' }
        }
      }
    })

    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' })
      return
    }

    res.json({ success: true, data: session })

  } catch (error) {
    console.error('getSessionById error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}
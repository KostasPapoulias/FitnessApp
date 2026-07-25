import { Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { getEffectiveFatigueLevel } from '../services/fatigue.service'

const SET_TYPES = ['STRENGTH', 'CALISTHENICS', 'CARDIO', 'WOD', 'MOBILITY'] as const

// Fallback bodyweight (kg) when the user has no profile weight recorded
const DEFAULT_BODY_WEIGHT = 70
// Seconds of isometric hold treated as equivalent to one rep
const HOLD_SECONDS_PER_REP = 3

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

    if (!SET_TYPES.includes(setType)) {
      res.status(400).json({ success: false, error: `Invalid setType: ${setType}` })
      return
    }
    if (!workoutExerciseId || !Number.isInteger(setNumber) || setNumber < 1) {
      res.status(400).json({ success: false, error: 'workoutExerciseId and a positive setNumber are required' })
      return
    }

    // The exercise must belong to THIS session, and the session to this user.
    // Checking only the session would let a caller write sets into someone
    // else's workout by passing a foreign workoutExerciseId.
    const workoutExercise = await prisma.workoutExercise.findFirst({
      where: {
        id: workoutExerciseId,
        sessionId,
        session: { userId: req.userId! }
      }
    })
    if (!workoutExercise) {
      res.status(404).json({ success: false, error: 'Exercise not found in this session' })
      return
    }

    // Upsert by (workoutExerciseId, setNumber): re-logging a set corrects it in
    // place instead of appending a duplicate that double-counts volume/fatigue.
    const { set: workoutSet, replaced } = await prisma.$transaction(async (tx) => {
      const existing = await tx.workoutSet.findFirst({
        where: { workoutExerciseId, setNumber }
      })

      const set = existing
        ? await tx.workoutSet.update({
            where: { id: existing.id },
            data: { setType, rpe, restSeconds }
          })
        : await tx.workoutSet.create({
            data: { workoutExerciseId, setNumber, setType, rpe, restSeconds }
          })

      // Clear any previous child row — the modality may have changed on re-log
      if (existing) {
        await Promise.all([
          tx.setStrength.deleteMany({ where: { setId: set.id } }),
          tx.setCalisthenics.deleteMany({ where: { setId: set.id } }),
          tx.setCardio.deleteMany({ where: { setId: set.id } }),
          tx.setWOD.deleteMany({ where: { setId: set.id } }),
          tx.setMobility.deleteMany({ where: { setId: set.id } })
        ])
      }

      // Create the child record based on modality
      switch (setType) {
        case 'STRENGTH':
          await tx.setStrength.create({
            data: { setId: set.id, reps: reps ?? 0, weight: weight ?? 0 }
          })
          break
        case 'CALISTHENICS':
          await tx.setCalisthenics.create({
            data: {
              setId: set.id,
              reps: reps ?? 0,
              addedWeight: addedWeight ?? 0,
              // isometric holds record seconds under tension, not reps
              time: duration ?? null
            }
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

      return { set, replaced: existing != null }
    })

    // 200 when an existing set was corrected, 201 when a new one was recorded
    res.status(replaced ? 200 : 201).json({ success: true, data: workoutSet, replaced })

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

    // Claim the session atomically. `duration: null` in the WHERE makes this a
    // single conditional UPDATE, so of two concurrent finishes exactly one gets
    // count === 1; the loser returns the stored summary instead of applying a
    // second round of fatigue. A plain `if (session.duration != null)` check
    // would not survive the race — both requests could read null and proceed.
    const claim = await prisma.workoutSession.updateMany({
      where: { id: sessionId, userId: req.userId!, duration: null },
      data: { duration }
    })

    if (claim.count === 0) {
      // Someone else finished it first (double-tap, retry, or a stale client)
      const [finished, priorLogs] = await Promise.all([
        prisma.workoutSession.findUnique({ where: { id: sessionId } }),
        prisma.muscleFatigueLog.findMany({
          where: { workoutSessionId: sessionId },
          include: { muscle: true }
        })
      ])
      res.json({
        success: true,
        data: {
          sessionId,
          totalVolume: Math.round(finished?.totalVolume ?? 0),
          avgRpe: Math.round((finished?.avgRpe ?? 0) * 10) / 10,
          duration: finished?.duration ?? session.duration,
          musclesAffected: priorLogs.map(l => ({
            muscleId: l.muscleId,
            muscleName: l.muscle.name,
            delta: Math.round(l.delta),
            newLevel: Math.round(l.fatigueLevelAfter)
          })),
          alreadyFinished: true
        }
      })
      return
    }

    // Bodyweight drives calisthenics load — fall back only if unrecorded
    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.userId! }
    })
    const bodyWeight = profile?.weight ?? DEFAULT_BODY_WEIGHT

    // Calculate session totals
    // totalVolume is mechanical load in KG (strength + calisthenics only).
    // Cardio distance and mobility seconds are different units and are
    // deliberately excluded — they still drive fatigue via setIntensity.
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
          // Load is the user's own bodyweight plus any added/assisted weight
          const load = bodyWeight + set.calisthenics.addedWeight
          // Isometric holds carry no reps — convert seconds under tension to a
          // rep equivalent so a 45s plank isn't scored as 45 reps.
          const repEquivalent = set.calisthenics.reps > 0
            ? set.calisthenics.reps
            : (set.calisthenics.time ?? 0) / HOLD_SECONDS_PER_REP
          setVolume = repEquivalent * load
          setIntensity = repEquivalent * rpeMultiplier * 10
        } else if (set.cardio) {
          // distance/time are not kilograms — fatigue only, no volume
          setIntensity = (set.cardio.time ?? 0) * rpeMultiplier
        } else if (set.wod) {
          setIntensity = (set.wod.time ?? 0) * rpeMultiplier
        } else if (set.mobility) {
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

    // Read current fatigue for every affected muscle up front, in ONE query.
    // Doing these reads inside the transaction cost 3 sequential round-trips
    // per muscle, which blew Prisma's 5s interactive-transaction timeout
    // against a remote database and failed the whole finish with a 500.
    const existingFatigue = await prisma.muscleFatigueCurrent.findMany({
      where: { userId: req.userId!, muscleId: { in: [...muscleDeltas.keys()] } }
    })
    const fatigueByMuscle = new Map(existingFatigue.map(f => [f.muscleId, f]))

    // Compute every new level in memory before opening the transaction
    const now = Date.now()
    const fatigueUpdates = [...muscleDeltas].map(([muscleId, { delta }]) => {
      // Decay the stored level to *now* before adding today's work. Using the
      // raw stored value would ignore all recovery since the last session, so
      // fatigue would only ever ratchet upward and pin at 100.
      const currentLevel = getEffectiveFatigueLevel(fatigueByMuscle.get(muscleId) ?? null)
      // Fatigue level is capped at 100
      const newLevel = Math.min(100, currentLevel + delta)
      // Recovery time = default 48 hours at 100% fatigue
      const recoveryTargetAt = new Date(now + newLevel * 0.48 * 60 * 60 * 1000)
      return { muscleId, delta, newLevel, recoveryTargetAt }
    })

    //  Update database in one transaction
    await prisma.$transaction(async (tx) => {

      //  Update the session with final stats (duration was set by the claim)
      // dateTime is the session's START time and must not be overwritten here,
      // or a late-night workout gets filed under the following day.
      await tx.workoutSession.update({
        where: { id: sessionId },
        data: { totalVolume, avgRpe }
      })

      //  Update fatigue for each muscle involved
      for (const { muscleId, newLevel, recoveryTargetAt } of fatigueUpdates) {
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
      }

      //  Write to MuscleFatigueLog , activity history — one round-trip
      await tx.muscleFatigueLog.createMany({
        data: fatigueUpdates.map(({ muscleId, delta, newLevel }) => ({
          userId: req.userId!,
          muscleId,
          workoutSessionId: sessionId,
          source: 'workout',
          delta,
          fatigueLevelAfter: newLevel
        }))
      })
    }, {
      // Headroom for a slow/remote database on a many-muscle session
      timeout: 20_000,
      maxWait: 10_000
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
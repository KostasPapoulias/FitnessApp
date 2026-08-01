import { Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { getEffectiveFatigueLevel, recoveryTargetFor } from '../services/fatigue.service'
import {
  FATIGUE_PER_HSE,
  HOLD_SECONDS_PER_REP,
  RECOVERY_RATE_BY_LEVEL,
  SYSTEMIC_HALF_LIFE_HOURS,
  accumulate,
  cardioHse,
  estimateE1rm,
  mobilityHse,
  resistanceHse,
  systemicFatigueDelta,
  systemicLoad,
  wodHse,
} from '../services/fatigue-model.service'
import { normalizeFitnessLevel } from '../services/readiness.service'

const SET_TYPES = ['STRENGTH', 'CALISTHENICS', 'CARDIO', 'WOD', 'MOBILITY'] as const

// Fallback bodyweight (kg) when the user has no profile weight recorded
const DEFAULT_BODY_WEIGHT = 70

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
      rounds,                // WOD (reps carries reps-per-round)
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
          // reps-per-round and rounds completed are the metcon's score; without
          // them the elapsed clock is all the fatigue model has to go on.
          await tx.setWOD.create({
            data: { setId: set.id, distance, time, reps: reps ?? null, rounds: rounds ?? null }
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
          systemicLoad: Math.round(finished?.systemicLoad ?? 0),
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

    // Bodyweight drives calisthenics load, fitness level drives recovery speed
    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.userId! }
    })
    const bodyWeight = profile?.weight ?? DEFAULT_BODY_WEIGHT
    const recoveryRate =
      RECOVERY_RATE_BY_LEVEL[normalizeFitnessLevel(profile?.fitnessLevel)] ?? 1

    // Load relative to the athlete's own strength is what makes a set costly,
    // so pull their best known 1RM for everything in this session up front.
    const exerciseIds = [...new Set(session.workoutExercises.map(we => we.exerciseId))]
    const estimates = await prisma.exerciseStrengthEstimate.findMany({
      where: { userId: req.userId!, exerciseId: { in: exerciseIds } }
    })
    const e1rmByExercise = new Map(estimates.map(e => [e.exerciseId, e.e1rm]))

    // Calculate session totals
    // totalVolume is mechanical load in KG (strength + calisthenics only).
    // Cardio distance and mobility seconds are different units and are
    // deliberately excluded — whole-body cost is carried by systemicLoad.
    let totalVolume = 0
    let totalRpe = 0
    let rpeCount = 0

    // muscleDeltas accumulates fatigue per muscle across ALL exercises
    // Map: muscleId -> { delta, muscle }
    const muscleDeltas = new Map<string, {
      delta: number
      muscleName: string
      halfLifeHours: number
    }>()

    // How many sets of each modality — weights the session's systemic load
    const setTypeCounts = new Map<string, number>()
    // Best e1RM seen this session, to fold back into the estimate afterwards
    const newE1rm = new Map<string, number>()

    type MuscleLink = (typeof session.workoutExercises)[number]['exercise']['muscleLinks']
    // A metcon is one effort spread over several movements, so it cannot be
    // scored set by set — collected here and split after the main loop.
    const wodEntries: {
      links: MuscleLink
      damage: number
      repsPerRound: number
      seconds: number
      rounds: number
      rpe: number | null
    }[] = []

    // `damageFactor` is the movement's mechanical cost per unit of work, kept
    // separate from impactFactor (which only says which muscles are recruited).
    // Without it, cycling scored higher on quads than running of the same
    // length, because cycling happens to carry a higher impactFactor.
    const addMuscleDelta = (links: MuscleLink, hse: number, damageFactor: number) => {
      if (hse <= 0 || damageFactor <= 0) return
      for (const muscleLink of links) {
        const fatigueDelta = hse * muscleLink.impactFactor * damageFactor * FATIGUE_PER_HSE
        const existing = muscleDeltas.get(muscleLink.muscleId)
        if (existing) {
          existing.delta += fatigueDelta
        } else {
          muscleDeltas.set(muscleLink.muscleId, {
            delta: fatigueDelta,
            muscleName: muscleLink.muscle.name,
            halfLifeHours: muscleLink.muscle.recoveryHalfLifeHours
          })
        }
      }
    }

    for (const workoutExercise of session.workoutExercises) {
      const exercise = workoutExercise.exercise
      const muscleLinks = exercise.muscleLinks
      const knownE1rm = e1rmByExercise.get(exercise.id) ?? 0
      const damage = exercise.damageFactor

      for (const set of workoutExercise.sets) {
        setTypeCounts.set(set.setType, (setTypeCounts.get(set.setType) ?? 0) + 1)

        if (set.rpe) {
          totalRpe += set.rpe
          rpeCount++
        }

        if (set.strength) {
          const { reps, weight } = set.strength
          totalVolume += reps * weight
          addMuscleDelta(muscleLinks, resistanceHse({
            reps, weight, rpe: set.rpe, e1rm: knownE1rm
          }), damage)
          const estimate = estimateE1rm(weight, reps, set.rpe)
          newE1rm.set(exercise.id, Math.max(newE1rm.get(exercise.id) ?? 0, estimate))

        } else if (set.calisthenics) {
          // Load is the user's own bodyweight plus any added/assisted weight.
          // Feeding it through the same curve as barbell work is what finally
          // makes a hard set of push-ups cost the same as a hard bench set.
          const load = bodyWeight + set.calisthenics.addedWeight
          const holdSeconds = set.calisthenics.time
          const repEquivalent = set.calisthenics.reps > 0
            ? set.calisthenics.reps
            : (holdSeconds ?? 0) / HOLD_SECONDS_PER_REP
          totalVolume += repEquivalent * load
          addMuscleDelta(muscleLinks, resistanceHse({
            reps: set.calisthenics.reps, weight: load, rpe: set.rpe,
            holdSeconds, e1rm: knownE1rm
          }), damage)
          const estimate = estimateE1rm(load, repEquivalent, set.rpe)
          newE1rm.set(exercise.id, Math.max(newE1rm.get(exercise.id) ?? 0, estimate))

        } else if (set.cardio) {
          // distance/time are not kilograms — no volume, but a real load.
          // Distance drives the local cost where the activity has a reference
          // speed, so ground actually covered counts rather than time on foot.
          addMuscleDelta(muscleLinks, cardioHse(
            set.cardio.time ?? 0,
            set.rpe,
            set.cardio.distance,
            exercise.referenceSpeedKmh
          ), damage)

        } else if (set.wod) {
          wodEntries.push({
            links: muscleLinks,
            damage,
            repsPerRound: set.wod.reps ?? 0,
            seconds: set.wod.time ?? 0,
            rounds: set.wod.rounds ?? 0,
            rpe: set.rpe,
          })

        } else if (set.mobility) {
          addMuscleDelta(muscleLinks, mobilityHse(), damage)
        }
      }
    }

    //  Score the metcon as a whole, then split it across its movements
    // Every movement's set carries the same elapsed clock, so scoring them
    // individually would multiply the workout by the number of movements.
    if (wodEntries.length > 0) {
      const seconds = Math.max(...wodEntries.map(w => w.seconds))
      const rounds = Math.max(...wodEntries.map(w => w.rounds))
      const rated = wodEntries.filter(w => w.rpe != null)
      const rpe = rated.length > 0
        ? rated.reduce((sum, w) => sum + (w.rpe ?? 0), 0) / rated.length
        : null
      const totalReps = wodEntries.reduce((sum, w) => sum + w.repsPerRound * rounds, 0)
      const totalHse = wodHse(seconds, rpe, totalReps)

      // Share out by rep contribution; fall back to an even split when the
      // movements were logged without rep counts.
      const repShareBase = wodEntries.reduce((sum, w) => sum + w.repsPerRound, 0)
      for (const entry of wodEntries) {
        const share = repShareBase > 0
          ? entry.repsPerRound / repShareBase
          : 1 / wodEntries.length
        addMuscleDelta(entry.links, totalHse * share, entry.damage)
      }
    }

    const avgRpe = rpeCount > 0 ? totalRpe / rpeCount : 0

    // Whole-body cost of the session. A long run leaves every individual muscle
    // reading fine, which is exactly why readiness never used to move for it.
    const sessionLoad = systemicLoad(duration ?? 0, avgRpe, setTypeCounts)

    // Read current fatigue for every affected muscle up front, in ONE query.
    // Doing these reads inside the transaction cost 3 sequential round-trips
    // per muscle, which blew Prisma's 5s interactive-transaction timeout
    // against a remote database and failed the whole finish with a 500.
    const [existingFatigue, existingSystemic] = await Promise.all([
      prisma.muscleFatigueCurrent.findMany({
        where: { userId: req.userId!, muscleId: { in: [...muscleDeltas.keys()] } }
      }),
      prisma.systemicFatigue.findUnique({ where: { userId: req.userId! } }),
    ])
    const fatigueByMuscle = new Map(existingFatigue.map(f => [f.muscleId, f]))

    // Compute every new level in memory before opening the transaction
    const now = new Date()
    const fatigueUpdates = [...muscleDeltas].map(([muscleId, { delta, halfLifeHours }]) => {
      // Decay the stored level to *now* before adding today's work. Using the
      // raw stored value would ignore all recovery since the last session, so
      // fatigue would only ever ratchet upward and pin at 100.
      const currentLevel = getEffectiveFatigueLevel(fatigueByMuscle.get(muscleId) ?? null, now)
      // Saturating, so a session far past the limit still outranks a merely
      // hard one instead of both flattening to exactly 100.
      const newLevel = accumulate(currentLevel, delta)
      const recoveryTargetAt = recoveryTargetFor(newLevel, halfLifeHours * recoveryRate, now)
      return { muscleId, delta, newLevel, recoveryTargetAt }
    })

    // Same curve, one row, whole body
    const systemicBefore = getEffectiveFatigueLevel(
      existingSystemic
        ? {
            fatigueLevel: existingSystemic.level,
            updatedAt: existingSystemic.updatedAt,
            recoveryTargetAt: existingSystemic.recoveryTargetAt,
          }
        : null,
      now
    )
    const systemicAfter = accumulate(systemicBefore, systemicFatigueDelta(sessionLoad))
    const systemicRecoveryAt = recoveryTargetFor(
      systemicAfter, SYSTEMIC_HALF_LIFE_HOURS * recoveryRate, now
    )

    //  Update database in one transaction
    await prisma.$transaction(async (tx) => {

      //  Update the session with final stats (duration was set by the claim)
      // dateTime is the session's START time and must not be overwritten here,
      // or a late-night workout gets filed under the following day.
      await tx.workoutSession.update({
        where: { id: sessionId },
        data: { totalVolume, avgRpe, systemicLoad: sessionLoad }
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

      //  Whole-body fatigue — the channel cardio and metcons actually load
      if (systemicAfter > 0) {
        await tx.systemicFatigue.upsert({
          where: { userId: req.userId! },
          update: { level: systemicAfter, recoveryTargetAt: systemicRecoveryAt },
          create: {
            userId: req.userId!,
            level: systemicAfter,
            recoveryTargetAt: systemicRecoveryAt
          }
        })
      }

      //  Roll forward the strength estimates this session improved on
      for (const [exerciseId, e1rm] of newE1rm) {
        if (e1rm <= (e1rmByExercise.get(exerciseId) ?? 0)) continue
        await tx.exerciseStrengthEstimate.upsert({
          where: { userId_exerciseId: { userId: req.userId!, exerciseId } },
          update: { e1rm },
          create: { userId: req.userId!, exerciseId, e1rm }
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
        // Whole-body training load, and where it left the athlete overall
        systemicLoad: Math.round(sessionLoad),
        systemicFatigue: Math.round(systemicAfter),
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
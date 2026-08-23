import { Prisma } from '@prisma/client'
import { Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { getEffectiveFatigueLevel, recoveryTargetFor } from '../services/fatigue.service'
import {
  SYSTEMIC_HALF_LIFE_HOURS,
  accumulate,
  recoveryRateFor,
  resolveAge,
  systemicFatigueDelta,
} from '../services/fatigue-model.service'
import { scoreSession } from '../services/session-scoring.service'
import { SuggestedSet, suggestForExercise } from '../services/workout-progression.service'
import { startingSets, startingWorkingLoad } from '../services/starting-load.service'
import {
  recomputeStrengthEstimates, recomputeUserFatigue, rescoreSession,
} from '../services/fatigue-recompute.service'
import { log } from '../lib/logger'
import { parseBody } from '../lib/validate'
import {
  addExerciseSchema, finishSessionSchema, logSetSchema, startSessionSchema,
  updateSetSchema,
} from '../schemas/workout.schema'

// Fallback bodyweight (kg) when the user has no profile weight recorded
const DEFAULT_BODY_WEIGHT = 70

//   START SESSION 
// POST /api/workout/sessions
// Called when user taps "Start Workout"
// Creates an empty session and returns the ID
export const startSession = async (req: AuthRequest, res: Response) => {
  try {
    const body = parseBody(startSessionSchema, req.body, res)
    if (!body) return
    const { notes, weatherCondition } = body

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
    log.error('startSession failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//    ADD EXERCISE TO SESSION 
// POST /api/workout/sessions/:id/exercises
// Called when user confirms exercise selection
export const addExercise = async (req: AuthRequest, res: Response) => {
  try {
    const { id: sessionId } = req.params
    const body = parseBody(addExerciseSchema, req.body, res)
    if (!body) return
    const { exerciseId, orderIndex, notes } = body

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
    log.error('addExercise failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * Ceilings for a posted run.
 *
 * The route lands in a JSONB column straight from a client, so it needs a size
 * the database is willing to be handed. A 45-minute run simplified at 5m is a
 * couple of hundred points; ten thousand is far past any real session and still
 * small enough to store and draw. Over the cap the run is refused rather than
 * silently truncated — half a route drawn as if it were the whole one is worse
 * than no route at all.
 */
const MAX_ROUTE_POINTS = 10_000
const MAX_SPLITS = 500

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

const isCoordinate = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 &&
  isFiniteNumber(v[0]) && v[0] >= -180 && v[0] <= 180 &&
  isFiniteNumber(v[1]) && v[1] >= -90 && v[1] <= 90

const isSplit = (v: any): boolean =>
  v && isFiniteNumber(v.index) && isFiniteNumber(v.meters) &&
  isFiniteNumber(v.seconds) && isFiniteNumber(v.endMeters)

/**
 * Validate a posted run, or explain why it is not one.
 *
 * Returns the row to write, or an error string. A run that fails this does NOT
 * fail the set: the distance and the time are the training log and must be
 * saved regardless — losing an hour of work because a route was malformed is
 * the wrong trade every time. The caller drops the track and keeps the set.
 */
const validateRun = (run: any): { row: any } | { error: string } => {
  if (!run || typeof run !== 'object') return { error: 'not an object' }
  if (!isFiniteNumber(run.distanceM) || run.distanceM < 0) return { error: 'distanceM' }
  if (!isFiniteNumber(run.durationSec) || run.durationSec < 0) return { error: 'durationSec' }
  if (!isFiniteNumber(run.startedAt)) return { error: 'startedAt' }

  const route = Array.isArray(run.route) ? run.route : []
  let points = 0
  for (const segment of route) {
    if (!Array.isArray(segment)) return { error: 'route segment' }
    points += segment.length
    if (points > MAX_ROUTE_POINTS) return { error: 'route too large' }
    if (!segment.every(isCoordinate)) return { error: 'route coordinate' }
  }

  const splits = Array.isArray(run.splits) ? run.splits : []
  const laps = Array.isArray(run.laps) ? run.laps : []
  if (splits.length + laps.length > MAX_SPLITS) return { error: 'too many splits' }
  if (!splits.every(isSplit) || !laps.every(isSplit)) return { error: 'split shape' }

  return {
    row: {
      startedAt: new Date(run.startedAt),
      distanceM: run.distanceM,
      durationSec: Math.round(run.durationSec),
      // Recomputed rather than trusted: it is the one number history shows that
      // the athlete cannot check against anything else on the screen.
      avgPaceSec: run.distanceM > 0
        ? Math.round(run.durationSec / (run.distanceM / 1000))
        : 0,
      elevationGainM: isFiniteNumber(run.elevationGainM) ? Math.round(run.elevationGainM) : 0,
      source: run.source === 'manual' ? 'manual' : 'gps',
      route,
      bounds: run.bounds ?? null,
      splits,
      laps
    }
  }
}

//    LOG A SET
// POST /api/workout/sessions/:id/sets
// Called when user taps "Set Done" during active workout
export const logSet = async (req: AuthRequest, res: Response) => {
  try {
    const { id: sessionId } = req.params

    // The schema is a discriminated union on setType, so it does the work the
    // three hand-written checks below it used to do — and every bound the
    // fatigue model depends on that none of them ever checked.
    const body = parseBody(logSetSchema, req.body, res)
    if (!body) return

    const { workoutExerciseId, setNumber, setType, rpe, restSeconds } = body

    // Narrowed off the union rather than destructured: `weight` does not exist
    // on a CARDIO set and TypeScript is right to say so.
    const reps = 'reps' in body ? body.reps : undefined
    const weight = 'weight' in body ? body.weight : undefined
    const addedWeight = 'addedWeight' in body ? body.addedWeight : undefined
    const distance = 'distance' in body ? body.distance : undefined
    const time = 'time' in body ? body.time : undefined
    const rounds = 'rounds' in body ? body.rounds : undefined
    const duration = 'duration' in body ? body.duration : undefined
    const run = 'run' in body ? body.run : undefined

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

    // The recorded route and splits, written AFTER the set is committed and
    // deliberately outside its transaction.
    //
    // The set is the training log — distance, time, RPE — and the thing fatigue
    // and history are built from. The track is a picture of how it went. If
    // writing the picture fails for any reason at all (a malformed payload, a
    // migration that has not reached this environment yet, a full disk), the
    // athlete must still keep the hour they just ran. Inside the transaction
    // any of those would have rolled the whole set back.
    if (setType === 'CARDIO' && run) {
      const checked = validateRun(run)
      if ('error' in checked) {
        log.warn('logSet: discarding run track', { reason: checked.error })
      } else {
        try {
          await prisma.runTrack.deleteMany({ where: { setId: workoutSet.id } })
          await prisma.runTrack.create({ data: { setId: workoutSet.id, ...checked.row } })
        } catch (error) {
          log.error('logSet: run track not saved', error)
        }
      }
    }

    // 200 when an existing set was corrected, 201 when a new one was recorded
    res.status(replaced ? 200 : 201).json({ success: true, data: workoutSet, replaced })

  } catch (error) {
    log.error('logSet failed', error)
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

    const body = parseBody(finishSessionSchema, req.body, res)
    if (!body) return
    const { duration } = body

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

    // Bodyweight drives calisthenics load; level and age drive recovery speed
    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.userId! }
    })
    // Onboarding makes bodyweight mandatory, so this fallback should now be
    // unreachable for anyone who has passed the gate. It stays as a floor
    // rather than a throw: a session the athlete already finished must still
    // save, even if their profile is somehow incomplete.
    const bodyWeight = profile?.weight ?? DEFAULT_BODY_WEIGHT
    if (profile?.weight == null) {
      log.warn('Session finished with no profile weight', {
        fallbackBodyWeight: DEFAULT_BODY_WEIGHT,
      })
    }
    const recoveryRate = recoveryRateFor(
      profile?.fitnessLevel,
      resolveAge(profile?.birthDate, profile?.age)
    )

    // Load relative to the athlete's own strength is what makes a set costly,
    // so pull their best known 1RM for everything in this session up front.
    const exerciseIds = [...new Set(session.workoutExercises.map(we => we.exerciseId))]
    const estimates = await prisma.exerciseStrengthEstimate.findMany({
      where: { userId: req.userId!, exerciseId: { in: exerciseIds } }
    })
    const e1rmByExercise = new Map(estimates.map(e => [e.exerciseId, e.e1rm]))

    // Scoring lives in session-scoring.service so that finishing a session and
    // re-scoring an edited one cannot drift apart.
    const { totalVolume, avgRpe, sessionLoad, muscleDeltas, newE1rm } =
      // `?? null` because the schema distinguishes "not sent" from "sent as
      // null", and the scorer only cares that there is no client duration.
      scoreSession(session, { bodyWeight, e1rmByExercise, duration: duration ?? null })


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
    log.error('finishSession failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//   GET SESSION HISTORY 
//   PLAN SUGGESTIONS
// POST /api/workout/plan-suggestions
//
// Given the exercises about to be planned, return what the athlete should
// actually be lifting for each — built from their own history rather than the
// one-size-fits-everything table the client used to fall back on.
//
// Batched deliberately: the plan screen needs every exercise at once, and doing
// this per-tap would put a network round trip in the middle of exercise
// selection for numbers the user is not looking at yet.
export const getPlanSuggestions = async (req: AuthRequest, res: Response) => {
  try {
    const { exercises } = req.body as {
      exercises?: { exerciseId: string; fallback?: SuggestedSet[] }[]
    }

    if (!Array.isArray(exercises) || exercises.length === 0) {
      res.status(400).json({ success: false, error: 'exercises is required' })
      return
    }

    // Bounded so a malformed client cannot ask for a thousand lookups
    const requested = exercises.slice(0, 30)

    // Both in one trip — the exercise rows and the profile the load model
    // needs are independent, and this endpoint is on the critical path of
    // opening the plan screen.
    const [known, profile] = await Promise.all([
      prisma.exercise.findMany({
        where: { id: { in: requested.map(e => e.exerciseId) } },
        select: { id: true, loadFactor: true, modality: { select: { name: true } } },
      }),
      prisma.userProfile.findUnique({ where: { userId: req.userId! } }),
    ])
    const exerciseById = new Map(known.map(e => [e.id, e]))

    const loadProfile = {
      weight: profile?.weight,
      gender: profile?.gender,
      fitnessLevel: profile?.fitnessLevel,
      experienceYears: profile?.experienceYears,
      age: resolveAge(profile?.birthDate, profile?.age),
    }

    const suggestions = await Promise.all(
      requested
        .filter(item => exerciseById.has(item.exerciseId))
        .map(item => {
          const exercise = exerciseById.get(item.exerciseId)!

          // A load derived from this exercise and this athlete beats anything
          // the client can offer — its table is per-modality, so it cannot
          // tell a lateral raise from a squat. The client's fallback is used
          // only where we have no figure for the movement at all.
          const working = startingWorkingLoad(exercise.loadFactor, loadProfile)
          const fallback =
            working != null
              ? startingSets(working)
              : Array.isArray(item.fallback) && item.fallback.length > 0
                ? item.fallback
                : [{ reps: 10, weight: 20, rpe: 7, restSeconds: 90 }]

          return suggestForExercise(
            req.userId!,
            item.exerciseId,
            exercise.modality.name,
            fallback
          )
        })
    )

    res.json({ success: true, data: suggestions })

  } catch (error) {
    log.error('getPlanSuggestions failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/workout/sessions
// Used by Calendar screen
export const getSessions = async (req: AuthRequest, res: Response) => {
  try {
    const { month, year, limit } = req.query

    // Completed sessions only. `duration` is written by the finish claim and
    // nothing else, so `duration: null` is an abandoned session — it carries no
    // volume, no RPE and no fatigue, and returning it padded history with
    // entries that render as blank rows. The open session has its own endpoint.
    const where: any = { userId: req.userId!, duration: { not: null } }

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
    log.error('getSessions failed', error)
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
    log.error('getSessionById failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}
//   DELETE A SESSION
// DELETE /api/workout/sessions/:id
//
// Sessions used to be permanent. Log 100 kg instead of 10 and it was training
// history for good — and worse, it had already been folded into
// MuscleFatigueCurrent, SystemicFatigue and ExerciseStrengthEstimate, so one
// typo went on steering readiness and every future suggestion.
//
// Removing the row is the easy half. The fatigue it caused has to go with it,
// which is what fatigue-recompute.service exists for.
export const deleteSession = async (req: AuthRequest, res: Response) => {
  try {
    const { id: sessionId } = req.params

    const session = await prisma.workoutSession.findFirst({
      where: { id: sessionId, userId: req.userId! },
      select: {
        id: true,
        duration: true,
        workoutExercises: { select: { exerciseId: true } },
      },
    })

    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' })
      return
    }

    const wasFinished = session.duration != null
    const exerciseIds = [...new Set(session.workoutExercises.map(we => we.exerciseId))]

    await prisma.$transaction(async tx => {
      // MuscleFatigueLog holds workoutSessionId as an OPTIONAL relation, so
      // Prisma's default on delete is SetNull, not cascade. Left alone, the
      // session's deltas would survive it as ownerless rows — and the replay
      // reads every log for the user, so the deleted session would go on
      // fatiguing them forever with nothing left to explain why.
      await tx.muscleFatigueLog.deleteMany({ where: { workoutSessionId: sessionId } })

      // A plan that produced this session goes back on standby rather than
      // staying marked as done — the workout it recorded no longer exists.
      await tx.scheduledWorkout.updateMany({
        where: { sessionId, userId: req.userId! },
        data: { status: 'standby', sessionId: null, completedAt: null },
      })

      // Exercises, sets and every modality detail row cascade from here.
      await tx.workoutSession.delete({ where: { id: sessionId } })
    })

    // Only a finished session ever moved these. An abandoned one never reached
    // the scoring path, so there is nothing to rebuild and no reason to pay
    // for a replay. Both run after the transaction: they open their own, and
    // nesting interactive transactions against a remote database is what blew
    // the 5s timeout on finish.
    if (wasFinished) {
      await recomputeUserFatigue(req.userId!)
      await recomputeStrengthEstimates(req.userId!, exerciseIds)
    }

    res.json({ success: true, data: { id: sessionId, reversed: wasFinished } })

  } catch (error) {
    log.error('deleteSession failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//   EDIT A SET IN A RECORDED SESSION
// PATCH /api/workout/sets/:setId
//
// The narrow fix for the thing that actually happens: a weight typed with an
// extra zero, or reps counted wrong. Deleting the whole session to correct one
// number throws away everything else that was right about it.
//
// Only the modality fields the set already has are writable — a STRENGTH set
// cannot be turned into a CARDIO one. Changing a set's type would change what
// it means, and every downstream number was derived from that meaning.
export const updateSet = async (req: AuthRequest, res: Response) => {
  try {
    const { setId } = req.params

    const set = await prisma.workoutSet.findFirst({
      // Ownership runs through the set's session — a WorkoutSet has no userId
      // of its own, and trusting the id in the URL would let anyone edit
      // anyone's training history.
      where: { id: setId, workoutExercise: { session: { userId: req.userId! } } },
      include: {
        strength: true, calisthenics: true, cardio: true, wod: true, mobility: true,
        workoutExercise: { select: { sessionId: true } },
      },
    })

    if (!set) {
      res.status(404).json({ success: false, error: 'Set not found' })
      return
    }

    const body = parseBody(updateSetSchema, req.body, res)
    if (!body) return
    const { rpe, restSeconds } = body

    // Built as a list and sent in one round trip. As an interactive
    // transaction this was BEGIN, two updates and COMMIT — four round trips,
    // and on a slow link to the remote database that is past the five seconds
    // Prisma allows one, so the edit died with P2028 and returned a bare 500.
    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.workoutSet.update({
        where: { id: setId },
        data: {
          ...(rpe !== undefined ? { rpe } : {}),
          ...(restSeconds !== undefined ? { restSeconds } : {}),
        },
      }),
    ]

    const { reps, weight, addedWeight, distance, time, rounds } = body

    if (set.strength) {
      writes.push(prisma.setStrength.update({
        where: { setId },
        data: {
          ...(reps != null ? { reps: Math.round(reps) } : {}),
          ...(weight != null ? { weight } : {}),
        },
      }))
    } else if (set.calisthenics) {
      writes.push(prisma.setCalisthenics.update({
        where: { setId },
        data: {
          ...(reps != null ? { reps: Math.round(reps) } : {}),
          ...(addedWeight != null ? { addedWeight } : {}),
          ...(time !== undefined ? { time: time == null ? null : Math.round(time) } : {}),
        },
      }))
    } else if (set.cardio) {
      writes.push(prisma.setCardio.update({
        where: { setId },
        data: {
          ...(distance !== undefined ? { distance } : {}),
          ...(time !== undefined ? { time: time == null ? null : Math.round(time) } : {}),
        },
      }))
    } else if (set.wod) {
      writes.push(prisma.setWOD.update({
        where: { setId },
        data: {
          ...(reps !== undefined ? { reps: reps == null ? null : Math.round(reps) } : {}),
          ...(rounds !== undefined ? { rounds } : {}),
          ...(time !== undefined ? { time: time == null ? null : Math.round(time) } : {}),
          ...(distance !== undefined ? { distance } : {}),
        },
      }))
    } else if (set.mobility) {
      writes.push(prisma.setMobility.update({
        where: { setId },
        data: { ...(time !== undefined ? { time: time == null ? null : Math.round(time) } : {}) },
      }))
    }

    await prisma.$transaction(writes)

    // The set is already committed at this point. If the rebuild fails the row
    // is correct and everything derived from it is stale, which is a different
    // situation from the edit not happening, and the athlete has to be told
    // which one they are in — a generic 500 here previously left them retrying
    // an edit that had already been applied.
    try {
      await applySessionEdit(req.userId!, set.workoutExercise.sessionId)
    } catch (error) {
      log.error('updateSet rebuild failed', error)
      res.status(500).json({
        success: false,
        error: 'The set was saved, but your fatigue could not be rebuilt. It will correct itself on the next edit.',
        code: 'REBUILD_FAILED',
      })
      return
    }

    res.json({ success: true, data: { id: setId } })

  } catch (error) {
    log.error('updateSet failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//   REMOVE A SET FROM A RECORDED SESSION
// DELETE /api/workout/sets/:setId
export const deleteSet = async (req: AuthRequest, res: Response) => {
  try {
    const { setId } = req.params

    const set = await prisma.workoutSet.findFirst({
      where: { id: setId, workoutExercise: { session: { userId: req.userId! } } },
      select: { id: true, workoutExercise: { select: { sessionId: true } } },
    })

    if (!set) {
      res.status(404).json({ success: false, error: 'Set not found' })
      return
    }

    // Modality detail rows cascade from the set.
    await prisma.workoutSet.delete({ where: { id: setId } })

    await applySessionEdit(req.userId!, set.workoutExercise.sessionId)

    res.json({ success: true, data: { id: setId } })

  } catch (error) {
    log.error('deleteSet failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * The three steps every edit to a recorded session needs, in order.
 *
 * Re-score the session from its sets, rebuild the athlete's fatigue from the
 * rewritten logs, then re-derive the strength estimates the session could have
 * set. Order matters: the replay reads the logs the rescore just wrote, and the
 * estimates read the sets the edit just changed.
 */
const applySessionEdit = async (userId: string, sessionId: string) => {
  // Order matters for the first one only: recomputeUserFatigue replays the
  // MuscleFatigueLog rows that rescoreSession has just rewritten.
  const exerciseIds = await rescoreSession(userId, sessionId)

  // The other two are independent — one owns MuscleFatigueCurrent/SystemicFatigue,
  // the other ExerciseStrengthEstimate, and neither reads what the other writes.
  // Sequential, that was another five seconds of pure waiting on a remote
  // database for no reason.
  await Promise.all([
    recomputeUserFatigue(userId),
    recomputeStrengthEstimates(userId, exerciseIds),
  ])
}

//   THE SESSION STILL OPEN, IF THERE IS ONE
// GET /api/workout/sessions/active
//
// `duration: null` is what "not finished" means — there is no status column,
// because duration is written by the finish claim and nothing else.
//
// Powers the resume-or-discard prompt. Returning the set count matters: the
// difference between an empty session opened by a stray tap and one with six
// sets in it is the difference between discarding without asking and never
// discarding without asking.
export const getActiveSession = async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.workoutSession.findFirst({
      where: { userId: req.userId!, duration: null },
      orderBy: { dateTime: 'desc' },
      select: {
        id: true,
        dateTime: true,
        workoutExercises: {
          select: {
            exercise: { select: { name: true } },
            _count: { select: { sets: true } },
          },
        },
      },
    })

    if (!session) {
      res.json({ success: true, data: null })
      return
    }

    res.json({
      success: true,
      data: {
        id: session.id,
        dateTime: session.dateTime,
        setCount: session.workoutExercises.reduce((sum, we) => sum + we._count.sets, 0),
        exerciseNames: session.workoutExercises.map(we => we.exercise.name),
      },
    })

  } catch (error) {
    log.error('getActiveSession failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

//   THE RECORDED RUN BEHIND A CARDIO SET
// GET /api/workout/sets/:setId/run
//
// Its own endpoint because the route is the largest thing a session owns and
// almost nothing wants it: the calendar lists dozens of sets and draws a map
// for at most one of them, when the athlete opens it.
export const getRunTrack = async (req: AuthRequest, res: Response) => {
  try {
    const { setId } = req.params

    // Ownership is checked through the set's session, not on RunTrack itself —
    // the track has no userId of its own, and trusting the id in the URL would
    // hand anyone the exact route of anyone else's runs.
    const track = await prisma.runTrack.findFirst({
      where: {
        setId,
        set: { workoutExercise: { session: { userId: req.userId! } } }
      }
    })

    // 200 with null, not 404: a cardio set logged before routes were recorded
    // is a perfectly valid set that simply has no track, and the screen shows
    // its numbers either way.
    res.json({ success: true, data: track })

  } catch (error) {
    log.error('getRunTrack failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

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
  updateExerciseNotesSchema, updateSetSchema,
} from '../schemas/workout.schema'

// Fallback bodyweight (kg) when the profile has none
const DEFAULT_BODY_WEIGHT = 70

// POST /api/workout/sessions — create an empty session when the athlete taps Start
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

// POST /api/workout/sessions/:id/exercises — add an exercise to a session
export const addExercise = async (req: AuthRequest, res: Response) => {
  try {
    const { id: sessionId } = req.params
    const body = parseBody(addExerciseSchema, req.body, res)
    if (!body) return
    const { exerciseId, orderIndex, notes } = body

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
 * Size limits for a posted run (stored as JSONB). An oversized route is
 * rejected, never silently truncated.
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
 * Validate a posted run; returns the row to write or an error. A failure drops
 * only the track — the set itself is always saved.
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
      // Recomputed rather than trusted
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

// POST /api/workout/sessions/:id/sets — log or correct one set
export const logSet = async (req: AuthRequest, res: Response) => {
  try {
    const { id: sessionId } = req.params

    // Discriminated union on setType; each modality accepts only its own fields
    const body = parseBody(logSetSchema, req.body, res)
    if (!body) return

    const { workoutExerciseId, setNumber, setType, rpe, restSeconds } = body

    // Narrowed off the union: not every modality has every field
    const reps = 'reps' in body ? body.reps : undefined
    const weight = 'weight' in body ? body.weight : undefined
    const addedWeight = 'addedWeight' in body ? body.addedWeight : undefined
    const distance = 'distance' in body ? body.distance : undefined
    const time = 'time' in body ? body.time : undefined
    const rounds = 'rounds' in body ? body.rounds : undefined
    const duration = 'duration' in body ? body.duration : undefined
    const run = 'run' in body ? body.run : undefined

    // The exercise must belong to this session, and the session to this user
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

    // Upsert on (workoutExerciseId, setNumber): re-logging corrects the set in place
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

      // The modality may have changed on re-log, so clear any previous detail row
      if (existing) {
        await Promise.all([
          tx.setStrength.deleteMany({ where: { setId: set.id } }),
          tx.setCalisthenics.deleteMany({ where: { setId: set.id } }),
          tx.setCardio.deleteMany({ where: { setId: set.id } }),
          tx.setWOD.deleteMany({ where: { setId: set.id } }),
          tx.setMobility.deleteMany({ where: { setId: set.id } })
        ])
      }

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
              // Isometric holds record seconds, not reps
              time: duration ?? null
            }
          })
          break
        case 'CARDIO':
          // `reps` is a count for movements with no distance (skips, floors)
          await tx.setCardio.create({
            data: { setId: set.id, distance, time, reps: reps ?? null }
          })
          break
        case 'WOD':
          // Reps per round and rounds are the metcon's score; weight is its load
          await tx.setWOD.create({
            data: {
              setId: set.id, distance, time,
              reps: reps ?? null, rounds: rounds ?? null,
              weight: weight ?? null,
            }
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

    // The run track is written after, and outside, the set's transaction — a
    // track failure must never roll back the set.
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

    // 200 when an existing set was corrected, 201 when new
    res.status(replaced ? 200 : 201).json({ success: true, data: workoutSet, replaced })

  } catch (error) {
    log.error('logSet failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// POST /api/workout/sessions/:id/finish — score the session and apply its
// fatigue, systemic load and e1RM updates in one transaction
export const finishSession = async (req: AuthRequest, res: Response) => {
  try {
    const { id: sessionId } = req.params

    const body = parseBody(finishSessionSchema, req.body, res)
    if (!body) return
    const { duration } = body

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

    // Claim atomically: a conditional update on `duration: null`, so of two
    // concurrent finishes only one applies fatigue
    const claim = await prisma.workoutSession.updateMany({
      where: { id: sessionId, userId: req.userId!, duration: null },
      data: { duration }
    })

    if (claim.count === 0) {
      // Already finished (double tap or retry): return the stored summary
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
    // Onboarding requires bodyweight; the fallback only keeps a finish from failing
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

    // The athlete's best known 1RMs, for relative-load scoring
    const exerciseIds = [...new Set(session.workoutExercises.map(we => we.exerciseId))]
    const estimates = await prisma.exerciseStrengthEstimate.findMany({
      where: { userId: req.userId!, exerciseId: { in: exerciseIds } }
    })
    const e1rmByExercise = new Map(estimates.map(e => [e.exerciseId, e.e1rm]))

    // Shared with re-scoring, so the two cannot drift apart
    const { totalVolume, avgRpe, sessionLoad, muscleDeltas, newE1rm } =
      // Duration may be absent
      scoreSession(session, { bodyWeight, e1rmByExercise, duration: duration ?? null })

    // Current fatigue for every affected muscle, read before the transaction
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
      // Decay the stored level to now before adding today's work
      const currentLevel = getEffectiveFatigueLevel(fatigueByMuscle.get(muscleId) ?? null, now)
      // Saturating, so a far-too-hard session still outranks a merely hard one
      const newLevel = accumulate(currentLevel, delta)
      const recoveryTargetAt = recoveryTargetFor(newLevel, halfLifeHours * recoveryRate, now)
      return { muscleId, delta, newLevel, recoveryTargetAt }
    })

    // Systemic fatigue: same curve, one row
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

    // Write everything in one transaction
    await prisma.$transaction(async (tx) => {

      // dateTime stays the start time, so late sessions keep their day
      await tx.workoutSession.update({
        where: { id: sessionId },
        data: { totalVolume, avgRpe, systemicLoad: sessionLoad }
      })

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

      // Whole-body fatigue
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

      // Raise the strength estimates this session improved
      for (const [exerciseId, e1rm] of newE1rm) {
        if (e1rm <= (e1rmByExercise.get(exerciseId) ?? 0)) continue
        await tx.exerciseStrengthEstimate.upsert({
          where: { userId_exerciseId: { userId: req.userId!, exerciseId } },
          update: { e1rm },
          create: { userId: req.userId!, exerciseId, e1rm }
        })
      }

      // Activity history, one round trip
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
      // Headroom for a slow remote database
      timeout: 20_000,
      maxWait: 10_000
    })

    // Reload updated fatigue for the summary
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

// POST /api/workout/plan-suggestions — suggested sets for each planned
// exercise, from the athlete's history (batched for the plan screen)
export const getPlanSuggestions = async (req: AuthRequest, res: Response) => {
  try {
    const { exercises } = req.body as {
      exercises?: { exerciseId: string; fallback?: SuggestedSet[] }[]
    }

    if (!Array.isArray(exercises) || exercises.length === 0) {
      res.status(400).json({ success: false, error: 'exercises is required' })
      return
    }

    // At most 30 lookups per request
    const requested = exercises.slice(0, 30)

    // Independent reads, batched
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

          // A per-exercise starting load beats the client's per-modality placeholder
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

// GET /api/workout/sessions/:id — one session with all its sets
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
// DELETE /api/workout/sessions/:id — deletes a session and reverses the
// fatigue and strength estimates it produced
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
      // Log rows only SetNull on session delete, so remove them explicitly —
      // otherwise the replay would keep counting them
      await tx.muscleFatigueLog.deleteMany({ where: { workoutSessionId: sessionId } })

      // A linked plan goes back on standby
      await tx.scheduledWorkout.updateMany({
        where: { sessionId, userId: req.userId! },
        data: { status: 'standby', sessionId: null, completedAt: null },
      })

      // Exercises, sets and modality rows cascade
      await tx.workoutSession.delete({ where: { id: sessionId } })
    })

    // Only a finished session affected fatigue; rebuild after the transaction
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

// PATCH /api/workout/sets/:setId — correct a recorded set. Only the fields of
// its existing modality are editable; the session is re-scored afterwards.
export const updateSet = async (req: AuthRequest, res: Response) => {
  try {
    const { setId } = req.params

    const set = await prisma.workoutSet.findFirst({
      // Ownership through the set's session
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

    // Batched array transaction (one round trip)
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
          ...(reps !== undefined ? { reps: reps == null ? null : Math.round(reps) } : {}),
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
          ...(weight !== undefined ? { weight } : {}),
        },
      }))
    } else if (set.mobility) {
      writes.push(prisma.setMobility.update({
        where: { setId },
        data: { ...(time !== undefined ? { time: time == null ? null : Math.round(time) } : {}) },
      }))
    }

    await prisma.$transaction(writes)

    // The edit is committed; if the rebuild fails, say so specifically so the
    // athlete does not retry an edit that already applied
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

// DELETE /api/workout/sets/:setId — remove a recorded set and re-score the session
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

    // Modality rows cascade
    await prisma.workoutSet.delete({ where: { id: setId } })

    await applySessionEdit(req.userId!, set.workoutExercise.sessionId)

    res.json({ success: true, data: { id: setId } })

  } catch (error) {
    log.error('deleteSet failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// PATCH /api/workout/sessions/:id/exercises/:workoutExerciseId — update an
// exercise's note. Notes are not a model input, so nothing is re-scored.
export const updateExerciseNotes = async (req: AuthRequest, res: Response) => {
  try {
    const { id: sessionId, workoutExerciseId } = req.params

    const body = parseBody(updateExerciseNotesSchema, req.body, res)
    if (!body) return

    // Both ids checked, with ownership through the session
    const workoutExercise = await prisma.workoutExercise.findFirst({
      where: { id: workoutExerciseId, sessionId, session: { userId: req.userId! } },
      select: { id: true },
    })

    if (!workoutExercise) {
      res.status(404).json({ success: false, error: 'Exercise not found in this session' })
      return
    }

    // Empty collapses to null, so "cleared" is a single state
    const trimmed = body.notes?.trim()
    const updated = await prisma.workoutExercise.update({
      where: { id: workoutExerciseId },
      data: { notes: trimmed ? trimmed : null },
      select: { id: true, notes: true },
    })

    res.json({ success: true, data: updated })

  } catch (error) {
    log.error('updateExerciseNotes failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * Every edit to a recorded session: re-score it, then rebuild fatigue and
 * strength estimates.
 */
const applySessionEdit = async (userId: string, sessionId: string) => {
  // First, because the fatigue replay reads the logs this rewrites
  const exerciseIds = await rescoreSession(userId, sessionId)

  // Independent of each other, so in parallel
  await Promise.all([
    recomputeUserFatigue(userId),
    recomputeStrengthEstimates(userId, exerciseIds),
  ])
}

// GET /api/workout/sessions/active — the unfinished session (duration null),
// with its set count for the resume-or-discard prompt
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

// GET /api/workout/sets/:setId/run — the recorded route for a cardio set, or
// null; fetched only when a run is opened
export const getRunTrack = async (req: AuthRequest, res: Response) => {
  try {
    const { setId } = req.params

    // Ownership through the set's session
    const track = await prisma.runTrack.findFirst({
      where: {
        setId,
        set: { workoutExercise: { session: { userId: req.userId! } } }
      }
    })

    // null, not 404: a cardio set may simply have no track
    res.json({ success: true, data: track })

  } catch (error) {
    log.error('getRunTrack failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

import { Response } from 'express'
import prisma from '../lib/prisma'
import { getUserReadiness } from '../services/readiness.service'
import { recoveryTargetFor } from '../services/fatigue.service'
import { getTrainingLoad } from '../services/training-load.service'
import { recoveryRateFor, resolveAge } from '../services/fatigue-model.service'
import { AuthRequest } from '../server'
import { log } from '../lib/logger'
import { localeOf } from '../lib/locale'
import { describeSleepReadiness } from '../services/sleep-readiness.service'
import { parseBody } from '../lib/validate'
import { overrideFatigueSchema } from '../schemas/fatigue.schema'

// GET /api/fatigue/current — every muscle's current fatigue plus readiness
export const getCurrentFatigue = async (req: AuthRequest, res: Response) => {
  try {
    const {
      muscles, readinessScore, status, fitnessLevel,
      systemicFatigue, systemicRecoveryTargetAt, sleep,
    } = await getUserReadiness(req.userId!)

    res.json({
      success: true,
      data: {
        // effectiveLevel is internal precision, not part of the API
        muscles: muscles.map(({ effectiveLevel, ...m }) => m),
        readinessScore,
        readinessStatus: status,
        fitnessLevel,
        systemicFatigue,
        systemicRecoveryTargetAt,
        // Sent even when not applied, so the client can explain an unchanged score
        sleep: {
          adjustment: sleep.adjustment,
          applied: sleep.applied,
          reason: sleep.reason,
          durationMin: sleep.durationMin,
          sleepScore: sleep.sleepScore,
          sleepDate: sleep.sleepDate,
          // Localised here; readiness.sleepNote stays English for the AI prompt
          note: describeSleepReadiness(sleep, localeOf(res)),
        },
      }
    })

  } catch (error) {
    log.error('getCurrentFatigue failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/fatigue/load — acute vs chronic training load
export const getTrainingLoadSummary = async (req: AuthRequest, res: Response) => {
  try {
    const load = await getTrainingLoad(req.userId!)
    res.json({ success: true, data: load })

  } catch (error) {
    log.error('getTrainingLoadSummary failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// PUT /api/fatigue/:muscleId — manual override of one muscle's fatigue
export const overrideFatigue = async (req: AuthRequest, res: Response) => {
  try {
    const { muscleId } = req.params
    const body = parseBody(overrideFatigueSchema, req.body, res)
    if (!body) return
    const { fatigueLevel } = body

    // Recovery target uses the same exponential curve and the muscle's own half-life
    const muscle = await prisma.muscle.findUnique({ where: { id: muscleId } })
    if (!muscle) {
      res.status(404).json({ success: false, error: 'Muscle not found' })
      return
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.userId! }
    })
    const recoveryRate = recoveryRateFor(
      profile?.fitnessLevel,
      resolveAge(profile?.birthDate, profile?.age)
    )

    const recoveryTargetAt = recoveryTargetFor(
      fatigueLevel, muscle.recoveryHalfLifeHours * recoveryRate
    )

    const updated = await prisma.muscleFatigueCurrent.upsert({
      where: {
        userId_muscleId: {
          userId: req.userId!,
          muscleId
        }
      },
      update: { fatigueLevel, recoveryTargetAt },
      create: {
        userId: req.userId!,
        muscleId,
        fatigueLevel,
        recoveryTargetAt
      }
    })

    await prisma.muscleFatigueLog.create({
      data: {
        userId: req.userId!,
        muscleId,
        source: 'manual_override',
        delta: fatigueLevel,
        fatigueLevelAfter: fatigueLevel
      }
    })

    res.json({ success: true, data: updated })

  } catch (error) {
    log.error('overrideFatigue failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}
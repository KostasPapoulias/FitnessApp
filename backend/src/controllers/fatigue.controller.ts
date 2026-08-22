import { Response } from 'express'
import prisma from '../lib/prisma'
import { getUserReadiness } from '../services/readiness.service'
import { recoveryTargetFor } from '../services/fatigue.service'
import { getTrainingLoad } from '../services/training-load.service'
import { recoveryRateFor, resolveAge } from '../services/fatigue-model.service'
import { AuthRequest } from '../server'

// GET /api/fatigue/current
// Returns ALL muscles with their current fatigue state
export const getCurrentFatigue = async (req: AuthRequest, res: Response) => {
  try {
    const {
      muscles, readinessScore, status, fitnessLevel,
      systemicFatigue, systemicRecoveryTargetAt, sleep, sleepNote,
    } = await getUserReadiness(req.userId!)

    res.json({
      success: true,
      data: {
        // effectiveLevel is internal precision — not part of the API contract
        muscles: muscles.map(({ effectiveLevel, ...m }) => m),
        readinessScore,
        readinessStatus: status,
        fitnessLevel,
        // Whole-body fatigue: no muscle row can express what a long run costs
        systemicFatigue,
        systemicRecoveryTargetAt,
        // Sleep's share of the score above, and whether it had one. Sent even
        // when it did not apply: "no sleep logged" is the answer to why the
        // number did not move, and the client must not have to infer it.
        sleep: {
          adjustment: sleep.adjustment,
          applied: sleep.applied,
          reason: sleep.reason,
          durationMin: sleep.durationMin,
          sleepScore: sleep.sleepScore,
          sleepDate: sleep.sleepDate,
          note: sleepNote,
        },
      }
    })

  } catch (error) {
    console.error('getCurrentFatigue error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/fatigue/load
// Acute vs chronic training load. Answers "am I building or digging a hole",
// which per-muscle fatigue cannot — that only describes today.
export const getTrainingLoadSummary = async (req: AuthRequest, res: Response) => {
  try {
    const load = await getTrainingLoad(req.userId!)
    res.json({ success: true, data: load })

  } catch (error) {
    console.error('getTrainingLoadSummary error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// PUT /api/fatigue/:muscleId
// Manual override — user adjusts fatigue if algorithm is wrong
export const overrideFatigue = async (req: AuthRequest, res: Response) => {
  try {
    const { muscleId } = req.params
    const { fatigueLevel } = req.body

    if (fatigueLevel < 0 || fatigueLevel > 100) {
      res.status(400).json({
        success: false,
        error: 'Fatigue level must be between 0 and 100'
      })
      return
    }

    // Recovery target follows the same exponential curve as an earned level,
    // using this muscle's own half-life — an override must not put the muscle
    // on a different decay model from every other row.
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

    // Log the manual override
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
    console.error('overrideFatigue error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}
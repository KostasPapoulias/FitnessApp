import { Response } from 'express'
import prisma from '../lib/prisma'
import { getUserReadiness } from '../services/readiness.service'
import { AuthRequest } from '../server'

// GET /api/fatigue/current
// Returns ALL muscles with their current fatigue state
export const getCurrentFatigue = async (req: AuthRequest, res: Response) => {
  try {
    const { muscles, readinessScore, status, fitnessLevel } =
      await getUserReadiness(req.userId!)

    res.json({
      success: true,
      data: {
        // effectiveLevel is internal precision — not part of the API contract
        muscles: muscles.map(({ effectiveLevel, ...m }) => m),
        readinessScore,
        readinessStatus: status,
        fitnessLevel
      }
    })

  } catch (error) {
    console.error('getCurrentFatigue error:', error)
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

    // Calculate new recovery target based on manual level
    const recoveryHours = fatigueLevel * 0.48 // 100% fatigue = 48h recovery
    const recoveryTargetAt = new Date(
      Date.now() + recoveryHours * 60 * 60 * 1000
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
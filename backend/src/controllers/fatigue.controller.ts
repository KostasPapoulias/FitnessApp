import { Response } from 'express'
import prisma from '../lib/prisma'
import { getEffectiveFatigueLevel } from '../services/fatigue.service'
import { AuthRequest } from '../server'

// GET /api/fatigue/current
// Returns ALL muscles with their current fatigue state
export const getCurrentFatigue = async (req: AuthRequest, res: Response) => {
  try {
    // Get all muscles that exist
    const allMuscles = await prisma.muscle.findMany()

    // Get this user's current fatigue records
    const fatigueCurrent = await prisma.muscleFatigueCurrent.findMany({
      where: { userId: req.userId! },
      include: { muscle: true }
    })

    const fatigueMap = new Map(
      fatigueCurrent.map(f => [f.muscleId, f])
    )

    const now = new Date()

    // For every muscle, return its fatigue state
    // If no record exists yet 0% fatigue
    const muscles = allMuscles.map(muscle => {
      const record = fatigueMap.get(muscle.id)

      const fatigueLevel = getEffectiveFatigueLevel(record ?? null, now)
      const recoveryTargetAt = record?.recoveryTargetAt ?? null

      const rounded = Math.round(fatigueLevel)

      return {
        muscleId: muscle.id,
        muscleName: muscle.name,
        fatigueLevel: rounded,
        // SVG colors
        status: rounded >= 70 ? 'high' :
                rounded >= 35 ? 'moderate' : 'recovered',
        color: rounded >= 70 ? '#EF4444' :
               rounded >= 35 ? '#FACC15' : '#4ADE80',
        recoveryTargetAt,
        lastUpdated: record?.updatedAt ?? null
      }
    })

    // calculate readiness score
    const avgFatigue = muscles.reduce(
      (sum, m) => sum + m.fatigueLevel, 0
    ) / muscles.length

    const readinessScore = Math.round(Math.max(0, 100 - avgFatigue))

    res.json({
      success: true,
      data: {
        muscles,
        readinessScore
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
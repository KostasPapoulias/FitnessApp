import { Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'

// GET /api/profile
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      include: {
        profile: true,
        settings: true
      }
    })

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    // Count total workouts
    const totalWorkouts = await prisma.workoutSession.count({
      where: { userId: req.userId! }
    })

    // Get total volume across all sessions
    const volumeResult = await prisma.workoutSession.aggregate({
      where: { userId: req.userId! },
      _sum: { totalVolume: true }
    })

    // Get average RPE
    const rpeResult = await prisma.workoutSession.aggregate({
      where: { userId: req.userId! },
      _avg: { avgRpe: true }
    })

    // Get latest sleep log
    const latestSleep = await prisma.sleepLog.findFirst({
      where: { userId: req.userId! },
      orderBy: { sleepDate: 'desc' }
    })

    // Get latest nutrition log
    const latestNutrition = await prisma.nutritionLog.findFirst({
      where: { userId: req.userId! },
      orderBy: { logDate: 'desc' }
    })

    // Get latest biometrics
    const latestHRV = await prisma.biometric.findFirst({
      where: { userId: req.userId!, type: 'HRV' },
      orderBy: { measuredAt: 'desc' }
    })

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        profile: user.profile,
        settings: user.settings,
        stats: {
          totalWorkouts,
          totalVolume: volumeResult._sum.totalVolume ?? 0,
          avgRpe: rpeResult._avg.avgRpe ?? 0
        },
        today: {
          sleepDuration: latestSleep?.durationMin ?? null,
          sleepScore: latestSleep?.sleepScore ?? null,
          protein: latestNutrition?.proteinG ?? null,
          calories: latestNutrition?.calories ?? null,
          hrv: latestHRV?.value ?? null
        }
      }
    })

  } catch (error) {
    console.error('getProfile error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// PUT /api/profile
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { name, age, weight, height, gender, fitnessLevel, goal } = req.body

    const profile = await prisma.userProfile.upsert({
      where: { userId: req.userId! },
      update: { name, age, weight, height, gender, fitnessLevel, goal },
      create: {
        userId: req.userId!,
        name: name ?? 'User',
        age, weight, height, gender, fitnessLevel, goal
      }
    })

    res.json({ success: true, data: profile })

  } catch (error) {
    console.error('updateProfile error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// POST /api/profile/sleep
export const logSleep = async (req: AuthRequest, res: Response) => {
  try {
    const { sleepDate, durationMin, sleepScore, notes } = req.body

    const log = await prisma.sleepLog.create({
      data: {
        userId: req.userId!,
        sleepDate: new Date(sleepDate),
        durationMin,
        sleepScore,
        notes
      }
    })

    res.status(201).json({ success: true, data: log })

  } catch (error) {
    console.error('logSleep error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// POST /api/profile/nutrition
export const logNutrition = async (req: AuthRequest, res: Response) => {
  try {
    const { logDate, proteinG, calories, notes } = req.body

    const log = await prisma.nutritionLog.create({
      data: {
        userId: req.userId!,
        logDate: new Date(logDate),
        proteinG,
        calories,
        notes
      }
    })

    res.status(201).json({ success: true, data: log })

  } catch (error) {
    console.error('logNutrition error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// DELETE /api/profile/account 
export const deleteAccount = async (req: AuthRequest, res: Response) => {
  try {
    // Cascade deletes handle everything — one delete removes all user data
    await prisma.user.delete({ where: { id: req.userId! } })
    res.json({ success: true, data: { message: 'Account deleted' } })
  } catch (error) {
    console.error('deleteAccount error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}
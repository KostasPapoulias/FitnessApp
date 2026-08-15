import { Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { yearsBetween } from './onboarding.controller'

// GET /api/profile
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    // Issued together, not one after another. These seven queries are entirely
    // independent, and awaiting them in sequence billed a full network round
    // trip each — against a remote database that is ~290 ms per trip, this
    // single endpoint spent about two seconds waiting rather than working.
    //
    // The two aggregates are also merged into one: _sum and _avg over the same
    // rows with the same filter is one scan, not two.
    const [
      user, totalWorkouts, sessionStats, latestSleep, latestNutrition, latestHRV
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.userId! },
        include: { profile: true, settings: true }
      }),
      prisma.workoutSession.count({ where: { userId: req.userId! } }),
      prisma.workoutSession.aggregate({
        where: { userId: req.userId! },
        _sum: { totalVolume: true },
        _avg: { avgRpe: true }
      }),
      prisma.sleepLog.findFirst({
        where: { userId: req.userId! },
        orderBy: { sleepDate: 'desc' }
      }),
      prisma.nutritionLog.findFirst({
        where: { userId: req.userId! },
        orderBy: { logDate: 'desc' }
      }),
      prisma.biometric.findFirst({
        where: { userId: req.userId!, type: 'HRV' },
        orderBy: { measuredAt: 'desc' }
      }),
    ])

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        profile: user.profile,
        settings: user.settings,
        stats: {
          totalWorkouts,
          totalVolume: sessionStats._sum.totalVolume ?? 0,
          avgRpe: sessionStats._avg.avgRpe ?? 0
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
    const {
      name, age, weight, height, gender, fitnessLevel, goal,
      birthDate, trainingDaysPerWeek, experienceYears,
    } = req.body

    // Only write what was actually sent. Spreading the body wholesale would
    // let an omitted field null out a stored value — the Edit Profile modal
    // does not send every column, and a partial save must stay partial.
    const parsedBirthDate =
      typeof birthDate === 'string' && !Number.isNaN(Date.parse(birthDate))
        ? new Date(birthDate)
        : undefined

    const data = {
      ...(name != null ? { name } : {}),
      ...(weight != null ? { weight } : {}),
      ...(height != null ? { height } : {}),
      ...(gender != null ? { gender } : {}),
      ...(fitnessLevel != null ? { fitnessLevel } : {}),
      ...(goal != null ? { goal } : {}),
      ...(trainingDaysPerWeek != null ? { trainingDaysPerWeek } : {}),
      ...(experienceYears != null ? { experienceYears } : {}),
      ...(parsedBirthDate
        // `age` is kept in step so any older read path that still reaches for
        // it agrees with birthDate on the day it was written.
        ? {
            birthDate: parsedBirthDate,
            age: Math.floor(yearsBetween(parsedBirthDate, new Date())),
          }
        : age != null ? { age } : {}),
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId: req.userId! },
      update: data,
      create: { userId: req.userId!, name: name ?? 'User', ...data },
    })

    // A changed bodyweight is a new measurement, not just a settings edit —
    // the weight chart should show that it moved and when.
    if (weight != null && Number.isFinite(weight)) {
      const latest = await prisma.biometric.findFirst({
        where: { userId: req.userId!, type: 'WEIGHT' },
        orderBy: { measuredAt: 'desc' },
      })
      if (!latest || latest.value !== weight) {
        await prisma.biometric.create({
          data: { userId: req.userId!, type: 'WEIGHT', value: weight, source: 'profile' },
        })
      }
    }

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
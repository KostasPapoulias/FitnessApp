import { Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { yearsBetween } from './onboarding.controller'
import { CLIENT_SETTINGS_SELECT } from './settings.controller'
import { log } from '../lib/logger'
import { parseBody } from '../lib/validate'
import { buildDataExport } from '../services/data-export.service'
import {
  logNutritionSchema, logSleepSchema, updateProfileSchema,
} from '../schemas/profile.schema'

// GET /api/profile — profile, settings, stats and latest sleep/nutrition/HRV
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    // Independent reads, batched; one aggregate covers both sum and average
    const [
      user, totalWorkouts, sessionStats, latestSleep, latestNutrition, latestHRV
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.userId! },
        // Settings through the allowlist, so the PIN hash never leaves
        include: { profile: true, settings: { select: CLIENT_SETTINGS_SELECT } }
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
    log.error('getProfile failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// PUT /api/profile
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = parseBody(updateProfileSchema, req.body, res)
    if (!parsed) return
    const {
      name, age, weight, height, gender, fitnessLevel, goal,
      birthDate, trainingDaysPerWeek, experienceYears,
    } = parsed

    // Only write what was sent, so a partial save stays partial
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
        // `age` kept in step with birthDate
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

    // A changed bodyweight is also recorded as a new measurement
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
    log.error('updateProfile failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * POST /api/profile/sleep
 * One row per night: re-logging a date replaces it. Sleep feeds readiness.
 */
export const logSleep = async (req: AuthRequest, res: Response) => {
  try {
    const body = parseBody(logSleepSchema, req.body, res)
    if (!body) return
    const { sleepDate, durationMin, sleepScore, notes } = body

    const parsedDate = sleepDate ? new Date(sleepDate) : new Date()
    if (Number.isNaN(parsedDate.getTime())) {
      res.status(400).json({ success: false, error: 'sleepDate is not a valid date' })
      return
    }
    // Normalised to UTC midnight so each night is a single value
    const night = new Date(Date.UTC(
      parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate()
    ))

    const minutes = durationMin
    const score = sleepScore ?? null

    // Replace-then-create: SleepLog has no unique (userId, sleepDate) constraint
    const entry = await prisma.$transaction(async tx => {
      await tx.sleepLog.deleteMany({
        where: { userId: req.userId!, sleepDate: night }
      })
      return tx.sleepLog.create({
        data: {
          userId: req.userId!,
          sleepDate: night,
          durationMin: Math.round(minutes),
          sleepScore: score,
          notes: notes ?? null,
        }
      })
    })

    res.status(201).json({ success: true, data: entry })

  } catch (error) {
    log.error('logSleep failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// POST /api/profile/nutrition
export const logNutrition = async (req: AuthRequest, res: Response) => {
  try {
    const body = parseBody(logNutritionSchema, req.body, res)
    if (!body) return
    const { logDate, proteinG, calories, notes } = body

    const entry = await prisma.nutritionLog.create({
      data: {
        userId: req.userId!,
        logDate: new Date(logDate),
        proteinG,
        calories,
        notes
      }
    })

    res.status(201).json({ success: true, data: entry })

  } catch (error) {
    log.error('logNutrition failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * GET /api/profile/biometrics?type=WEIGHT&days=365
 * A measurement series, oldest first.
 */
const BIOMETRIC_TYPES = ['WEIGHT', 'BODY_FAT', 'LEAN_MASS', 'HEART_RATE', 'HRV', 'SLEEP_SCORE'] as const
type BiometricTypeName = typeof BIOMETRIC_TYPES[number]

const MAX_HISTORY_DAYS = 365 * 5
const DEFAULT_HISTORY_DAYS = 365

export const getBiometrics = async (req: AuthRequest, res: Response) => {
  try {
    const rawType = String(req.query.type ?? 'WEIGHT').toUpperCase()
    if (!BIOMETRIC_TYPES.includes(rawType as BiometricTypeName)) {
      res.status(400).json({
        success: false,
        error: `type must be one of: ${BIOMETRIC_TYPES.join(', ')}`,
      })
      return
    }

    const requestedDays = Number(req.query.days)
    const days = Number.isFinite(requestedDays) && requestedDays > 0
      ? Math.min(Math.floor(requestedDays), MAX_HISTORY_DAYS)
      : DEFAULT_HISTORY_DAYS

    const since = new Date(Date.now() - days * 86_400_000)

    const points = await prisma.biometric.findMany({
      where: {
        userId: req.userId!,
        type: rawType as BiometricTypeName,
        measuredAt: { gte: since },
      },
      select: { measuredAt: true, value: true, source: true },
      // Oldest first, ready to draw
      orderBy: { measuredAt: 'asc' },
    })

    res.json({ success: true, data: { type: rawType, days, points } })

  } catch (error) {
    log.error('getBiometrics failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/profile/export — everything held about the caller (see data-export.service)
export const exportData = async (req: AuthRequest, res: Response) => {
  try {
    const data = await buildDataExport(req.userId!)
    // Personal data: never cached
    res.setHeader('Cache-Control', 'no-store')
    res.json({ success: true, data })
  } catch (error) {
    log.error('exportData failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// DELETE /api/profile/account — cascades remove all of the user's data
export const deleteAccount = async (req: AuthRequest, res: Response) => {
  try {
    await prisma.user.delete({ where: { id: req.userId! } })
    res.json({ success: true, data: { message: 'Account deleted' } })
  } catch (error) {
    log.error('deleteAccount failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}
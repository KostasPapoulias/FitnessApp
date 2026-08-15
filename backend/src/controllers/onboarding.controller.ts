import { Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'

// New-user onboarding.
//
// Split into two stages on purpose. The REQUIRED stage collects what the
// fatigue engine cannot work without — bodyweight above all, since calisthenics
// load was silently computed against a hardcoded 70 kg for anyone who had not
// filled in a profile. The OPTIONAL stage (equipment, injuries) only makes
// suggestions better, so it never blocks access to the app.
//
// Everything is stored canonically in metric (kg, cm). The client converts for
// display off Settings.preferredUnit; storing whatever unit the user happened
// to be looking at is how two screens end up disagreeing about a bodyweight.

// Sanity bounds. These reject nonsense, not unusual people — the point is to
// catch a mis-keyed 700 kg or a height entered in metres, not to police bodies.
const BOUNDS = {
  weightKg: { min: 25, max: 400 },
  heightCm: { min: 100, max: 260 },
  trainingDaysPerWeek: { min: 0, max: 14 },
  experienceYears: { min: 0, max: 80 },
} as const

const FITNESS_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
const GOALS = ['hypertrophy', 'strength', 'endurance', 'weight_loss'] as const
// 'prefer_not_to_say' is a real answer, not a missing one. Anything that keys
// off sex has to tolerate it rather than assume a default.
const SEXES = ['male', 'female', 'other', 'prefer_not_to_say'] as const
const SEVERITIES = ['avoid', 'caution'] as const

// The oldest and youngest birth dates we will accept. An age under 13 is a
// different product with different legal obligations, so it is refused here
// rather than quietly accepted.
const MIN_AGE_YEARS = 13
const MAX_AGE_YEARS = 100

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

const inRange = (v: number, { min, max }: { min: number; max: number }) =>
  v >= min && v <= max

export const yearsBetween = (from: Date, to: Date): number => {
  const years = (to.getTime() - from.getTime()) / (365.2425 * 24 * 60 * 60 * 1000)
  return years
}

/**
 * GET /api/profile/onboarding/options
 *
 * The equipment catalogue and the muscle list, so the optional stage can render
 * real choices instead of a hardcoded copy that drifts from the seed data.
 */
export const getOnboardingOptions = async (_req: AuthRequest, res: Response) => {
  try {
    const [equipment, muscles] = await Promise.all([
      prisma.equipment.findMany({
        select: { id: true, name: true, description: true },
        orderBy: { name: 'asc' },
      }),
      prisma.muscle.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ])

    res.json({ success: true, data: { equipment, muscles } })
  } catch (error) {
    console.error('getOnboardingOptions error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * PUT /api/profile/onboarding
 *
 * The gated stage. Completing it stamps `onboardingCompletedAt`, which is the
 * single flag the client route guard reads.
 *
 * Validation is strict and field-by-field: this is the one place the numbers
 * behind every downstream calculation are set, and a silently-coerced NaN here
 * would surface much later as an unexplainable readiness score.
 */
export const completeOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    const {
      name, sex, birthDate, heightCm, weightKg,
      fitnessLevel, goal, trainingDaysPerWeek, experienceYears,
    } = req.body

    const errors: string[] = []

    if (!SEXES.includes(sex)) {
      errors.push('sex must be one of: ' + SEXES.join(', '))
    }

    let parsedBirthDate: Date | null = null
    if (typeof birthDate !== 'string' || Number.isNaN(Date.parse(birthDate))) {
      errors.push('birthDate must be an ISO date string')
    } else {
      parsedBirthDate = new Date(birthDate)
      const age = yearsBetween(parsedBirthDate, new Date())
      if (age < MIN_AGE_YEARS) errors.push(`You must be at least ${MIN_AGE_YEARS} to use SomaTrack`)
      else if (age > MAX_AGE_YEARS) errors.push('birthDate looks wrong — please check it')
    }

    if (!isFiniteNumber(heightCm) || !inRange(heightCm, BOUNDS.heightCm)) {
      errors.push(`height must be between ${BOUNDS.heightCm.min} and ${BOUNDS.heightCm.max} cm`)
    }

    // The load-bearing one. Everything about calisthenics fatigue rests on it.
    if (!isFiniteNumber(weightKg) || !inRange(weightKg, BOUNDS.weightKg)) {
      errors.push(`weight must be between ${BOUNDS.weightKg.min} and ${BOUNDS.weightKg.max} kg`)
    }

    if (!FITNESS_LEVELS.includes(fitnessLevel)) {
      errors.push('fitnessLevel must be one of: ' + FITNESS_LEVELS.join(', '))
    }

    if (!GOALS.includes(goal)) {
      errors.push('goal must be one of: ' + GOALS.join(', '))
    }

    // Optional within the required stage — asked on the same screen as fitness
    // level, but not worth blocking completion over.
    if (trainingDaysPerWeek != null &&
        (!isFiniteNumber(trainingDaysPerWeek) || !inRange(trainingDaysPerWeek, BOUNDS.trainingDaysPerWeek))) {
      errors.push('trainingDaysPerWeek is out of range')
    }
    if (experienceYears != null &&
        (!isFiniteNumber(experienceYears) || !inRange(experienceYears, BOUNDS.experienceYears))) {
      errors.push('experienceYears is out of range')
    }

    if (errors.length > 0) {
      res.status(400).json({ success: false, error: errors[0], errors })
      return
    }

    const existing = await prisma.userProfile.findUnique({
      where: { userId: req.userId! },
      select: { name: true, onboardingCompletedAt: true },
    })

    // `age` is written alongside birthDate purely so older read paths that
    // still reach for it agree with the new field on the day it was set.
    const derivedAge = Math.floor(yearsBetween(parsedBirthDate!, new Date()))

    const data = {
      gender: sex,
      birthDate: parsedBirthDate!,
      age: derivedAge,
      height: heightCm,
      weight: weightKg,
      fitnessLevel,
      goal,
      trainingDaysPerWeek: trainingDaysPerWeek ?? null,
      experienceYears: experienceYears ?? null,
      // Re-running onboarding (from Profile) must not reset the original
      // completion stamp — it is the gate, not a "last edited" marker.
      onboardingCompletedAt: existing?.onboardingCompletedAt ?? new Date(),
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId: req.userId! },
      update: {
        ...data,
        // Only overwrite the name if this request actually carries one.
        ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}),
      },
      create: {
        userId: req.userId!,
        name: (typeof name === 'string' && name.trim()) || existing?.name || 'User',
        ...data,
      },
    })

    // Bodyweight is also a measurement, not just a setting. Seeding the
    // Biometric series here gives the weight chart a first point and a date,
    // instead of it staying empty until the user happens to log one.
    await prisma.biometric.create({
      data: { userId: req.userId!, type: 'WEIGHT', value: weightKg, source: 'onboarding' },
    })

    res.json({ success: true, data: profile })
  } catch (error) {
    console.error('completeOnboarding error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * PUT /api/profile/equipment
 *
 * Replaces the user's equipment set wholesale — the client always sends the
 * full selection, so a diff would only add ways for the two to disagree.
 */
export const setUserEquipment = async (req: AuthRequest, res: Response) => {
  try {
    const { equipmentIds } = req.body

    if (!Array.isArray(equipmentIds) || equipmentIds.some(id => typeof id !== 'string')) {
      res.status(400).json({ success: false, error: 'equipmentIds must be an array of ids' })
      return
    }

    // Reject unknown ids rather than silently dropping them: a client sending a
    // stale id should find out, not quietly end up with less equipment than the
    // user ticked.
    const unique = [...new Set<string>(equipmentIds)]
    const known = await prisma.equipment.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    })
    if (known.length !== unique.length) {
      res.status(400).json({ success: false, error: 'One or more equipment ids are not recognised' })
      return
    }

    await prisma.$transaction([
      prisma.userEquipment.deleteMany({ where: { userId: req.userId! } }),
      prisma.userEquipment.createMany({
        data: unique.map(equipmentId => ({ userId: req.userId!, equipmentId })),
      }),
    ])

    res.json({ success: true, data: { equipmentIds: unique } })
  } catch (error) {
    console.error('setUserEquipment error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * PUT /api/profile/injuries
 *
 * Replaces the active injury set. Resolved injuries are kept as history —
 * marking something healed should not erase that it happened.
 */
export const setUserInjuries = async (req: AuthRequest, res: Response) => {
  try {
    const { injuries } = req.body

    if (!Array.isArray(injuries)) {
      res.status(400).json({ success: false, error: 'injuries must be an array' })
      return
    }

    for (const injury of injuries) {
      if (!injury || typeof injury.label !== 'string' || !injury.label.trim()) {
        res.status(400).json({ success: false, error: 'Each injury needs a label' })
        return
      }
      if (injury.severity != null && !SEVERITIES.includes(injury.severity)) {
        res.status(400).json({ success: false, error: 'severity must be "avoid" or "caution"' })
        return
      }
      if (injury.muscleId != null && typeof injury.muscleId !== 'string') {
        res.status(400).json({ success: false, error: 'muscleId must be a string' })
        return
      }
    }

    const muscleIds = injuries.map((i: any) => i.muscleId).filter(Boolean)
    if (muscleIds.length > 0) {
      const known = await prisma.muscle.findMany({
        where: { id: { in: [...new Set<string>(muscleIds)] } },
        select: { id: true },
      })
      if (known.length !== new Set(muscleIds).size) {
        res.status(400).json({ success: false, error: 'One or more muscle ids are not recognised' })
        return
      }
    }

    const now = new Date()

    await prisma.$transaction([
      // Resolve rather than delete: the row is a record of a real limitation.
      prisma.userInjury.updateMany({
        where: { userId: req.userId!, resolvedAt: null },
        data: { resolvedAt: now },
      }),
      prisma.userInjury.createMany({
        data: injuries.map((i: any) => ({
          userId: req.userId!,
          muscleId: i.muscleId ?? null,
          label: i.label.trim(),
          severity: i.severity ?? 'caution',
        })),
      }),
      // Reaching this endpoint at all means the optional stage was answered —
      // including answering it with "no injuries", which is information.
      prisma.userProfile.update({
        where: { userId: req.userId! },
        data: { optionalStageDoneAt: now },
      }),
    ])

    const active = await prisma.userInjury.findMany({
      where: { userId: req.userId!, resolvedAt: null },
    })

    res.json({ success: true, data: active })
  } catch (error) {
    console.error('setUserInjuries error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * GET /api/profile/onboarding/state
 *
 * Everything the client needs to decide what to show: gate status, the optional
 * stage's answers, and which coach-marks have already been dismissed.
 */
export const getOnboardingState = async (req: AuthRequest, res: Response) => {
  try {
    const [profile, equipment, injuries, hints] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId: req.userId! } }),
      prisma.userEquipment.findMany({
        where: { userId: req.userId! },
        select: { equipmentId: true },
      }),
      prisma.userInjury.findMany({ where: { userId: req.userId!, resolvedAt: null } }),
      prisma.seenHint.findMany({
        where: { userId: req.userId! },
        select: { hintKey: true },
      }),
    ])

    res.json({
      success: true,
      data: {
        onboardingCompletedAt: profile?.onboardingCompletedAt ?? null,
        optionalStageDoneAt: profile?.optionalStageDoneAt ?? null,
        equipmentIds: equipment.map(e => e.equipmentId),
        injuries,
        seenHints: hints.map(h => h.hintKey),
      },
    })
  } catch (error) {
    console.error('getOnboardingState error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * POST /api/profile/hints/:hintKey
 *
 * Marks a coach-mark dismissed. Idempotent — a double-tap or a retry must not
 * 500, so a repeat write is a no-op rather than a unique-constraint violation.
 */
export const dismissHint = async (req: AuthRequest, res: Response) => {
  try {
    const { hintKey } = req.params

    if (!hintKey || hintKey.length > 64) {
      res.status(400).json({ success: false, error: 'Invalid hint key' })
      return
    }

    await prisma.seenHint.upsert({
      where: { userId_hintKey: { userId: req.userId!, hintKey } },
      update: {},
      create: { userId: req.userId!, hintKey },
    })

    res.json({ success: true, data: { hintKey } })
  } catch (error) {
    console.error('dismissHint error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * DELETE /api/profile/hints
 *
 * Replays the tour. Exposed so "show tips again" in Profile is possible without
 * the user having to reinstall.
 */
export const resetHints = async (req: AuthRequest, res: Response) => {
  try {
    await prisma.seenHint.deleteMany({ where: { userId: req.userId! } })
    res.json({ success: true, data: { reset: true } })
  } catch (error) {
    console.error('resetHints error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

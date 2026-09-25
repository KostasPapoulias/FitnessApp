import bcrypt from 'bcrypt'
import { Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { validatePassword, validatePin } from '../services/credentials.service'
import { revokeAllTokens } from '../services/token-version.service'
import { log } from '../lib/logger'

/**
 * PIN screen lock and session control. The PIN gates an already signed-in
 * device; it is not a second authentication factor.
 */

const PIN_ROUNDS = 10
/** Wrong entries before the PIN is refused for a while. */
const MAX_PIN_ATTEMPTS = 5
const LOCKOUT_MINUTES = 5

// GET /api/security/pin — whether a PIN is set and whether entry is locked out
export const getPinStatus = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await prisma.settings.findUnique({
      where: { userId: req.userId! },
      select: { pinHash: true, pinLockedUntil: true, pinFailedAttempts: true },
    })

    const lockedUntil = settings?.pinLockedUntil
    const locked = Boolean(lockedUntil && lockedUntil > new Date())

    res.json({
      success: true,
      data: {
        // Only whether a hash exists
        enabled: Boolean(settings?.pinHash),
        locked,
        lockedUntil: locked ? lockedUntil : null,
        attemptsRemaining: Math.max(0, MAX_PIN_ATTEMPTS - (settings?.pinFailedAttempts ?? 0)),
      },
    })
  } catch (error) {
    log.error('getPinStatus failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// PUT /api/security/pin — set or change the PIN
export const setPin = async (req: AuthRequest, res: Response) => {
  try {
    const { pin, currentPin, password } = req.body

    const check = validatePin(pin)
    if (!check.ok) {
      res.status(400).json({ success: false, error: check.error })
      return
    }

    const settings = await prisma.settings.findUnique({
      where: { userId: req.userId! },
      select: { pinHash: true },
    })

    // Replacing an existing PIN needs the old PIN or the account password
    if (settings?.pinHash) {
      const byPin = typeof currentPin === 'string' &&
        await bcrypt.compare(currentPin, settings.pinHash)

      let byPassword = false
      if (!byPin && typeof password === 'string' && password.length > 0) {
        const user = await prisma.user.findUnique({
          where: { id: req.userId! },
          select: { password: true },
        })
        byPassword = Boolean(user) && await bcrypt.compare(password, user!.password)
      }

      if (!byPin && !byPassword) {
        res.status(401).json({
          success: false,
          error: 'Enter your current PIN or your account password to change it.',
        })
        return
      }
    }

    // Hashed once, outside the upsert (both branches would be evaluated)
    const pinHash = await bcrypt.hash(pin, PIN_ROUNDS)

    await prisma.settings.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, pinHash },
      update: {
        pinHash,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
    })

    res.json({ success: true })
  } catch (error) {
    log.error('setPin failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// DELETE /api/security/pin — requires the PIN or the password
export const removePin = async (req: AuthRequest, res: Response) => {
  try {
    const { pin, password } = req.body

    const settings = await prisma.settings.findUnique({
      where: { userId: req.userId! },
      select: { pinHash: true },
    })
    if (!settings?.pinHash) {
      res.json({ success: true })
      return
    }

    const byPin = typeof pin === 'string' && await bcrypt.compare(pin, settings.pinHash)
    let byPassword = false
    if (!byPin && typeof password === 'string' && password.length > 0) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { password: true },
      })
      byPassword = Boolean(user) && await bcrypt.compare(password, user!.password)
    }

    if (!byPin && !byPassword) {
      res.status(401).json({ success: false, error: 'Incorrect PIN or password.' })
      return
    }

    await prisma.settings.update({
      where: { userId: req.userId! },
      data: { pinHash: null, pinFailedAttempts: 0, pinLockedUntil: null },
    })

    res.json({ success: true })
  } catch (error) {
    log.error('removePin failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// POST /api/security/pin/verify — verified server-side only
export const verifyPin = async (req: AuthRequest, res: Response) => {
  try {
    const { pin } = req.body

    const settings = await prisma.settings.findUnique({
      where: { userId: req.userId! },
      select: { pinHash: true, pinFailedAttempts: true, pinLockedUntil: true },
    })

    if (!settings?.pinHash) {
      res.status(400).json({ success: false, error: 'No PIN is set.' })
      return
    }

    const now = new Date()
    if (settings.pinLockedUntil && settings.pinLockedUntil > now) {
      const seconds = Math.ceil((settings.pinLockedUntil.getTime() - now.getTime()) / 1000)
      res.status(429).json({
        success: false,
        error: `Too many attempts. Try again in ${seconds}s.`,
        lockedUntil: settings.pinLockedUntil,
      })
      return
    }

    const valid = typeof pin === 'string' && await bcrypt.compare(pin, settings.pinHash)

    if (!valid) {
      // Count failures server-side; lock after MAX_PIN_ATTEMPTS
      const attempts = settings.pinFailedAttempts + 1
      const lock = attempts >= MAX_PIN_ATTEMPTS

      await prisma.settings.update({
        where: { userId: req.userId! },
        data: {
          pinFailedAttempts: lock ? 0 : attempts,
          pinLockedUntil: lock
            ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000)
            : null,
        },
      })

      res.status(401).json({
        success: false,
        error: lock
          ? `Too many attempts. Locked for ${LOCKOUT_MINUTES} minutes.`
          : 'Incorrect PIN.',
        attemptsRemaining: lock ? 0 : MAX_PIN_ATTEMPTS - attempts,
      })
      return
    }

    if (settings.pinFailedAttempts > 0 || settings.pinLockedUntil) {
      await prisma.settings.update({
        where: { userId: req.userId! },
        data: { pinFailedAttempts: 0, pinLockedUntil: null },
      })
    }

    res.json({ success: true })
  } catch (error) {
    log.error('verifyPin failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// POST /api/security/sign-out-everywhere — revokes every token, including the caller's
export const signOutEverywhere = async (req: AuthRequest, res: Response) => {
  try {
    await revokeAllTokens(req.userId!)
    res.json({ success: true })
  } catch (error) {
    log.error('signOutEverywhere failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// PUT /api/security/password — also revokes every existing token
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body

    const check = validatePassword(newPassword)
    if (!check.ok) {
      res.status(400).json({ success: false, error: check.error })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { password: true },
    })
    if (!user || typeof currentPassword !== 'string' ||
        !(await bcrypt.compare(currentPassword, user.password))) {
      res.status(401).json({ success: false, error: 'Current password is incorrect.' })
      return
    }

    await prisma.user.update({
      where: { id: req.userId! },
      data: { password: await bcrypt.hash(newPassword, PIN_ROUNDS) },
    })
    await revokeAllTokens(req.userId!)

    res.json({ success: true })
  } catch (error) {
    log.error('changePassword failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

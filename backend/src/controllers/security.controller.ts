import bcrypt from 'bcrypt'
import { Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { validatePassword, validatePin } from '../services/credentials.service'
import { revokeAllTokens } from '../services/token-version.service'
import { log } from '../lib/logger'

/**
 * Screen lock and session control.
 *
 * A word on what the PIN is and is not. It gates the app on a device that is
 * already signed in — the case where someone picks up an unlocked phone. It is
 * NOT a second authentication factor: the API token still lives on the device,
 * so anyone who can read storage bypasses it entirely. Treated as what it is,
 * it is genuinely useful; sold as more than that, it would be misleading.
 */

const PIN_ROUNDS = 10
/** Wrong entries before the PIN is refused for a while. */
const MAX_PIN_ATTEMPTS = 5
const LOCKOUT_MINUTES = 5

// GET /api/security/pin
// Whether a PIN is set, and whether entry is currently locked out
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
        // Never the hash itself, only whether one exists
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

// PUT /api/security/pin
// Set or change the PIN. Changing one requires the current PIN; the account
// password is the way back in if it has been forgotten.
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

    // Replacing an existing PIN needs proof of the old one, or the password.
    // Without this, anyone holding an unlocked phone could simply set their own.
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

    await prisma.settings.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, pinHash: await bcrypt.hash(pin, PIN_ROUNDS) },
      update: {
        pinHash: await bcrypt.hash(pin, PIN_ROUNDS),
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

// DELETE /api/security/pin
// Removing the lock requires the PIN or the password, for the same reason
// setting it over an existing one does.
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

// POST /api/security/pin/verify
// Unlock the app. Verified server-side rather than by comparing in the client,
// so the correct PIN is never sitting in the bundle or in device storage.
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
      // A four-digit PIN is 10,000 guesses. Counting failures server-side is
      // what makes that number mean anything.
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

// POST /api/security/sign-out-everywhere
// Invalidates every token this account holds, including the caller's.
export const signOutEverywhere = async (req: AuthRequest, res: Response) => {
  try {
    await revokeAllTokens(req.userId!)
    res.json({ success: true })
  } catch (error) {
    log.error('signOutEverywhere failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// PUT /api/security/password
// Changing the password revokes every existing token — a password change that
// leaves old sessions working has not really changed anything for someone whose
// token was stolen.
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

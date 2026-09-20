import { Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { log } from '../lib/logger'
import { LOCALES, isLocale } from '../lib/locale'

/**
 * The Settings row had no endpoint at all.
 *
 * Every column here was readable — `getProfile` returns the whole row — and
 * none of them were writable outside `security.controller`, which only ever
 * touches `pinHash`. So the app shipped an "AI Data Consent" switch wired to
 * nothing but React state, and a fully-built imperial input path in Onboarding
 * and Edit Profile that no user could ever reach, because `preferredUnit`
 * could not be changed from its default.
 *
 * Writes are whitelisted field by field rather than spread from the body: the
 * row sits on User and a permissive update would let a client set columns the
 * settings screen has no business touching.
 */

/**
 * The Settings columns a client may see. Every endpoint that returns the row —
 * here, `/auth/me` and `/profile` — selects through this.
 *
 * An allowlist, not an omit. The row also holds the PIN's bcrypt hash and its
 * lockout counters, and all three endpoints used to return it whole: the hash
 * went to the phone, and `useAuthStore` persists the user to localStorage, so
 * it sat on the device. A 4–8 digit PIN is at most 10^8 guesses, and offline
 * nothing rate-limits them — the server-side lockout only protects a PIN the
 * attacker has to ask about. Listing what is safe means a column added later is
 * private until someone decides otherwise.
 */
export const CLIENT_SETTINGS_SELECT = {
  preferredUnit: true,
  notificationEnabled: true,
  inactivityDaysThreshold: true,
  theme: true,
  aiConsentEnabled: true,
  language: true,
} satisfies Prisma.SettingsSelect

const UNITS = ['metric', 'imperial'] as const
const THEMES = ['dark', 'light'] as const

/**
 * Bounds on the inactivity nudge. Below a day the rule fires against a rest
 * day, which is the notification users hate most; above a month it has stopped
 * being a nudge. `notification-rules.service` reads this straight from the row,
 * so an unbounded value would be honoured literally.
 */
const INACTIVITY_MIN_DAYS = 1
const INACTIVITY_MAX_DAYS = 30

export interface SettingsPatch {
  preferredUnit?: string
  theme?: string
  notificationEnabled?: boolean
  inactivityDaysThreshold?: number
  aiConsentEnabled?: boolean
  language?: string
}

/**
 * Validates a patch and returns either the Prisma data object or the first
 * problem found. Shared by GET's upsert-default path and PUT.
 *
 * Absent keys mean "leave alone" — the settings screen saves one toggle at a
 * time and a partial save must stay partial. `null` is rejected rather than
 * treated as absent: it almost always means a client sent a cleared field by
 * accident, and silently ignoring it hides the bug.
 */
const buildPatch = (
  body: SettingsPatch
): { ok: true; data: SettingsPatch } | { ok: false; error: string } => {
  const data: SettingsPatch = {}

  if (body.preferredUnit !== undefined) {
    if (!UNITS.includes(body.preferredUnit as typeof UNITS[number])) {
      return { ok: false, error: `preferredUnit must be one of: ${UNITS.join(', ')}` }
    }
    data.preferredUnit = body.preferredUnit
  }

  if (body.theme !== undefined) {
    if (!THEMES.includes(body.theme as typeof THEMES[number])) {
      return { ok: false, error: `theme must be one of: ${THEMES.join(', ')}` }
    }
    data.theme = body.theme
  }

  if (body.language !== undefined) {
    if (!isLocale(body.language)) {
      return { ok: false, error: `language must be one of: ${LOCALES.join(', ')}` }
    }
    data.language = body.language
  }

  if (body.notificationEnabled !== undefined) {
    if (typeof body.notificationEnabled !== 'boolean') {
      return { ok: false, error: 'notificationEnabled must be a boolean' }
    }
    data.notificationEnabled = body.notificationEnabled
  }

  if (body.aiConsentEnabled !== undefined) {
    if (typeof body.aiConsentEnabled !== 'boolean') {
      return { ok: false, error: 'aiConsentEnabled must be a boolean' }
    }
    data.aiConsentEnabled = body.aiConsentEnabled
  }

  if (body.inactivityDaysThreshold !== undefined) {
    const days = Number(body.inactivityDaysThreshold)
    if (!Number.isInteger(days) || days < INACTIVITY_MIN_DAYS || days > INACTIVITY_MAX_DAYS) {
      return {
        ok: false,
        error: `inactivityDaysThreshold must be a whole number between ${INACTIVITY_MIN_DAYS} and ${INACTIVITY_MAX_DAYS}`,
      }
    }
    data.inactivityDaysThreshold = days
  }

  return { ok: true, data }
}

// GET /api/settings
export const getSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Upsert rather than findUnique. Registration creates the row, but accounts
    // that predate a column — or any row lost to a partial delete — would
    // otherwise read as 404 and leave the settings screen permanently empty
    // with no way to write itself out of that state.
    const settings = await prisma.settings.upsert({
      where: { userId: req.userId! },
      update: {},
      create: { userId: req.userId! },
      select: CLIENT_SETTINGS_SELECT,
    })

    res.json({ success: true, data: settings })
  } catch (error) {
    log.error('getSettings failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// PUT /api/settings
export const updateSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const patch = buildPatch(req.body as SettingsPatch)

    if (!patch.ok) {
      res.status(400).json({ success: false, error: patch.error })
      return
    }

    if (Object.keys(patch.data).length === 0) {
      res.status(400).json({ success: false, error: 'No settings to update' })
      return
    }

    const settings = await prisma.settings.upsert({
      where: { userId: req.userId! },
      update: patch.data,
      create: { userId: req.userId!, ...patch.data },
      select: CLIENT_SETTINGS_SELECT,
    })

    res.json({ success: true, data: settings })
  } catch (error) {
    log.error('updateSettings failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

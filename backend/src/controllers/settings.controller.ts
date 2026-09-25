import { Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { log } from '../lib/logger'
import { LOCALES, isLocale } from '../lib/locale'

/** User settings: read with defaults, and a whitelisted field-by-field update. */

/**
 * The Settings columns a client may see. An allowlist, so the PIN hash and
 * lockout counters (and any future column) never leave the server.
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

/** Bounds on the inactivity nudge threshold, in days. */
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
 * Validates a patch into Prisma data, or returns the first error. Absent keys
 * are left alone; `null` is rejected as a likely client bug.
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
    // Upsert so an account with no row still gets defaults
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

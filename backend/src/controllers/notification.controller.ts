import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { getPreferences, updatePreferences } from '../services/notification-preference.service'
import { registerEngagement } from '../services/notification-engagement.service'
import { log } from '../lib/logger'

// GET /api/notifications/preferences
export const getNotificationPreferences = async (req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await getPreferences(req.userId!) })
  } catch (error) {
    log.error('getNotificationPreferences failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// PUT /api/notifications/preferences
export const putNotificationPreferences = async (req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await updatePreferences(req.userId!, req.body ?? {}) })
  } catch (error) {
    log.error('putNotificationPreferences failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/notifications/history
// What was sent, and what actually reached the phone
export const getNotificationHistory = async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25))

    // Ordered by createdAt, not sentAt. Failed rows never get a sentAt, and
    // Postgres sorts NULLS FIRST on DESC — so ordering by sentAt floats every
    // failure to the top, and a user with a stale subscription would see
    // nothing but failures once they filled the page.
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId!, status: { not: 'planned' } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    res.json({
      success: true,
      data: notifications.map(n => ({
        id: n.id,
        type: n.type,
        tier: n.tier,
        source: n.source,
        title: n.title,
        body: n.body,
        status: n.status,
        sentAt: n.sentAt,
        // Separate from sentAt on purpose: sent means the push service took it,
        // displayed means the phone actually rendered it.
        displayedAt: n.displayedAt,
        clickedAt: n.clickedAt,
        failReason: n.failReason,
      }))
    })
  } catch (error) {
    log.error('getNotificationHistory failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// Sliding-window throttle for the unauthenticated ack endpoint, keyed by IP.
// In-process and therefore per-instance, which is fine: this exists to blunt
// casual flooding, not to be an authorisation boundary.
const ACK_LIMIT_PER_MIN = 60
const ackCalls = new Map<string, number[]>()

const withinAckRate = (key: string): boolean => {
  const now = Date.now()
  const windowStart = now - 60_000
  const calls = (ackCalls.get(key) ?? []).filter(t => t > windowStart)

  if (calls.length >= ACK_LIMIT_PER_MIN) return false

  calls.push(now)
  ackCalls.set(key, calls)

  if (ackCalls.size > 5000) {
    for (const [k, times] of ackCalls) {
      if (times.every(t => t <= windowStart)) ackCalls.delete(k)
    }
  }
  return true
}

// POST /api/push/ack
//
// The delivery receipt, reported by the service worker. Unauthenticated because
// the worker runs with no page and therefore no token; authorised instead by
// the notification id, a UUID that only ever existed inside that one push
// payload. It can only ever move one row forward in its lifecycle.
export const ackNotification = async (req: Request, res: Response) => {
  try {
    const { nid, event } = req.body

    if (!nid || !['displayed', 'clicked', 'dismissed'].includes(event)) {
      res.status(400).json({ success: false, error: 'Invalid ack payload' })
      return
    }

    // Unauthenticated by necessity — the service worker has no token. Guessing a
    // UUID is infeasible, but each call still costs a lookup plus a write, so a
    // flood of random ids would be free database load for the caller. A real
    // device acks a handful of times a day; anything past this is not a device.
    if (!withinAckRate(req.ip ?? 'unknown')) {
      res.status(429).json({ success: false, error: 'Too many acknowledgements' })
      return
    }

    const existing = await prisma.notification.findUnique({ where: { id: nid } })
    if (!existing) {
      // A pruned or unknown id. Not an error worth surfacing to a worker that
      // cannot do anything about it.
      res.json({ success: true })
      return
    }

    const now = new Date()

    // Timestamps always record — they are independent facts. `status` only ever
    // advances: the two acks race (a display ack issued on showNotification can
    // land after the click ack from a user who tapped immediately), and writing
    // it unconditionally would leave a row reading `displayed` with a non-null
    // clickedAt.
    const RANK: Record<string, number> = {
      planned: 0, failed: 0, sent: 1, displayed: 2, dismissed: 3, clicked: 4
    }
    const nextStatus = event === 'clicked' ? 'clicked'
      : event === 'dismissed' ? 'dismissed'
      : 'displayed'

    // A click implies it was displayed, but the display ack can be lost (the
    // phone may have been offline when it rendered) — so backfill it rather
    // than leaving a clicked notification that was apparently never shown.
    await prisma.notification.update({
      where: { id: nid },
      data: {
        displayedAt: existing.displayedAt ?? now,
        ...(event === 'clicked' && { clickedAt: existing.clickedAt ?? now }),
        ...(event === 'dismissed' && { dismissedAt: existing.dismissedAt ?? now }),
        ...((RANK[nextStatus] ?? 0) > (RANK[existing.status] ?? 0) && { status: nextStatus }),
      }
    })

    // A tap is the clearest signal there is that these are wanted
    if (event === 'clicked') await registerEngagement(existing.userId)

    res.json({ success: true })
  } catch (error) {
    log.error('ackNotification failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

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

// GET /api/notifications/history — what was sent and what reached the phone
export const getNotificationHistory = async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25))

    // By createdAt: failed rows have no sentAt, and NULLs would sort first
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
        // sent = accepted by the push service; displayed = rendered on the phone
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

// Per-instance sliding-window throttle for the unauthenticated ack endpoint.
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

// POST /api/push/ack — delivery receipt from the service worker. Unauthenticated
// (the worker has no token); authorised by the notification's UUID.
export const ackNotification = async (req: Request, res: Response) => {
  try {
    const { nid, event } = req.body

    if (!nid || !['displayed', 'clicked', 'dismissed'].includes(event)) {
      res.status(400).json({ success: false, error: 'Invalid ack payload' })
      return
    }

    // Rate-limited: guessing a UUID is infeasible, but a flood still costs writes
    if (!withinAckRate(req.ip ?? 'unknown')) {
      res.status(429).json({ success: false, error: 'Too many acknowledgements' })
      return
    }

    const existing = await prisma.notification.findUnique({ where: { id: nid } })
    if (!existing) {
      // Unknown or pruned id — nothing for the worker to act on
      res.json({ success: true })
      return
    }

    const now = new Date()

    // Timestamps always record; `status` only advances, since acks can race
    const RANK: Record<string, number> = {
      planned: 0, failed: 0, sent: 1, displayed: 2, dismissed: 3, clicked: 4
    }
    const nextStatus = event === 'clicked' ? 'clicked'
      : event === 'dismissed' ? 'dismissed'
      : 'displayed'

    // A click implies display; backfill it in case the display ack was lost
    await prisma.notification.update({
      where: { id: nid },
      data: {
        displayedAt: existing.displayedAt ?? now,
        ...(event === 'clicked' && { clickedAt: existing.clickedAt ?? now }),
        ...(event === 'dismissed' && { dismissedAt: existing.dismissedAt ?? now }),
        ...((RANK[nextStatus] ?? 0) > (RANK[existing.status] ?? 0) && { status: nextStatus }),
      }
    })

    // A tap resets the ignored streak
    if (event === 'clicked') await registerEngagement(existing.userId)

    res.json({ success: true })
  } catch (error) {
    log.error('ackNotification failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

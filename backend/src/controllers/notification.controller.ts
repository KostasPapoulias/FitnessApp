import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { getPreferences, updatePreferences } from '../services/notification-preference.service'

// GET /api/notifications/preferences
export const getNotificationPreferences = async (req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await getPreferences(req.userId!) })
  } catch (error) {
    console.error('getNotificationPreferences error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// PUT /api/notifications/preferences
export const putNotificationPreferences = async (req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await updatePreferences(req.userId!, req.body ?? {}) })
  } catch (error) {
    console.error('putNotificationPreferences error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/notifications/history
// What was sent, and what actually reached the phone
export const getNotificationHistory = async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25))

    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId!, status: { not: 'planned' } },
      orderBy: { sentAt: 'desc' },
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
    console.error('getNotificationHistory error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
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

    const existing = await prisma.notification.findUnique({ where: { id: nid } })
    if (!existing) {
      // A pruned or unknown id. Not an error worth surfacing to a worker that
      // cannot do anything about it.
      res.json({ success: true })
      return
    }

    const now = new Date()
    // A click implies it was displayed, but the display ack can be lost (the
    // phone may have been offline when it rendered) — so backfill it rather
    // than leaving a clicked notification that was apparently never shown.
    const data =
      event === 'displayed' ? { displayedAt: existing.displayedAt ?? now, status: 'displayed' } :
      event === 'clicked'   ? { clickedAt: now, displayedAt: existing.displayedAt ?? now, status: 'clicked' } :
                              { dismissedAt: now, displayedAt: existing.displayedAt ?? now, status: 'dismissed' }

    await prisma.notification.update({ where: { id: nid }, data })

    res.json({ success: true })
  } catch (error) {
    console.error('ackNotification error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

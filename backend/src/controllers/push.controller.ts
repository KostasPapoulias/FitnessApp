import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { isPushConfigured } from '../lib/webpush'
import { sendNotification } from '../services/notification-sender.service'
import { log } from '../lib/logger'

// GET /api/push/public-key — public so the service worker can re-subscribe without a token
export const getPublicKey = async (_req: Request, res: Response) => {
  if (!isPushConfigured) {
    res.status(503).json({ success: false, error: 'Push notifications are not configured on the server' })
    return
  }
  res.json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY })
}

// POST /api/push/subscribe
export const subscribe = async (req: AuthRequest, res: Response) => {
  const { endpoint, keys } = req.body

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ success: false, error: 'Invalid subscription payload' })
    return
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: req.userId!, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId: req.userId!, endpoint, p256dh: keys.p256dh, auth: keys.auth }
  })

  res.json({ success: true })
}

// POST /api/push/unsubscribe
export const unsubscribe = async (req: AuthRequest, res: Response) => {
  const { endpoint } = req.body

  if (!endpoint) {
    res.status(400).json({ success: false, error: 'endpoint is required' })
    return
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: req.userId! }
  })

  res.json({ success: true })
}

// POST /api/push/rotate — unauthenticated; the service worker re-subscribes
// after iOS rotates a subscription. The owner is identified by the old
// endpoint, and only existing rows can be moved.
export const rotateSubscription = async (req: Request, res: Response) => {
  // Express 4 does not catch async rejections
  try {
    const { oldEndpoint, endpoint, keys } = req.body

    if (!oldEndpoint || !endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ success: false, error: 'Invalid rotation payload' })
      return
    }

    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: oldEndpoint } })
    if (!existing) {
      res.status(404).json({ success: false, error: 'Unknown subscription' })
      return
    }

    // iOS can report a "change" to the same endpoint; skip the cleanup then, or
    // it would delete the row being rotated
    if (endpoint !== oldEndpoint) {
      // Clear a leftover row from a half-finished earlier rotation
      await prisma.pushSubscription.deleteMany({
        where: { endpoint, id: { not: existing.id } }
      })
    }

    await prisma.pushSubscription.update({
      where: { id: existing.id },
      data: { endpoint, p256dh: keys.p256dh, auth: keys.auth }
    })

    res.json({ success: true })

  } catch (error) {
    log.error('rotateSubscription failed', error)
    res.status(500).json({ success: false, error: 'Could not rotate the subscription.' })
  }
}

// POST /api/push/test — a real push to the caller's own devices
export const sendTestPush = async (req: AuthRequest, res: Response) => {
  if (!isPushConfigured) {
    res.status(503).json({ success: false, error: 'Push notifications are not configured on the server' })
    return
  }

  // Express 4 does not catch async rejections
  try {
    // Through the ledger, so the delivery receipt is exercised too
    const result = await sendNotification({
      userId: req.userId!,
      type: 'test',
      title: '🔔 SomaTrack test',
      body: 'Push delivery works. Lock the phone and close the app — the next one should still arrive.',
      // The tap is the consent
      bypassPreferences: true,
    })

    if (result.status !== 'sent') {
      res.status(404).json({
        success: false,
        error: result.status === 'failed'
          ? 'No device accepted the push. Toggle Push Notifications off and back on.'
          : 'No push subscriptions registered for this account. Turn on Push Notifications first.'
      })
      return
    }

    res.json({
      success: true,
      data: { sent: result.devices, notificationId: result.notificationId }
    })

  } catch (error) {
    log.error('sendTestPush failed', error)
    res.status(500).json({ success: false, error: 'Could not send the test push.' })
  }
}

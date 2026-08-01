import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { isPushConfigured } from '../lib/webpush'
import { sendPushToUser } from '../lib/pushSender'

// GET /api/push/public-key
// Unauthenticated on purpose: a VAPID public key is public by definition, and
// the service worker has to fetch it to re-subscribe after iOS rotates a
// subscription — at which point no page is running to supply a token.
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

// POST /api/push/rotate
//
// iOS replaces a push subscription periodically (after OS updates, long idle
// spells, reinstalls). The service worker gets `pushsubscriptionchange` and
// re-subscribes, but it runs with no page and therefore no auth token — so this
// route is unauthenticated and identifies the owner by the OLD endpoint, which
// is a high-entropy URL only that device ever held.
//
// It only ever moves an existing row: an unknown endpoint gets a 404, so this
// cannot be used to register a subscription against someone else's account.
export const rotateSubscription = async (req: Request, res: Response) => {
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

  // The new endpoint can already be on file if a previous rotation half-landed
  await prisma.pushSubscription.deleteMany({ where: { endpoint } })
  await prisma.pushSubscription.update({
    where: { id: existing.id },
    data: { endpoint, p256dh: keys.p256dh, auth: keys.auth }
  })

  res.json({ success: true })
}

// POST /api/push/test
// Sends a real push, through the push service, to the caller's own devices.
// This is the only way to verify the path that actually matters — app closed,
// screen locked — since an in-page notification proves nothing about delivery
// when nothing of the app is running.
export const sendTestPush = async (req: AuthRequest, res: Response) => {
  if (!isPushConfigured) {
    res.status(503).json({ success: false, error: 'Push notifications are not configured on the server' })
    return
  }

  const result = await sendPushToUser(req.userId!, {
    title: '🔔 SomaTrack test',
    body: 'Push delivery works. Lock the phone and close the app — the next one should still arrive.',
    // Its own tag, so a test never silently replaces (or is replaced by) the
    // debug reminder firing every minute alongside it.
    tag: 'somatrack-test',
    url: '/'
  })

  if (result.sent === 0) {
    res.status(404).json({
      success: false,
      error: result.removed > 0
        ? 'This device’s subscription had expired and was removed. Toggle Push Notifications off and back on.'
        : 'No push subscriptions registered for this account. Turn on Push Notifications first.'
    })
    return
  }

  res.json({ success: true, data: result })
}

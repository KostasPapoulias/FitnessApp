import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'
import { isPushConfigured } from '../lib/webpush'
import { sendNotification } from '../services/notification-sender.service'

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
  // Express 4 does not catch rejected promises from a handler: a throw in here
  // leaves the request hanging AND can leave the account with no subscription
  // at all, which is silent — nothing sends, and the UI still reads "On".
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

    // iOS can report a "change" whose new endpoint is the one already on file.
    // Clearing the duplicate first would then delete the very row being rotated
    // and leave the update with nothing to write — the device drops off the
    // account with no trace, since no send was involved to record a failure.
    if (endpoint !== oldEndpoint) {
      // The new endpoint can already be on file if a previous rotation half-landed
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
    console.error('rotateSubscription error:', error)
    res.status(500).json({ success: false, error: 'Could not rotate the subscription.' })
  }
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

  // Express 4 does not catch rejected promises from handlers: without this the
  // request hangs until the client times out, leaving the button on "Sending…"
  try {
    // Goes through the ledger like any other notification, so the test also
    // exercises the delivery-receipt path — the point is to learn whether the
    // phone rendered it, not merely whether Apple accepted it.
    const result = await sendNotification({
      userId: req.userId!,
      type: 'test',
      title: '🔔 SomaTrack test',
      body: 'Push delivery works. Lock the phone and close the app — the next one should still arrive.',
      // The tap is the consent; a test that silently no-ops teaches nothing
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
    console.error('sendTestPush error:', error)
    res.status(500).json({ success: false, error: 'Could not send the test push.' })
  }
}

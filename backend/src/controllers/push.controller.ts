import { Response } from 'express'
import prisma from '../lib/prisma'
import { AuthRequest } from '../server'

// GET /api/push/public-key
export const getPublicKey = async (_req: AuthRequest, res: Response) => {
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

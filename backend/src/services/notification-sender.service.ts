import prisma from '../lib/prisma'
import { sendToSubscriptions } from '../lib/pushSender'
import { isTypeAllowed, tierOf } from './notification-preference.service'

/**
 * The single path every notification takes: one ledger row per notification,
 * which the daily cap, dedupe, ghost detection and engagement tracking rely on.
 */

export interface SendRequest {
  userId: string
  type: string
  title: string
  body: string
  source?: 'rule' | 'ai'
  /** Same key as an earlier notification ⇒ skipped. */
  dedupeKey?: string
  url?: string
  /** User-initiated sends (the Test button) skip the opt-in checks. */
  bypassPreferences?: boolean
}

export type SendOutcome =
  | { status: 'sent'; notificationId: string; devices: number }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string }

/** Consecutive unacknowledged sends before a subscription is treated as dead. */
const GHOST_SUSPECT_THRESHOLD = 3
const GHOST_DELETE_THRESHOLD = 5

export const sendNotification = async (req: SendRequest): Promise<SendOutcome> => {
  const { userId, type, title, body } = req

  if (!req.bypassPreferences) {
    const allowed = await isTypeAllowed(userId, type)
    if (!allowed) return { status: 'skipped', reason: 'not enabled' }
  }

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } })
  if (subscriptions.length === 0) {
    return { status: 'skipped', reason: 'no devices subscribed' }
  }

  // Created before sending so its id can come back as the delivery receipt
  let notification
  try {
    notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        tier: tierOf(type),
        source: req.source ?? 'rule',
        dedupeKey: req.dedupeKey ?? null,
        status: 'planned',
      }
    })
  } catch (error: any) {
    // Unique violation on (userId, dedupeKey): already sent
    if (error.code === 'P2002') return { status: 'skipped', reason: 'duplicate' }
    throw error
  }

  const result = await sendToSubscriptions(subscriptions, {
    title,
    body,
    tag: `somatrack-${type}`,
    url: req.url ?? '/',
    nid: notification.id,
  })

  if (result.sent === 0) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'failed',
        failReason: result.removed > 0 ? 'subscription expired' : 'push service rejected',
        // Release the dedupe key so a later retry is not blocked forever
        dedupeKey: null,
      }
    })
    return { status: 'failed', reason: 'no device accepted the push' }
  }

  // Only advance from `planned` — a display ack can arrive before this resolves
  await prisma.notification.updateMany({
    where: { id: notification.id, status: 'planned' },
    data: { status: 'sent', sentAt: new Date() }
  })
  // sentAt is set whichever status won
  await prisma.notification.updateMany({
    where: { id: notification.id, sentAt: null },
    data: { sentAt: new Date() }
  })

  return { status: 'sent', notificationId: notification.id, devices: result.sent }
}

/**
 * Removes subscriptions that accept pushes but never confirm displaying them
 * (e.g. a deleted home-screen icon). Conservative, since an offline phone looks
 * the same for a while.
 */
export const pruneGhostSubscriptions = async (userId: string) => {
  const recent = await prisma.notification.findMany({
    where: { userId, status: { in: ['sent', 'displayed', 'clicked', 'dismissed'] } },
    orderBy: { sentAt: 'desc' },
    take: GHOST_DELETE_THRESHOLD,
  })

  if (recent.length < GHOST_SUSPECT_THRESHOLD) return { pruned: false, streak: 0 }

  // Consecutive never-displayed sends, newest first
  let streak = 0
  for (const notification of recent) {
    if (notification.displayedAt) break
    streak++
  }

  if (streak >= GHOST_DELETE_THRESHOLD) {
    await prisma.pushSubscription.deleteMany({ where: { userId } })
    // Turn the master switch off so the UI stops claiming push is on
    await prisma.notificationPreference.updateMany({
      where: { userId },
      data: { pushEnabled: false }
    })
    return { pruned: true, streak }
  }

  return { pruned: false, streak }
}

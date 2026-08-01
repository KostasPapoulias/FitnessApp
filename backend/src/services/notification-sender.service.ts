import prisma from '../lib/prisma'
import { sendToSubscriptions } from '../lib/pushSender'
import { isTypeAllowed, tierOf } from './notification-preference.service'

/**
 * The single path every notification takes.
 *
 * Nothing calls the push layer directly. Everything goes through here so that
 * one row exists per notification — which is what makes the daily cap, dedupe,
 * ghost detection and engagement tracking possible at all.
 */

export interface SendRequest {
  userId: string
  type: string
  title: string
  body: string
  source?: 'rule' | 'ai'
  /** Blocks repeats. Same key ⇒ the notification is silently skipped. */
  dedupeKey?: string
  url?: string
  /** User-initiated sends (the Test button) skip the opt-in checks — the tap
   *  IS the consent, and a test that silently no-ops teaches nothing. */
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

  // The row is created BEFORE sending, so its id can travel in the payload and
  // come back as the delivery receipt.
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
    // Unique violation on (userId, dedupeKey) — this nudge already went out
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
      }
    })
    return { status: 'failed', reason: 'no device accepted the push' }
  }

  await prisma.notification.update({
    where: { id: notification.id },
    data: { status: 'sent', sentAt: new Date() }
  })

  return { status: 'sent', notificationId: notification.id, devices: result.sent }
}

/**
 * Prune subscriptions that accept pushes but never confirm displaying them.
 *
 * A push service returning 201 only means it took the payload. A home screen
 * icon deleted without unsubscribing, or a worker that can no longer run, keeps
 * accepting sends forever — a ghost. The service worker's display acks are the
 * only way to tell the difference, so a run of sends with no ack is the signal.
 *
 * Deliberately conservative: acks need network at display time, so an offline
 * phone looks identical to a ghost for a while.
 */
export const pruneGhostSubscriptions = async (userId: string) => {
  const recent = await prisma.notification.findMany({
    where: { userId, status: { in: ['sent', 'displayed', 'clicked', 'dismissed'] } },
    orderBy: { sentAt: 'desc' },
    take: GHOST_DELETE_THRESHOLD,
  })

  if (recent.length < GHOST_SUSPECT_THRESHOLD) return { pruned: false, streak: 0 }

  // Count the unbroken run of never-displayed sends from the most recent back
  let streak = 0
  for (const notification of recent) {
    if (notification.displayedAt) break
    streak++
  }

  if (streak >= GHOST_DELETE_THRESHOLD) {
    await prisma.pushSubscription.deleteMany({ where: { userId } })
    // Flip the master switch off too, so the UI stops claiming notifications
    // are on for a device that has not rendered one in five attempts.
    await prisma.notificationPreference.updateMany({
      where: { userId },
      data: { pushEnabled: false }
    })
    return { pruned: true, streak }
  }

  return { pruned: false, streak }
}

import prisma from './prisma'
import webpush, { isPushConfigured } from './webpush'
import { log } from './logger'

export interface PushPayload {
  title: string
  body: string
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag?: string
  /** Path opened when the notification is tapped */
  url?: string
  /** Notification id, posted back by the service worker as a delivery receipt. */
  nid?: string
}

export interface PushResult {
  sent: number
  failed: number
  /** Revoked subscriptions, deleted here */
  removed: number
}

type StoredSubscription = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Deliver one payload to a set of stored subscriptions. iOS revokes push
 * permission if a push shows nothing, so every payload must be displayable.
 */
export const sendToSubscriptions = async (
  subscriptions: StoredSubscription[],
  payload: PushPayload,
  // Short TTL: a late reminder is noise, so the push service drops it instead
  { ttlSeconds = 300 }: { ttlSeconds?: number } = {}
): Promise<PushResult> => {
  if (!isPushConfigured || subscriptions.length === 0) {
    return { sent: 0, failed: 0, removed: 0 }
  }

  const body = JSON.stringify(payload)
  const result: PushResult = { sent: 0, failed: 0, removed: 0 }

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: ttlSeconds, urgency: 'high' }
        )
        result.sent++

      } catch (error: any) {
        // 404/410: the subscription is gone for good. Anything else may be retried.
        if (error.statusCode === 404 || error.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
          result.removed++
        } else {
          result.failed++
          log.error('Push send failed', error, { statusCode: error.statusCode ?? null })
        }
      }
    })
  )

  return result
}

/** Send to every device this user has subscribed. */
export const sendPushToUser = async (
  userId: string,
  payload: PushPayload,
  options?: { ttlSeconds?: number }
): Promise<PushResult> => {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } })
  return sendToSubscriptions(subscriptions, payload, options)
}

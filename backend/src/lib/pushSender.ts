import prisma from './prisma'
import webpush, { isPushConfigured } from './webpush'
import { log } from './logger'

export interface PushPayload {
  title: string
  body: string
  /**
   * Notifications sharing a tag REPLACE each other rather than stacking. A
   * once-a-minute reminder with no tag buries Notification Center in an hour.
   */
  tag?: string
  /** Path opened when the notification is tapped */
  url?: string
  /**
   * Notification ledger id. The service worker posts it back on display and on
   * tap, which is the only delivery receipt web push offers — the push service
   * accepting a payload says nothing about whether a phone ever showed it.
   */
  nid?: string
}

export interface PushResult {
  sent: number
  failed: number
  /** Subscriptions the browser/OS has revoked, deleted here */
  removed: number
}

type StoredSubscription = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Deliver one payload to a set of stored subscriptions.
 *
 * iOS revokes push permission outright if a push is delivered and the service
 * worker shows nothing, so every payload sent from here must be one the worker
 * will actually display.
 */
export const sendToSubscriptions = async (
  subscriptions: StoredSubscription[],
  payload: PushPayload,
  // Short by default: a reminder that arrives an hour late is noise, not a
  // reminder. APNs drops it instead of queueing once the TTL passes.
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
        // 404/410 mean the subscription is gone for good — the browser rotated
        // it, or the user removed the home screen icon. Anything else (network,
        // 5xx from the push service) is worth retrying on the next cycle.
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

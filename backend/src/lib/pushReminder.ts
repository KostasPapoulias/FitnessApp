import prisma from './prisma'
import webpush, { isPushConfigured } from './webpush'

const REMINDER_INTERVAL_MS = 60_000

export const startPushReminder = () => {
  if (!isPushConfigured) return

  setInterval(async () => {
    const subscriptions = await prisma.pushSubscription.findMany()
    if (subscriptions.length === 0) return

    const payload = JSON.stringify({
      title: '💪 SomaTrack',
      body: 'Test reminder — still here?'
    })

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
        } catch (error: any) {
          // Subscription expired or was revoked by the browser/OS — clean it up
          if (error.statusCode === 404 || error.statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } })
          } else {
            console.error('Push send failed:', error.message)
          }
        }
      })
    )
  }, REMINDER_INTERVAL_MS)
}

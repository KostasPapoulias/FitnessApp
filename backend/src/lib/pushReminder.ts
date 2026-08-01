import prisma from './prisma'
import { isPushConfigured } from './webpush'
import { sendToSubscriptions } from './pushSender'

// Delivery-proving debug loop, OFF unless explicitly switched on. It fires a
// ping on a fixed interval regardless of what the athlete is doing, which is
// useful for exactly one thing: confirming a locked phone still receives push.
// Real reminders are trigger-driven and live elsewhere.
//
//   PUSH_REMINDER_ENABLED=true    turn the debug loop back on
//   PUSH_REMINDER_INTERVAL_MS     cadence, default 60s
const DEFAULT_INTERVAL_MS = 60_000
const MIN_INTERVAL_MS = 10_000

const intervalMs = Math.max(
  MIN_INTERVAL_MS,
  Number(process.env.PUSH_REMINDER_INTERVAL_MS) || DEFAULT_INTERVAL_MS
)
const enabled = process.env.PUSH_REMINDER_ENABLED === 'true'

export const startPushReminder = () => {
  if (!isPushConfigured) return
  if (!enabled) return

  console.log(`🔔 DEBUG push loop active — every ${Math.round(intervalMs / 1000)}s`)

  setInterval(async () => {
    try {
      const subscriptions = await prisma.pushSubscription.findMany()
      if (subscriptions.length === 0) return

      // Grouped per user so the payload can be addressed to a person rather
      // than blasted identically at every subscription in the database.
      const byUser = new Map<string, typeof subscriptions>()
      for (const sub of subscriptions) {
        const list = byUser.get(sub.userId)
        if (list) list.push(sub)
        else byUser.set(sub.userId, [sub])
      }

      const stamp = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit'
      })

      let sent = 0
      let removed = 0

      for (const [, userSubs] of byUser) {
        const result = await sendToSubscriptions(userSubs, {
          title: '💪 SomaTrack',
          body: `Debug ping ${stamp} — delivery is working.`,
          // Shared tag: each ping REPLACES the previous one, so an hour of
          // debugging leaves one notification rather than sixty.
          tag: 'somatrack-reminder',
          url: '/'
        })
        sent += result.sent
        removed += result.removed
      }

      if (removed > 0) {
        console.log(`🔔 reminder: ${sent} sent, ${removed} dead subscription(s) pruned`)
      }

    } catch (error: any) {
      // A throw here would kill the interval permanently and silently
      console.error('Push reminder cycle failed:', error.message)
    }
  }, intervalMs)
}

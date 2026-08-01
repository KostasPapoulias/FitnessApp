import prisma from './prisma'
import { isPushConfigured } from './webpush'
import { sendToSubscriptions } from './pushSender'

// Debug cadence. One a minute is deliberately obnoxious — it is here to prove
// delivery while the phone is locked and the app is closed, not to be shipped.
// Override with PUSH_REMINDER_INTERVAL_MS, or switch the whole loop off with
// PUSH_REMINDER_ENABLED=false, without touching code.
const DEFAULT_INTERVAL_MS = 60_000
const MIN_INTERVAL_MS = 10_000

const intervalMs = Math.max(
  MIN_INTERVAL_MS,
  Number(process.env.PUSH_REMINDER_INTERVAL_MS) || DEFAULT_INTERVAL_MS
)
const enabled = process.env.PUSH_REMINDER_ENABLED !== 'false'

export const startPushReminder = () => {
  if (!isPushConfigured) return
  if (!enabled) {
    console.log('🔕 Push reminder loop disabled (PUSH_REMINDER_ENABLED=false)')
    return
  }

  console.log(`🔔 Push reminder loop every ${Math.round(intervalMs / 1000)}s`)

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

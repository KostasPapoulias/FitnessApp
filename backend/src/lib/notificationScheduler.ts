import prisma from './prisma'
import { isPushConfigured } from './webpush'
import { evaluateEssentialRules } from '../services/notification-rules.service'
import { sendNotification, pruneGhostSubscriptions } from '../services/notification-sender.service'
import { checkSendWindow, localHour, sentWithin } from '../services/notification-window.service'
import { applyEngagementBackoff } from '../services/notification-engagement.service'
import { planCoachNotifications } from '../services/notification-planner.service'

/**
 * The tick that actually sends things.
 *
 * Deliberately dumb: it evaluates rules, applies the gates, and sends at most
 * ONE notification per user per tick. All the judgement lives in the rules and
 * the AI planner — this only decides whether now is an acceptable moment, which
 * is the part that must be reproducible.
 *
 * Runs in-process on an interval. That is honest about what it is: a single
 * Railway instance. Two instances would double-send, and a restart loses the
 * schedule until the next tick — both acceptable at this size, neither
 * acceptable once there are real users, at which point this moves to a cron
 * with a locked job table.
 */

const TICK_MS = Number(process.env.NOTIFICATION_TICK_MS) || 5 * 60 * 1000
const enabled = process.env.NOTIFICATION_SCHEDULER_ENABLED !== 'false'

/** Per-type minimum spacing, in hours, on top of the global gates. */
const TYPE_COOLDOWN_HOURS: Record<string, number> = {
  readiness_ready: 20,
  overreaching: 72,
  inactivity: 48,
  coach_nudge: 4,
}

/** Local hour at which the day's coach plan is generated. */
const PLAN_HOUR = 6

const runTickForUser = async (userId: string, timezone: string) => {
  // Engagement first: a user whose coach tier should be suspended must not be
  // sent one more nudge before the suspension lands.
  await applyEngagementBackoff(userId)

  // Plan the day once the local morning arrives. planCoachNotifications is
  // idempotent per local day and never throws, so calling it on every tick
  // after PLAN_HOUR costs one indexed count query.
  if (localHour(new Date(), timezone) >= PLAN_HOUR) {
    await planCoachNotifications(userId)
  }

  // Anything the planner scheduled and that is now due
  const due = await prisma.notification.findMany({
    where: {
      userId,
      status: 'planned',
      plannedFor: { lte: new Date() },
    },
    orderBy: { plannedFor: 'asc' },
    take: 1,
  })

  const candidates = await evaluateEssentialRules(userId, timezone)

  // Essential rules outrank planned coach nudges: a warning to back off matters
  // more than whatever the planner thought would be nice at 17:15.
  const chosen = candidates[0]
  if (!chosen && due.length === 0) return

  if (chosen) {
    if (await sentWithin(userId, chosen.type, TYPE_COOLDOWN_HOURS[chosen.type] ?? 24)) return

    const window = await checkSendWindow(userId, { urgent: chosen.urgent })
    if (!window.ok) return

    await sendNotification({
      userId,
      type: chosen.type,
      title: chosen.title,
      body: chosen.body,
      dedupeKey: chosen.dedupeKey,
      url: chosen.url,
      source: 'rule',
    })
    return
  }

  // Planned coach nudge
  const planned = due[0]
  const window = await checkSendWindow(userId)
  if (!window.ok) {
    // A nudge whose moment has passed is worse than no nudge — "train at 17:15"
    // arriving at 22:00 is noise. Drop it rather than queueing it forever.
    const hoursLate = (Date.now() - (planned.plannedFor?.getTime() ?? 0)) / 3_600_000
    if (hoursLate > 3) {
      await prisma.notification.update({
        where: { id: planned.id },
        data: { status: 'failed', failReason: `missed window: ${window.reason}`, dedupeKey: null },
      })
    }
    return
  }

  if (await sentWithin(userId, planned.type, TYPE_COOLDOWN_HOURS[planned.type] ?? 4)) return

  // The planner wrote the row; sending it means handing the same content to the
  // one code path that owns delivery, so the ledger stays consistent.
  await prisma.notification.delete({ where: { id: planned.id } })
  await sendNotification({
    userId,
    type: planned.type,
    title: planned.title,
    body: planned.body,
    dedupeKey: planned.dedupeKey ?? undefined,
    // Opens the chat with this nudge as the opening question, so tapping
    // continues the conversation rather than dumping the user on a blank screen
    // wondering what the notification was about.
    url: `/ai/chat/new?ask=${encodeURIComponent(planned.body)}`,
    source: 'ai',
  })
}

export const startNotificationScheduler = () => {
  if (!isPushConfigured) return
  if (!enabled) {
    console.log('🔕 Notification scheduler disabled (NOTIFICATION_SCHEDULER_ENABLED=false)')
    return
  }

  console.log(`🔔 Notification scheduler every ${Math.round(TICK_MS / 1000)}s`)

  setInterval(async () => {
    try {
      // Only users who have opted in. Absent rows are absent consent.
      const optedIn = await prisma.notificationPreference.findMany({
        where: { pushEnabled: true },
        select: { userId: true, timezone: true },
      })

      for (const pref of optedIn) {
        // One user's failure must not stop the tick for everyone else
        try {
          await runTickForUser(pref.userId, pref.timezone)
          await pruneGhostSubscriptions(pref.userId)
        } catch (error: any) {
          console.error(`notification tick failed for ${pref.userId}:`, error.message)
        }
      }
    } catch (error: any) {
      // A throw escaping here would kill the interval permanently and silently
      console.error('Notification scheduler cycle failed:', error.message)
    }
  }, TICK_MS)
}

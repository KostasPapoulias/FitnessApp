import prisma from './prisma'
import { isPushConfigured } from './webpush'
import { evaluateEssentialRules } from '../services/notification-rules.service'
import { sendNotification, pruneGhostSubscriptions } from '../services/notification-sender.service'
import { checkSendWindow, localHour, sentWithin } from '../services/notification-window.service'
import { applyEngagementBackoff } from '../services/notification-engagement.service'
import { planCoachNotifications } from '../services/notification-planner.service'
import { log } from './logger'

/**
 * The notification tick: evaluates rules and planned nudges, applies the send
 * gates, and sends at most one notification per user per tick. In-process on
 * an interval, so it assumes a single server instance.
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

/** A planned nudge this late is dropped rather than sent out of context. */
const MAX_LATENESS_HOURS = 3

const expireIfStale = async (
  planned: { id: string; plannedFor: Date | null },
  reason: string
): Promise<boolean> => {
  const hoursLate = (Date.now() - (planned.plannedFor?.getTime() ?? 0)) / 3_600_000
  if (hoursLate <= MAX_LATENESS_HOURS) return false

  await prisma.notification.update({
    where: { id: planned.id },
    // Release the dedupe key so the nudge can be planned again another day
    data: { status: 'failed', failReason: `missed window: ${reason}`, dedupeKey: null },
  })
  return true
}

const runTickForUser = async (userId: string, timezone: string) => {
  // Engagement first, so a due suspension lands before another nudge goes out
  await applyEngagementBackoff(userId)

  // Plan the day's coach nudges once local morning arrives (idempotent per day)
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
  const planned = due[0] ?? null

  const candidates = await evaluateEssentialRules(userId, timezone)

  // Essential rules go before planned coach nudges. A rule in cooldown is
  // skipped, not a reason to stop — otherwise nudges would never be reached.
  let blockedReason: string | undefined

  for (const candidate of candidates) {
    if (await sentWithin(userId, candidate.type, TYPE_COOLDOWN_HOURS[candidate.type] ?? 24)) {
      continue
    }

    const window = await checkSendWindow(userId, { urgent: candidate.urgent })
    if (!window.ok) {
      // Keep going: a later candidate may be urgent and pass the gates this one failed
      blockedReason = window.reason
      continue
    }

    await sendNotification({
      userId,
      type: candidate.type,
      title: candidate.title,
      body: candidate.body,
      dedupeKey: candidate.dedupeKey,
      url: candidate.url,
      source: 'rule',
    })
    return
  }

  if (!planned) return

  // Nothing essential was eligible, so the coach nudge gets its turn
  if (blockedReason) {
    // The gates that blocked the essential candidates apply to the nudge too
    await expireIfStale(planned, blockedReason)
    return
  }

  const window = await checkSendWindow(userId)
  if (!window.ok) {
    await expireIfStale(planned, window.reason ?? 'unknown')
    return
  }

  if (await sentWithin(userId, planned.type, TYPE_COOLDOWN_HOURS[planned.type] ?? 4)) {
    await expireIfStale(planned, `cooldown on ${planned.type}`)
    return
  }

  // Re-sent through the single delivery path so the ledger stays consistent
  await prisma.notification.delete({ where: { id: planned.id } })
  await sendNotification({
    userId,
    type: planned.type,
    title: planned.title,
    body: planned.body,
    dedupeKey: planned.dedupeKey ?? undefined,
    // Tapping opens the coach chat with this nudge as the first question
    url: `/ai/chat/new?ask=${encodeURIComponent(planned.body)}`,
    source: 'ai',
  })
}

export const startNotificationScheduler = () => {
  if (!isPushConfigured) return
  if (!enabled) {
    log.info('Notification scheduler disabled', { reason: 'NOTIFICATION_SCHEDULER_ENABLED=false' })
    return
  }

  log.info('Notification scheduler started', { tickSeconds: Math.round(TICK_MS / 1000) })

  setInterval(async () => {
    try {
      // Only users who opted in
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
          log.error('Notification tick failed', error, { userId: pref.userId })
        }
      }
    } catch (error: any) {
      // Never let a throw escape — it would silently kill the interval
      log.error('Notification scheduler cycle failed', error)
    }
  }, TICK_MS)
}

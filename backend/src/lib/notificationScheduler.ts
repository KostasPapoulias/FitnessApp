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

/**
 * A nudge whose moment has passed is worse than no nudge — "train at 17:15"
 * arriving at 22:00 is noise. Drop it rather than queueing it forever.
 *
 * Checked before anything can block the send rather than only inside the
 * window failure: a planned row that is never reachable is a row that sits in
 * the table for good, and the planner then reads it as "already planned today"
 * every day after.
 */
const MAX_LATENESS_HOURS = 3

const expireIfStale = async (
  planned: { id: string; plannedFor: Date | null },
  reason: string
): Promise<boolean> => {
  const hoursLate = (Date.now() - (planned.plannedFor?.getTime() ?? 0)) / 3_600_000
  if (hoursLate <= MAX_LATENESS_HOURS) return false

  await prisma.notification.update({
    where: { id: planned.id },
    // dedupeKey released so the same nudge can be planned again another day
    data: { status: 'failed', failReason: `missed window: ${reason}`, dedupeKey: null },
  })
  return true
}

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
  const planned = due[0] ?? null

  const candidates = await evaluateEssentialRules(userId, timezone)

  // Essential rules outrank planned coach nudges: a warning to back off matters
  // more than whatever the planner thought would be nice at 17:15.
  //
  // Outranking means "goes first", NOT "blocks the rest of the queue". A rule
  // inside its cooldown is simply not eligible this tick, and treating that as
  // a reason to stop is what silenced the coach tier completely: readiness_ready
  // re-qualifies on every tick of every day the user has not trained, so its
  // 20-hour cooldown returned before a planned nudge was ever looked at.
  let blockedReason: string | undefined

  for (const candidate of candidates) {
    if (await sentWithin(userId, candidate.type, TYPE_COOLDOWN_HOURS[candidate.type] ?? 24)) {
      continue
    }

    const window = await checkSendWindow(userId, { urgent: candidate.urgent })
    if (!window.ok) {
      // Keep going: a later candidate may be urgent, and urgent passes gates
      // (the daily cap and the minimum gap) that this one just failed.
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

  // An essential notification just went out ⇒ we returned above. Reaching here
  // means nothing essential was eligible, so the coach nudge gets its turn.
  if (blockedReason) {
    // Every gate an ordinary candidate failed applies to a nudge too — the
    // window check is strictly more permissive for urgent sends, never less.
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

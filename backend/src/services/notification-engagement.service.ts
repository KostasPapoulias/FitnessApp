import prisma from '../lib/prisma'
import { NOTIFICATION_TYPES } from './notification-preference.service'
import { sendNotification } from './notification-sender.service'

/**
 * Backs off the coach tier when its notifications are ignored, then suspends
 * it. Only notifications confirmed displayed and not clicked count as ignored.
 * The essential tier is never affected.
 */

/** Ignored this many in a row → cut the daily cap right down. */
const BACKOFF_THRESHOLD = 3
/** Ignored this many in a row → stop the coach tier entirely. */
const SUSPEND_THRESHOLD = 6
const BACKOFF_CAP = 1

export const applyEngagementBackoff = async (userId: string) => {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } })
  if (!pref?.coachEnabled || pref.coachSuspendedAt) return

  const shown = await prisma.notification.findMany({
    where: {
      userId,
      tier: 'coach',
      displayedAt: { not: null },
    },
    orderBy: { displayedAt: 'desc' },
    take: SUSPEND_THRESHOLD,
    select: { clickedAt: true },
  })

  // Consecutive displayed-but-unopened, newest first
  let streak = 0
  for (const notification of shown) {
    if (notification.clickedAt) break
    streak++
  }

  if (streak === pref.ignoredStreak) return

  if (streak >= SUSPEND_THRESHOLD) {
    await prisma.notificationPreference.update({
      where: { userId },
      data: { ignoredStreak: streak, coachSuspendedAt: new Date() },
    })

    // One goodbye via the essential tier, deduped so it never repeats
    await sendNotification({
      userId,
      type: NOTIFICATION_TYPES.COACH_SUSPENDED,
      title: 'Pausing the coaching nudges',
      body: 'You haven’t been opening them, so I’ll stop. Recovery and injury warnings stay on. Turn coaching back on any time in Profile.',
      dedupeKey: `${NOTIFICATION_TYPES.COACH_SUSPENDED}:${new Date().toISOString().slice(0, 10)}`,
      url: '/profile',
    })
    return
  }

  await prisma.notificationPreference.update({
    where: { userId },
    data: {
      ignoredStreak: streak,
      // Narrow to one a day rather than stopping outright
      ...(streak >= BACKOFF_THRESHOLD && pref.dailyCap > BACKOFF_CAP
        ? { dailyCap: BACKOFF_CAP }
        : {}),
    },
  })
}

/** A tap clears the ignored streak immediately. */
export const registerEngagement = async (userId: string) => {
  await prisma.notificationPreference.updateMany({
    where: { userId, ignoredStreak: { gt: 0 } },
    data: { ignoredStreak: 0 },
  })
}

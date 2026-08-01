import prisma from '../lib/prisma'
import { NOTIFICATION_TYPES } from './notification-preference.service'
import { sendNotification } from './notification-sender.service'

/**
 * Backs the coach tier off when it is being ignored, and eventually stops it.
 *
 * The single most important rule in here: only a notification confirmed
 * DISPLAYED and not clicked counts as ignored. A push lost to a flat battery,
 * a dead subscription or an offline phone never displayed, and treating that as
 * disinterest would punish people for bad connectivity by silencing their
 * coach.
 *
 * The essential tier is never touched. Someone who stops opening notifications
 * is exactly who still needs to be told they are ramping into an injury.
 */

/** Ignored this many in a row → cut the daily cap right down. */
const BACKOFF_THRESHOLD = 3
/** Ignored this many in a row → stop the coach tier entirely. */
const SUSPEND_THRESHOLD = 6
/** Cap while backed off. */
const BACKOFF_CAP = 1

export const applyEngagementBackoff = async (userId: string) => {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } })
  if (!pref?.coachEnabled || pref.coachSuspendedAt) return

  // Coach notifications only, newest first, and only ones we KNOW were shown.
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

  // Unbroken run of displayed-but-never-opened, counting back from the newest
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

    // One goodbye, through the essential tier so the suspension itself cannot
    // suppress it, and dedupe-keyed so it can never repeat.
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
      // Narrow to one a day rather than stopping outright — a quiet week is not
      // the same as disinterest, and this is recoverable from a single tap.
      ...(streak >= BACKOFF_THRESHOLD && pref.dailyCap > BACKOFF_CAP
        ? { dailyCap: BACKOFF_CAP }
        : {}),
    },
  })
}

/**
 * Any tap is a strong positive signal, so it clears the streak immediately
 * rather than waiting for the next tick to recount.
 */
export const registerEngagement = async (userId: string) => {
  await prisma.notificationPreference.updateMany({
    where: { userId, ignoredStreak: { gt: 0 } },
    data: { ignoredStreak: 0 },
  })
}

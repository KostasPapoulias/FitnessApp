import prisma from '../lib/prisma'
import { getUserReadiness } from './readiness.service'
import { getTrainingLoad } from './training-load.service'
import { NOTIFICATION_TYPES } from './notification-preference.service'
import { localDay } from './notification-window.service'

/**
 * The essential tier: deterministic rules over data the app already computes.
 *
 * No AI anywhere in here. These fire on thresholds, they are reproducible, and
 * they keep working when the coach tier suspends itself — which matters most
 * for the overreaching warning, since the athlete least likely to be opening
 * notifications is the one digging themselves into an injury.
 */

export interface RuleCandidate {
  type: string
  title: string
  body: string
  dedupeKey: string
  url: string
  /** Skips the daily cap and spacing rules — never quiet hours. */
  urgent?: boolean
}

/** Readiness at or above this, with nothing trained today, is a good day. */
const READY_THRESHOLD = 75
/** Acute:chronic above this is the injury-risk zone. */
const RAMP_RATIO = 1.5

const daysSince = (date: Date) => (Date.now() - date.getTime()) / 86_400_000

const lastFinishedSession = (userId: string) =>
  prisma.workoutSession.findFirst({
    where: { userId, systemicLoad: { not: null } },
    orderBy: { dateTime: 'desc' },
    select: { dateTime: true },
  })

/**
 * Evaluate every essential rule for one user.
 *
 * Returns candidates in priority order. The scheduler sends at most one per
 * tick, so ordering here is what decides which message wins when two fire at
 * once — and a warning to back off always beats an invitation to train.
 */
export const evaluateEssentialRules = async (
  userId: string,
  timezone: string
): Promise<RuleCandidate[]> => {
  const candidates: RuleCandidate[] = []
  const today = localDay(new Date(), timezone)

  // ── 1. Overreaching ──
  // Highest priority and marked urgent: acute:chronic ratio is the best-evidenced
  // early warning for overuse injury, and it fires precisely when the athlete
  // feels fine and is about to train through it.
  const load = await getTrainingLoad(userId)
  if (load.established && load.ratio != null && load.ratio >= RAMP_RATIO) {
    candidates.push({
      type: NOTIFICATION_TYPES.OVERREACHING,
      title: '⚠️ Ramping too fast',
      body: `Your last week is ${load.ratio}× your usual load. That ratio is the strongest predictor of overuse injury — take an easy day, even if you feel fine.`,
      // Weekly: repeating this daily would train the user to ignore it
      dedupeKey: `${NOTIFICATION_TYPES.OVERREACHING}:${today.slice(0, 7)}:${Math.floor(Number(today.slice(8)) / 7)}`,
      url: '/profile',
      urgent: true,
    })
  }

  const lastSession = await lastFinishedSession(userId)
  const trainedToday = lastSession
    ? localDay(lastSession.dateTime, timezone) === today
    : false

  // ── 2. Recovery ready ──
  if (!trainedToday) {
    const readiness = await getUserReadiness(userId)
    if (readiness.readinessScore >= READY_THRESHOLD) {
      const freshest = readiness.muscles
        .filter(m => m.effectiveLevel < 25)
        .slice(0, 2)
        .map(m => m.muscleName)

      candidates.push({
        type: NOTIFICATION_TYPES.READINESS_READY,
        title: '💪 You’re recovered',
        body: freshest.length
          ? `Readiness ${readiness.readinessScore}%. ${freshest.join(' and ')} are fresh — good day to train.`
          : `Readiness ${readiness.readinessScore}%. Good day to train.`,
        dedupeKey: `${NOTIFICATION_TYPES.READINESS_READY}:${today}`,
        url: '/',
      })
    }
  }

  // ── 3. Inactivity ──
  const settings = await prisma.settings.findUnique({ where: { userId } })
  const threshold = settings?.inactivityDaysThreshold ?? 3
  const idleDays = lastSession ? Math.floor(daysSince(lastSession.dateTime)) : null

  if (idleDays != null && idleDays >= threshold) {
    candidates.push({
      type: NOTIFICATION_TYPES.INACTIVITY,
      title: '🏋️ It’s been a while',
      body: `${idleDays} days since your last session. Your muscles are recovered — a short one still counts.`,
      // Every other day at most, so a long break is not a daily guilt-trip
      dedupeKey: `${NOTIFICATION_TYPES.INACTIVITY}:${today}`,
      url: '/',
    })
  }

  return candidates
}

import prisma from '../lib/prisma'
import { getUserReadiness } from './readiness.service'
import { getTrainingLoad } from './training-load.service'
import { NOTIFICATION_TYPES } from './notification-preference.service'
import { localDay } from './notification-window.service'

/**
 * The essential notification tier: deterministic threshold rules, no AI.
 * Keeps working when the coach tier is suspended.
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
 * Evaluate every essential rule for one user. Returned in priority order —
 * the scheduler sends at most one per tick, and warnings beat invitations.
 */
export const evaluateEssentialRules = async (
  userId: string,
  timezone: string
): Promise<RuleCandidate[]> => {
  const candidates: RuleCandidate[] = []
  const today = localDay(new Date(), timezone)

  // ── 1. Overreaching ──
  // Highest priority: an acute:chronic spike is the main overuse-injury warning
  const load = await getTrainingLoad(userId)
  if (load.established && load.ratio != null && load.ratio >= RAMP_RATIO) {
    candidates.push({
      type: NOTIFICATION_TYPES.OVERREACHING,
      title: '⚠️ Ramping too fast',
      body: `Your last week is ${load.ratio}× your usual load. That ratio is the strongest predictor of overuse injury — take an easy day, even if you feel fine.`,
      // Weekly, so it is not ignored as noise
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
      // At most once per day
      dedupeKey: `${NOTIFICATION_TYPES.INACTIVITY}:${today}`,
      url: '/',
    })
  }

  return candidates
}

import type { Locale } from '../lib/locale'

// Sleep's contribution to readiness: a bounded modifier on the fatigue score,
// from the most recent night only. No log means no shift — unlogged nights are
// never assumed good or bad.

/** Minutes of sleep that neither helps nor hurts. */
export const SLEEP_BASELINE_MIN = 450 // 7.5h

/** Self-rated quality (0–100) that reads as neutral. */
export const QUALITY_BASELINE = 70

/** Maximum shift in readiness points, either direction. */
export const MAX_SLEEP_SHIFT = 8

/** Points per hour from baseline — short nights cost about twice what long nights earn. */
const PENALTY_PER_HOUR_SHORT = 2.5
const BONUS_PER_HOUR_LONG = 1.2

/** How far the quality rating alone can move the score, at either extreme. */
const QUALITY_SPAN = 3

/**
 * How long a log counts, from `sleepDate` (the morning woken, stored at UTC
 * midnight). Today's log always counts; yesterday's lapses around midday.
 */
export const SLEEP_FRESH_HOURS = 36

/** Structural, so callers can pass a Prisma row. */
export interface SleepInput {
  sleepDate: Date
  durationMin: number
  sleepScore: number | null
}

export type SleepAppliedReason =
  /** A current log was found and moved the score. */
  | 'applied'
  /** Nothing logged at all. */
  | 'none'
  /** The newest log is older than SLEEP_FRESH_HOURS. */
  | 'stale'

export interface SleepReadiness {
  /** Points added to the fatigue-derived score. 0 whenever nothing applied. */
  adjustment: number
  /** Whether `adjustment` came from real data. False means it is 0 by default. */
  applied: boolean
  reason: SleepAppliedReason
  /** The log that was used, for the UI to name what it is reacting to. */
  durationMin: number | null
  sleepScore: number | null
  sleepDate: Date | null
}

const NOT_APPLIED = (reason: SleepAppliedReason): SleepReadiness => ({
  adjustment: 0,
  applied: false,
  reason,
  durationMin: null,
  sleepScore: null,
  sleepDate: null,
})

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))

/** Points to add to readiness for one night's sleep. */
export const sleepShiftFor = (durationMin: number, sleepScore: number | null): number => {
  const hoursFromBaseline = (durationMin - SLEEP_BASELINE_MIN) / 60

  const durationTerm = hoursFromBaseline < 0
    ? hoursFromBaseline * PENALTY_PER_HOUR_SHORT
    : hoursFromBaseline * BONUS_PER_HOUR_LONG

  // Quality is optional; without it the night is scored on duration alone
  const qualityTerm = sleepScore == null
    ? 0
    : clamp(((sleepScore - QUALITY_BASELINE) / 30) * QUALITY_SPAN, QUALITY_SPAN)

  return Math.round(clamp(durationTerm + qualityTerm, MAX_SLEEP_SHIFT) * 10) / 10
}

/** Resolve the most recent sleep log into a readiness shift, or say why there is none. */
export const resolveSleepReadiness = (
  log: SleepInput | null,
  now: Date = new Date()
): SleepReadiness => {
  if (!log) return NOT_APPLIED('none')

  const ageHours = (now.getTime() - log.sleepDate.getTime()) / (60 * 60 * 1000)
  // A future-dated row is a timezone artefact, so it counts as current
  if (ageHours > SLEEP_FRESH_HOURS) return NOT_APPLIED('stale')

  // An impossible duration is bad data; ignore it
  if (!Number.isFinite(log.durationMin) || log.durationMin <= 0 || log.durationMin > 24 * 60) {
    return NOT_APPLIED('none')
  }

  return {
    adjustment: sleepShiftFor(log.durationMin, log.sleepScore),
    applied: true,
    reason: 'applied',
    durationMin: log.durationMin,
    sleepScore: log.sleepScore,
    sleepDate: log.sleepDate,
  }
}

/**
 * One line describing what sleep did to the score. English by default — the
 * AI prompt quotes it.
 */
export const describeSleepReadiness = (sleep: SleepReadiness, locale: Locale = 'en'): string => {
  if (locale === 'el') return describeSleepReadinessEl(sleep)

  if (!sleep.applied) {
    return sleep.reason === 'stale'
      ? 'Last sleep log is out of date — not counted.'
      : 'No sleep logged — readiness is from training load alone.'
  }

  const hours = (sleep.durationMin! / 60).toFixed(1)
  if (sleep.adjustment === 0) return `${hours}h sleep — right on your baseline.`
  return sleep.adjustment > 0
    ? `${hours}h sleep added ${sleep.adjustment} points.`
    : `${hours}h sleep took off ${Math.abs(sleep.adjustment)} points.`
}

/** Greek decimals use a comma. */
const elNumber = (value: number, digits: number): string =>
  value.toFixed(digits).replace('.', ',')

const describeSleepReadinessEl = (sleep: SleepReadiness): string => {
  if (!sleep.applied) {
    return sleep.reason === 'stale'
      ? 'Η τελευταία καταγραφή ύπνου είναι παλιά — δεν μετράει.'
      : 'Δεν έχει καταγραφεί ύπνος — η ετοιμότητα βγαίνει μόνο από το προπονητικό φορτίο.'
  }

  const hours = elNumber(sleep.durationMin! / 60, 1)
  const points = Math.abs(sleep.adjustment)
  const unit = points === 1 ? 'πόντο' : 'πόντους'
  if (sleep.adjustment === 0) return `${hours} ώρες ύπνου — ακριβώς στο κανονικό σου.`
  return sleep.adjustment > 0
    ? `${hours} ώρες ύπνου πρόσθεσαν ${elNumber(points, points % 1 === 0 ? 0 : 1)} ${unit}.`
    : `${hours} ώρες ύπνου αφαίρεσαν ${elNumber(points, points % 1 === 0 ? 0 : 1)} ${unit}.`
}

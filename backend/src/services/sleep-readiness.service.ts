// Sleep's contribution to readiness.
//
// The app's thesis is that it models recovery rather than volume, and the
// largest recovery variable in the literature was sitting in `SleepLog` being
// read by nothing but the AI's prompt. Readiness meant "how sore are you",
// which is not the same claim.
//
// It enters as a BOUNDED MODIFIER on the fatigue-derived score, not as a third
// weighted term. Two reasons, both about the missing-data case:
//
//   - A weighted term needs a value for every user on every day, so unlogged
//     nights need a default. Any default is a fiction: assume 7.5h and a bad
//     night you did not log reads as a good one, and the score moves for a
//     reason the athlete cannot see.
//   - A modifier can be *absent*. No log means no shift and the score is
//     exactly the fatigue model's own number, which is the honest answer.
//
// So non-logging costs nothing. That is deliberate: a debt model that docks
// points for silence trains people to log a number rather than to sleep, and
// makes the headline figure depend on a habit instead of on their body.
//
// Only the most recent night counts. Multi-night debt is truer physiology and
// is what a Health integration should eventually feed, but computed from
// hand-logged rows it punishes gaps in logging rather than gaps in sleep.

/** Minutes of sleep that neither helps nor hurts. Deviation is scored from here. */
export const SLEEP_BASELINE_MIN = 450 // 7.5h

/** Self-rated quality (0–100) that reads as neutral. The modal defaults to 75. */
export const QUALITY_BASELINE = 70

/**
 * Hard ceiling on the shift, in readiness points, in either direction.
 *
 * Sleep is a real input but it is not the model — fatigue still has to be able
 * to say "you trained legs yesterday". A cap this size can move a score across
 * a band boundary at the margins and never across two.
 */
export const MAX_SLEEP_SHIFT = 8

/**
 * Points per hour of deviation from baseline. Asymmetric on purpose: lost sleep
 * degrades performance far more than extra sleep improves it, so a short night
 * is scored roughly twice as hard as a long one is rewarded. Nine hours does
 * not buy a licence to train through genuine muscle fatigue.
 */
const PENALTY_PER_HOUR_SHORT = 2.5
const BONUS_PER_HOUR_LONG = 1.2

/** How far the quality rating alone can move the score, at either extreme. */
const QUALITY_SPAN = 3

/**
 * How long a log stays current, measured from `sleepDate`.
 *
 * `sleepDate` is the morning the athlete woke — that is what the Log Sleep
 * modal writes — and it is stored at UTC midnight. 36h means today's log always
 * counts, and yesterday's stops counting around midday if nothing newer has
 * been logged. Past that the row describes a night that has already been
 * recovered from, and carrying it forward would let one bad Tuesday depress
 * every score until the next time the athlete happened to log.
 */
export const SLEEP_FRESH_HOURS = 36

/** The columns this needs. Kept structural so callers can pass a Prisma row. */
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

/**
 * Points to add to readiness for one night's sleep.
 *
 * Pure, and separated from the row lookup so the calibration can be reasoned
 * about — and eventually asserted — without a database.
 */
export const sleepShiftFor = (durationMin: number, sleepScore: number | null): number => {
  const hoursFromBaseline = (durationMin - SLEEP_BASELINE_MIN) / 60

  const durationTerm = hoursFromBaseline < 0
    ? hoursFromBaseline * PENALTY_PER_HOUR_SHORT
    : hoursFromBaseline * BONUS_PER_HOUR_LONG

  // Quality is optional — a row without it is scored on duration alone rather
  // than being penalised for the athlete not rating their night.
  const qualityTerm = sleepScore == null
    ? 0
    : clamp(((sleepScore - QUALITY_BASELINE) / 30) * QUALITY_SPAN, QUALITY_SPAN)

  return Math.round(clamp(durationTerm + qualityTerm, MAX_SLEEP_SHIFT) * 10) / 10
}

/**
 * Resolve a sleep log into a readiness shift, or explain why there isn't one.
 *
 * `log` should be the athlete's most recent row by `sleepDate`.
 */
export const resolveSleepReadiness = (
  log: SleepInput | null,
  now: Date = new Date()
): SleepReadiness => {
  if (!log) return NOT_APPLIED('none')

  const ageHours = (now.getTime() - log.sleepDate.getTime()) / (60 * 60 * 1000)
  // A future-dated row is not stale, it is a timezone artefact — a phone an
  // hour ahead of UTC writes tomorrow's date late in the evening. Treat it as
  // current rather than discarding the athlete's most recent night.
  if (ageHours > SLEEP_FRESH_HOURS) return NOT_APPLIED('stale')

  // A duration outside human range is data damage, not a very long night, and
  // it would move the score by the full cap. Ignore it and say nothing applied.
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

/** One short line naming what sleep did to the score, for the UI. */
export const describeSleepReadiness = (sleep: SleepReadiness): string => {
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

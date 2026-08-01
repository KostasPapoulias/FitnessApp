// Acute vs chronic training load.
//
// Muscle fatigue answers "how sore am I right now". It cannot answer the
// question that actually decides whether training is working: am I building
// fitness, or digging a hole? That needs the trend of whole-body load over
// weeks, not the state of a muscle today.
//
// This is the standard impulse-response model (Banister; what TrainingPeaks
// calls CTL/ATL/TSB). Two exponentially weighted moving averages over each
// session's `systemicLoad`:
//
//   fitness (chronic, 42-day) — the work you have absorbed and adapted to
//   fatigue (acute, 7-day)    — the work still sitting on you
//   form    = fitness − fatigue
//
// Ramping acute load far past chronic is the single best-evidenced predictor of
// overuse injury, which is why the ratio is reported too.

import prisma from '../lib/prisma'

export const CHRONIC_DAYS = 42
export const ACUTE_DAYS = 7

// The acute:chronic ratio is conventionally 7 days against 28, not against the
// 42-day fitness constant. Using 42 here made steady training look like a spike.
export const ACWR_CHRONIC_DAYS = 28

// Days of history to read. Five chronic time constants is well past the point
// where older sessions still move the average.
const HISTORY_DAYS = 180

export type LoadTrend = 'ramping' | 'building' | 'maintaining' | 'detraining'
export type FormState = 'fresh' | 'neutral' | 'tired' | 'overreaching'

export interface DailyLoad {
  /** Days before `now`, 0 = today */
  daysAgo: number
  load: number
}

export interface TrainingLoad {
  /** Chronic load: accumulated fitness, in sRPE arbitrary units per day. */
  fitness: number
  /** Acute load: recent work not yet absorbed. */
  fatigue: number
  /** fitness − fatigue. Positive means fresh, negative means carrying load. */
  form: number
  /**
   * Acute:chronic workload ratio. Above ~1.5 is a spike worth warning about,
   * below ~0.8 means training is tailing off. Null until there is enough
   * chronic history for the ratio to mean anything.
   */
  ratio: number | null
  trend: LoadTrend
  formState: FormState
  /** Total sRPE load in the last 7 days, for a plain-language summary. */
  weeklyLoad: number
  /** Same for the 7 days before that, so the change is visible. */
  previousWeeklyLoad: number
  /** Sessions counted. Below ~3 the model is not yet meaningful. */
  sessionCount: number
  /** False until there is enough history to trust the numbers. */
  established: boolean
}

/** Total load per day, keyed by days-ago. */
const bucketByDay = (dailyLoads: DailyLoad[]): Map<number, number> => {
  const byDay = new Map<number, number>()
  for (const { daysAgo, load } of dailyLoads) {
    if (daysAgo < 0) continue
    byDay.set(daysAgo, (byDay.get(daysAgo) ?? 0) + load)
  }
  return byDay
}

/**
 * Exponentially weighted moving average of daily load.
 *
 * Days without training are real zeros, not gaps — resting is what converts
 * acute load into fitness, so they have to pull the average down.
 *
 * Seeded with the athlete's average daily load rather than zero. Starting from
 * zero means the 42-day average needs about six weeks to climb to the truth, so
 * everyone looks unfit and every steady week looks like a spike — a consistent
 * 8-week block scored 1.58 and got flagged as overreaching.
 */
export const ewma = (dailyLoads: DailyLoad[], timeConstantDays: number): number => {
  if (timeConstantDays <= 0) return 0

  const byDay = bucketByDay(dailyLoads)
  if (byDay.size === 0) return 0

  const oldest = Math.max(...byDay.keys())
  const span = oldest + 1
  const total = [...byDay.values()].reduce((a, b) => a + b, 0)

  const decay = Math.exp(-1 / timeConstantDays)
  let value = total / span
  // Walk forward in time from the oldest day so each step decays the running
  // average once per day, including the days with no training at all.
  for (let daysAgo = oldest; daysAgo >= 0; daysAgo--) {
    value = value * decay + (byDay.get(daysAgo) ?? 0) * (1 - decay)
  }
  return value
}

/** Mean daily load over the last `days` days, counting rest days as zero. */
export const rollingMean = (dailyLoads: DailyLoad[], days: number): number => {
  if (days <= 0) return 0
  const total = dailyLoads
    .filter(d => d.daysAgo >= 0 && d.daysAgo < days)
    .reduce((sum, d) => sum + d.load, 0)
  return total / days
}

export const classifyTrend = (ratio: number | null): LoadTrend => {
  if (ratio == null) return 'building'
  if (ratio >= 1.5) return 'ramping'
  if (ratio >= 1.0) return 'building'
  if (ratio >= 0.8) return 'maintaining'
  return 'detraining'
}

/**
 * Form banded relative to current fitness — being 20 units down means something
 * very different to a beginner and to someone carrying a large chronic load.
 */
export const classifyForm = (form: number, fitness: number): FormState => {
  if (fitness <= 0) return 'neutral'
  const relative = form / fitness
  if (relative >= 0.1) return 'fresh'
  if (relative >= -0.15) return 'neutral'
  if (relative >= -0.4) return 'tired'
  return 'overreaching'
}

export const computeTrainingLoad = (
  dailyLoads: DailyLoad[],
  sessionCount: number
): TrainingLoad => {
  const fitness = ewma(dailyLoads, CHRONIC_DAYS)
  const fatigue = ewma(dailyLoads, ACUTE_DAYS)
  const form = fitness - fatigue

  // Rolling means, not the EWMAs above: the ratio has to compare like with
  // like, and the 7-vs-28-day rolling form is the one the injury-risk research
  // is actually built on.
  const acute = rollingMean(dailyLoads, ACUTE_DAYS)
  const chronic = rollingMean(dailyLoads, ACWR_CHRONIC_DAYS)

  const established = sessionCount >= 3
  // A ratio against a near-zero chronic load is meaningless — one session after
  // a long layoff would read as an infinite spike.
  const ratio = established && chronic >= 1 ? acute / chronic : null

  const inWindow = (from: number, to: number) =>
    dailyLoads
      .filter(d => d.daysAgo >= from && d.daysAgo < to)
      .reduce((sum, d) => sum + d.load, 0)

  return {
    fitness: Math.round(fitness * 10) / 10,
    fatigue: Math.round(fatigue * 10) / 10,
    form: Math.round(form * 10) / 10,
    ratio: ratio == null ? null : Math.round(ratio * 100) / 100,
    trend: classifyTrend(ratio),
    formState: classifyForm(form, fitness),
    weeklyLoad: Math.round(inWindow(0, 7)),
    previousWeeklyLoad: Math.round(inWindow(7, 14)),
    sessionCount,
    established,
  }
}

export const getTrainingLoad = async (
  userId: string,
  now: Date = new Date()
): Promise<TrainingLoad> => {
  const since = new Date(now.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000)

  const sessions = await prisma.workoutSession.findMany({
    where: {
      userId,
      dateTime: { gte: since },
      // Unfinished sessions have no load yet
      systemicLoad: { not: null },
    },
    select: { dateTime: true, systemicLoad: true },
  })

  const msPerDay = 24 * 60 * 60 * 1000
  const dailyLoads: DailyLoad[] = sessions.map(s => ({
    daysAgo: Math.floor((now.getTime() - s.dateTime.getTime()) / msPerDay),
    load: s.systemicLoad ?? 0,
  }))

  return computeTrainingLoad(dailyLoads, sessions.length)
}

// Acute vs chronic training load (Banister impulse-response; CTL/ATL/TSB).
// Two EWMAs over each session's `systemicLoad`:
//   fitness (chronic, 42-day), fatigue (acute, 7-day), form = fitness − fatigue.
// The acute:chronic ratio flags overuse-injury risk.

import prisma from '../lib/prisma'

export const CHRONIC_DAYS = 42
export const ACUTE_DAYS = 7

// The acute:chronic ratio uses the conventional 7 vs 28 days.
export const ACWR_CHRONIC_DAYS = 28

// Days of history to read; older sessions no longer move the averages.
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
   * Acute:chronic workload ratio: above ~1.5 is a spike, below ~0.8 is tailing
   * off. Null until there is enough chronic history.
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
 * Exponentially weighted moving average of daily load. Rest days count as
 * zeros. Seeded with the athlete's average daily load, not zero, so a short
 * history does not look like a spike.
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
  // Walk forward from the oldest day, decaying once per day
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

/** Form banded relative to current fitness. */
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

  // The ratio uses rolling means (7 vs 28 days), as in the injury-risk research
  const acute = rollingMean(dailyLoads, ACUTE_DAYS)
  const chronic = rollingMean(dailyLoads, ACWR_CHRONIC_DAYS)

  const established = sessionCount >= 3
  // A ratio against near-zero chronic load is meaningless
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

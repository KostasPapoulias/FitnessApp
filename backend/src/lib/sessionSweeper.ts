import prisma from './prisma'
import { log } from './logger'

/**
 * Deletes workout sessions that were started but never finished. Safe because
 * fatigue is only applied at finish, so there is nothing to reverse. Runs on
 * its own timer, independent of the notification scheduler.
 */

/** Age after which an open session is treated as abandoned (default 12 h). */
const ABANDON_AFTER_MS =
  Number(process.env.ABANDONED_SESSION_HOURS ?? 12) * 60 * 60 * 1000

const SWEEP_INTERVAL_MS = 60 * 60 * 1000

export const sweepAbandonedSessions = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - ABANDON_AFTER_MS)

  const stale = await prisma.workoutSession.findMany({
    where: { duration: null, dateTime: { lt: cutoff } },
    select: { id: true },
  })

  if (stale.length === 0) return 0

  const ids = stale.map(s => s.id)

  await prisma.$transaction([
    // Put the linked plan back on standby rather than leaving it "started"
    prisma.scheduledWorkout.updateMany({
      where: { sessionId: { in: ids } },
      data: { status: 'standby', sessionId: null, completedAt: null },
    }),
    // Exercises, sets and modality rows cascade from the session
    prisma.workoutSession.deleteMany({ where: { id: { in: ids } } }),
  ])

  return ids.length
}

export const startSessionSweeper = () => {
  const run = async () => {
    try {
      const swept = await sweepAbandonedSessions()
      if (swept > 0) log.info('Cleared abandoned workout sessions', { swept })
    } catch (error: any) {
      // Never let a throw escape — it would silently kill the interval
      log.error('Session sweep failed', error)
    }
  }

  // Run once at boot too: a restart is the likeliest cause of an open session
  void run()
  setInterval(run, SWEEP_INTERVAL_MS)
}

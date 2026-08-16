import prisma from './prisma'

/**
 * Clears out workouts that were started and never finished.
 *
 * `startSession` creates a row on the Start tap, and only `finishSession` ever
 * writes `duration`. Anything that interrupts the session in between — a force
 * quit, a dead battery, or simply changing your mind — leaves the row behind
 * for good. Nothing ever cleaned them up, which is why
 * `scripts/cleanup-workout-data.ts` exists.
 *
 * Safe to delete outright, and that is worth being explicit about: fatigue is
 * applied at FINISH, not per set. An unfinished session has never touched
 * MuscleFatigueCurrent, SystemicFatigue or any strength estimate, so there is
 * nothing to reverse — it is a record of an intention, not of training.
 *
 * Deliberately NOT hung off the notification scheduler: that returns early
 * when VAPID keys are absent, so on any machine without push configured the
 * sweep would silently never run. Abandoned sessions have nothing to do with
 * notifications.
 */

/**
 * How long a session may stay open before it is assumed abandoned.
 *
 * Long enough that no real workout is ever caught — twelve hours is well past
 * any session, including one paused for a long walk home — and short enough
 * that a day of testing does not accumulate. The resume prompt handles the
 * window before this; the sweep only catches what was never answered.
 */
const ABANDON_AFTER_MS =
  Number(process.env.ABANDONED_SESSION_HOURS ?? 12) * 60 * 60 * 1000

/** How often to look. This is housekeeping, not something anyone waits on. */
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
    // ScheduledWorkout.session is onDelete: SetNull, so the plan would survive
    // as "started" pointing at nothing. Put it back on standby instead, so a
    // workout that was never actually done is offered again.
    prisma.scheduledWorkout.updateMany({
      where: { sessionId: { in: ids } },
      data: { status: 'standby', sessionId: null, completedAt: null },
    }),
    // Exercises, sets and every modality detail row cascade from the session.
    prisma.workoutSession.deleteMany({ where: { id: { in: ids } } }),
  ])

  return ids.length
}

export const startSessionSweeper = () => {
  const run = async () => {
    try {
      const swept = await sweepAbandonedSessions()
      if (swept > 0) console.log(`🧹 Cleared ${swept} abandoned workout session(s)`)
    } catch (error: any) {
      // A throw escaping here would kill the interval permanently and silently,
      // which is exactly how the mess this cleans up went unnoticed.
      console.error('Session sweep failed:', error.message)
    }
  }

  // Once at boot as well as on the interval: a restart is the most likely thing
  // to have LEFT a session open, and waiting an hour to clear it is backwards.
  void run()
  setInterval(run, SWEEP_INTERVAL_MS)
}

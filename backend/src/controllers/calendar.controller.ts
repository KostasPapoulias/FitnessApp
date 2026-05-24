import { Response } from 'express';
import { AuthRequest } from '../server';
import { prisma } from '../server';

// Get all workout days for a given month
// GET /api/calendar?month=4&year=2025

export const getCalendarMonth = async (req: AuthRequest, res: Response) => {
  try {
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1; // Default to current month
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId: req.userId!,
        dateTime: {gte: start, lt: end}
      },
      include: {
        workoutExercises: {
          include: {
            exercise: {
              include: {muscleLinks: {include: {muscle: true}}}
            }
          }
        }
      },
      orderBy: { dateTime: 'asc' }
    });
    // Build a map of date string -> aggregated session summary
    const dayAgg: Record<string, {
      sessionId: string
      totalVolume: number
      duration: number
      exerciseCount: number
      rpeWeightedSum: number
      rpeWeight: number
    }> = {}

    for (const session of sessions) {
      const dateKey = session.dateTime.toISOString().split('T')[0]
      const totalVolume = session.totalVolume ?? 0
      const avgRpe = session.avgRpe ?? 0
      const rpeWeight = totalVolume > 0 ? totalVolume : (avgRpe > 0 ? 1 : 0)

      if (!dayAgg[dateKey]) {
        dayAgg[dateKey] = {
          sessionId: session.id,
          totalVolume: 0,
          duration: 0,
          exerciseCount: 0,
          rpeWeightedSum: 0,
          rpeWeight: 0
        }
      }

      dayAgg[dateKey].sessionId = session.id
      dayAgg[dateKey].totalVolume += totalVolume
      dayAgg[dateKey].duration += session.duration ?? 0
      dayAgg[dateKey].exerciseCount += session.workoutExercises.length
      dayAgg[dateKey].rpeWeightedSum += avgRpe * rpeWeight
      dayAgg[dateKey].rpeWeight += rpeWeight
    }

    const dayMap: Record<string, {
      sessionId: string
      totalVolume: number
      avgRpe: number
      duration: number
      intensity: 'rest' | 'low' | 'medium' | 'high'
      color: string
      exerciseCount: number
    }> = {}

    for (const [dateKey, agg] of Object.entries(dayAgg)) {
      const avgRpe = agg.rpeWeight > 0 ? agg.rpeWeightedSum / agg.rpeWeight : 0
      const intensity =
        avgRpe === 0  ? 'rest'   :
        avgRpe <= 5   ? 'low'    :
        avgRpe <= 7.5 ? 'medium' : 'high'

      const color =
        intensity === 'high'   ? '#EF4444' :
        intensity === 'medium' ? '#FACC15' :
        intensity === 'low'    ? '#4ADE80' : '#2A2A2A'

      dayMap[dateKey] = {
        sessionId: agg.sessionId,
        totalVolume: agg.totalVolume,
        avgRpe,
        duration: agg.duration,
        exerciseCount: agg.exerciseCount,
        intensity,
        color
      }
    }

    res.json({ success: true, data: { month, year, days: dayMap } })

  } catch (error) {
    console.error('getCalendarMonth error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/calendar/:date  date = "2026-04-25"
// Returns full session detail for a specific day
export const getCalendarDay = async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.params
    const dayStart = new Date(date)
    const dayEnd   = new Date(date)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId: req.userId!,
        dateTime: { gte: dayStart, lt: dayEnd }
      },
      include: {
        workoutExercises: {
          include: {
            exercise: {
              include: {
                muscleLinks: { include: { muscle: true } },
                categoryLinks: { include: { category: true } }
              }
            },
            sets: {
              include: { strength: true, cardio: true, calisthenics: true },
              orderBy: { setNumber: 'asc' }
            }
          },
          orderBy: { orderIndex: 'asc' }
        }
      },
      orderBy: { dateTime: 'asc' }
    })

    if (!sessions.length) {
      res.json({ success: true, data: null })
      return
    }

    const sessionIds = sessions.map(s => s.id)

    // Get the fatigue snapshot for that day from the logs
    const fatigueLogs = await prisma.muscleFatigueLog.findMany({
      where: {
        userId: req.userId!,
        workoutSessionId: { in: sessionIds }
      },
      include: { muscle: true },
      orderBy: { createdAt: 'asc' }
    })

    const fatigueByMuscle = new Map<string, typeof fatigueLogs[number]>()
    for (const log of fatigueLogs) {
      fatigueByMuscle.set(log.muscleId, log)
    }

    const totalVolume = sessions.reduce(
      (sum, s) => sum + (s.totalVolume ?? 0), 0
    )
    const duration = sessions.reduce(
      (sum, s) => sum + (s.duration ?? 0), 0
    )
    const rpeWeightedSum = sessions.reduce((sum, s) => {
      const avgRpe = s.avgRpe ?? 0
      const weight = (s.totalVolume ?? 0) > 0 ? (s.totalVolume ?? 0) : (avgRpe > 0 ? 1 : 0)
      return sum + (avgRpe * weight)
    }, 0)
    const rpeWeight = sessions.reduce((sum, s) => {
      const avgRpe = s.avgRpe ?? 0
      const weight = (s.totalVolume ?? 0) > 0 ? (s.totalVolume ?? 0) : (avgRpe > 0 ? 1 : 0)
      return sum + weight
    }, 0)
    const avgRpe = rpeWeight > 0 ? rpeWeightedSum / rpeWeight : 0

    res.json({
      success: true,
      data: {
        session: {
          dateTime:     dayStart,
          duration,
          totalVolume,
          avgRpe,
          sessionCount: sessions.length,
          exerciseCount: sessions.reduce(
            (sum, s) => sum + s.workoutExercises.length, 0
          )
        },
        sessions: sessions.map(session => ({
          id:           session.id,
          dateTime:     session.dateTime,
          duration:     session.duration,
          totalVolume:  session.totalVolume,
          avgRpe:       session.avgRpe,
          notes:        session.notes,
          exercises: session.workoutExercises.map(we => ({
            name:       we.exercise.name,
            categories: we.exercise.categoryLinks.map(cl => cl.category.name),
            muscles:    we.exercise.muscleLinks.map(ml => ml.muscle.name),
            sets:       we.sets.map(s => ({
              setNumber: s.setNumber,
              rpe:       s.rpe,
              strength:  s.strength,
              cardio:    s.cardio,
              calisthenics: s.calisthenics,
              // wod:       s.wod,
              // mobility:  s.mobility
            }))
          }))
        })),
        fatigueSnapshot: Array.from(fatigueByMuscle.values()).map(f => ({
          muscleName:       f.muscle.name,
          fatigueLevelAfter: f.fatigueLevelAfter,
          delta:            f.delta,
          color:
            f.fatigueLevelAfter >= 70 ? '#EF4444' :
            f.fatigueLevelAfter >= 35 ? '#FACC15' : '#4ADE80'
        }))
      }
    })

  } catch (error) {
    console.error('getCalendarDay error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}
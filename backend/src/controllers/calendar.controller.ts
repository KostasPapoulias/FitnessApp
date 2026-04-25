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
    // Build a map of date string -> session summary
    const dayMap: Record<string, {
      sessionId: string
      totalVolume: number
      avgRpe: number
      duration: number
      intensity: 'rest' | 'low' | 'medium' | 'high'
      color: string
      exerciseCount: number
    }> = {}

    for (const session of sessions) {
      const dateKey = session.dateTime.toISOString().split('T')[0]
      const rpe = session.avgRpe ?? 0
      const intensity =
        rpe === 0    ? 'rest'   :
        rpe <= 5     ? 'low'    :
        rpe <= 7.5   ? 'medium' : 'high'

      const color =
        intensity === 'high'   ? '#EF4444' :
        intensity === 'medium' ? '#FACC15' :
        intensity === 'low'    ? '#4ADE80' : '#2A2A2A'

      dayMap[dateKey] = {
        sessionId:     session.id,
        totalVolume:   session.totalVolume ?? 0,
        avgRpe:        rpe,
        duration:      session.duration ?? 0,
        exerciseCount: session.workoutExercises.length,
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

    const session = await prisma.workoutSession.findFirst({
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
      }
    })

    if (!session) {
      res.json({ success: true, data: null })
      return
    }

    // Get the fatigue snapshot for that day from the log
    const fatigueSnapshot = await prisma.muscleFatigueLog.findMany({
      where: {
        userId: req.userId!,
        workoutSessionId: session.id
      },
      include: { muscle: true }
    })

    res.json({
      success: true,
      data: {
        session: {
          id:           session.id,
          dateTime:     session.dateTime,
          duration:     session.duration,
          totalVolume:  session.totalVolume,
          avgRpe:       session.avgRpe,
          notes:        session.notes
        },
        exercises: session.workoutExercises.map(we => ({
          name:       we.exercise.name,
          categories: we.exercise.categoryLinks.map(cl => cl.category.name),
          muscles:    we.exercise.muscleLinks.map(ml => ml.muscle.name),
          sets:       we.sets.map(s => ({
            setNumber: s.setNumber,
            rpe:       s.rpe,
            strength:  s.strength,
            cardio:    s.cardio,
            calisthenics: s.calisthenics
          }))
        })),
        fatigueSnapshot: fatigueSnapshot.map(f => ({
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
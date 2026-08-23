import { Response } from 'express';
// Import the client directly rather than via '../server'. Going through server
// creates a cycle (server → routes → controller → server) that breaks any
// attempt to load this module on its own. server.ts only re-exports this same
// singleton, so the instance is identical.
import prisma from '../lib/prisma';
import type { AuthRequest } from '../server';
import { log } from '../lib/logger'

// Muscle -> muscle-group mapping, mirrors the groups used on the
// Calendar "Muscles" tab (Chest / Back / Legs / Shoulders / Arms / Core / Calves).
const MUSCLE_GROUP: Record<string, string> = {
  'Chest': 'Chest',
  'Back': 'Back', 'Lats': 'Back', 'Traps': 'Back', 'Lower Back': 'Back',
  'Quadriceps': 'Legs', 'Hamstrings': 'Legs', 'Glutes': 'Legs',
  'Shoulders': 'Shoulders',
  'Biceps': 'Arms', 'Triceps': 'Arms', 'Forearms': 'Arms',
  'Abs': 'Core', 'Obliques': 'Core',
  'Calves': 'Calves',
}
const GROUP_ORDER = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Calves']

// Calendar day key (YYYY-MM-DD) in LOCAL time.
// toISOString() must never be used for this: it renders the UTC date, so for a
// user east of UTC a local midnight resolves to the previous day and a workout
// lands on the wrong square. Session timestamps and grid cells have to be keyed
// the same way or they never line up.
const dayKey = (d: Date) => {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Last instant of a day — for `lte` bounds that must include the whole day
const endOfDay = (d: Date) => {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e
}

// Get all workout days for a given month
// GET /api/calendar?month=4&year=2025

export const getCalendarMonth = async (req: AuthRequest, res: Response) => {
  try {
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1; // Default to current month
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    // Month view only needs per-session totals + exercise count — never the
    // actual exercises/muscles, so select just that instead of a deep include.
    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId: req.userId!,
        dateTime: {gte: start, lt: end},
      // Only completed sessions are history. `duration` is written by the
      // finish claim and nothing else, so `duration: null` is an abandoned
      // session — it carries no fatigue, no volume and no RPE, and listing it
      // put empty phantom entries in the calendar.
        duration: { not: null }
      },
      select: {
        id: true,
        dateTime: true,
        duration: true,
        totalVolume: true,
        avgRpe: true,
        _count: { select: { workoutExercises: true } }
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
      const dateKey = dayKey(session.dateTime)
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
      dayAgg[dateKey].exerciseCount += session._count.workoutExercises
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
    log.error('getCalendarMonth failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/calendar/:date  date = "2026-04-25"
// Returns full session detail for a specific day
export const getCalendarDay = async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.params
    // "2026-07-25" through `new Date()` parses as UTC midnight, which is a
    // different instant from the local day the grid keys by. Build the window
    // from local date parts so tapping a day shows the same sessions the grid
    // counted for it.
    const [y, m, d] = String(date).split('-').map(Number)
    if (!y || !m || !d) {
      res.status(400).json({ success: false, error: 'Invalid date, expected YYYY-MM-DD' })
      return
    }
    const dayStart = new Date(y, m - 1, d)
    const dayEnd   = new Date(y, m - 1, d + 1)

    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId: req.userId!,
        dateTime: { gte: dayStart, lt: dayEnd },
        // Completed sessions only — see getCalendarMonth.
        duration: { not: null }
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
              include: {
                strength: true, cardio: true, calisthenics: true,
                // Everything about the run EXCEPT the route and the splits.
                // The day view shows pace and elevation on the row; the route
                // is tens of kilobytes and is fetched only if the run is
                // opened — see GET /api/workout/sets/:setId/run.
                runTrack: {
                  select: {
                    distanceM: true, durationSec: true, avgPaceSec: true,
                    elevationGainM: true, source: true, startedAt: true
                  }
                }
              },
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
              // The id travels so a run row can ask for its own route.
              id:        s.id,
              setNumber: s.setNumber,
              rpe:       s.rpe,
              strength:  s.strength,
              cardio:    s.cardio,
              calisthenics: s.calisthenics,
              run:       s.runTrack,
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
    log.error('getCalendarDay failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/calendar/activity
// GitHub-style 53-week training heatmap + streak stats
export const getCalendarActivity = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const today = new Date(); today.setHours(0, 0, 0, 0)
    // Grid runs to the Saturday of this week, at midnight — the cursor below
    // steps day by day from `start` and compares against `today`, so both must
    // stay at midnight or today's cell would read as "future".
    const gridEnd = new Date(today); gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()))
    const TOTAL_WEEKS = 53
    const start = new Date(gridEnd); start.setDate(gridEnd.getDate() - TOTAL_WEEKS * 7 + 1) // Sunday, 53 weeks back
    // The QUERY bound has to cover the whole final day. Using gridEnd directly
    // (Saturday 00:00) silently dropped every session logged later that day —
    // invisible all week, then on Saturday it hid the whole of today.
    const queryEnd = endOfDay(gridEnd)

    // Year-to-date is a different window from the 53-week grid, and neither
    // read depends on the other — so they go out together rather than one after
    // the other. At a ~515 ms round trip that is half this endpoint's latency.
    const yearStart = new Date(today.getFullYear(), 0, 1)

    const [sessions, yearSessions] = await Promise.all([
      prisma.workoutSession.findMany({
        where: { userId, dateTime: { gte: start, lte: queryEnd }, duration: { not: null } },
        select: { dateTime: true, totalVolume: true }
      }),
      prisma.workoutSession.findMany({
        // endOfDay, not `today`: a midnight bound excluded everything logged
        // today, so the year total was always a day behind.
        where: { userId, dateTime: { gte: yearStart, lte: endOfDay(today) }, duration: { not: null } },
        select: { dateTime: true }
      }),
    ])

    const volumeByDay = new Map<string, number>()
    for (const s of sessions) {
      const key = dayKey(s.dateTime)
      volumeByDay.set(key, (volumeByDay.get(key) ?? 0) + (s.totalVolume ?? 0))
    }

    // Bucket active days into quartiles (relative to this user's own volume
    // range) so the heatmap adapts instead of using fixed kg thresholds.
    const activeVolumes = Array.from(volumeByDay.values()).sort((a, b) => a - b)
    const quantile = (p: number) => {
      if (!activeVolumes.length) return 0
      return activeVolumes[Math.min(activeVolumes.length - 1, Math.floor(p * activeVolumes.length))]
    }
    const q25 = quantile(0.25), q50 = quantile(0.5), q75 = quantile(0.75)
    const levelFor = (vol: number) => {
      if (vol <= 0) return 1
      if (vol <= q25) return 1
      if (vol <= q50) return 2
      if (vol <= q75) return 3
      return 4
    }

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const weeks: { monthLabel: string; days: { date: string; level: number; future: boolean }[] }[] = []
    let prevMonth = -1
    const cursor = new Date(start)
    for (let w = 0; w < TOTAL_WEEKS; w++) {
      const days: { date: string; level: number; future: boolean }[] = []
      let labelThisWeek = ''
      for (let d = 0; d < 7; d++) {
        const key = dayKey(cursor)
        const future = cursor > today
        const vol = volumeByDay.get(key)
        const level = future ? 0 : (vol !== undefined ? levelFor(vol) : 0)
        days.push({ date: key, level, future })
        if (d === 0) {
          const m = cursor.getMonth()
          if (m !== prevMonth) { labelThisWeek = MONTHS[m]; prevMonth = m }
        }
        cursor.setDate(cursor.getDate() + 1)
      }
      weeks.push({ days, monthLabel: labelThisWeek })
    }

    // Streaks — chronological, past/today only.
    const flat = weeks.flatMap(w => w.days).filter(d => !d.future)
    let longest = 0, run = 0
    for (const d of flat) { if (d.level > 0) { run++; longest = Math.max(longest, run) } else run = 0 }
    let current = 0
    for (let i = flat.length - 1; i >= 0; i--) { if (flat[i].level > 0) current++; else break }

    // Year-to-date totals (independent of the 53-week rolling window — the
    // read for these was issued at the top, alongside the grid's).
    const totalThisYear = new Set(yearSessions.map(s => dayKey(s.dateTime))).size
    const daysElapsed = Math.floor((today.getTime() - yearStart.getTime()) / 86400000) + 1
    const consistencyPct = daysElapsed > 0 ? Math.round((totalThisYear / daysElapsed) * 100) : 0

    res.json({
      success: true,
      data: { weeks, streak: { current, longest, totalThisYear, consistencyPct } }
    })

  } catch (error) {
    log.error('getCalendarActivity failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/calendar/muscles
// Weekly set volume per muscle group (last 8 weeks) + imbalance/coach insights
export const getCalendarMuscles = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const today = new Date(); today.setHours(23, 59, 59, 999)
    const WEEKS = 8
    const rangeStart = new Date(today)
    rangeStart.setDate(rangeStart.getDate() - WEEKS * 7 + 1)
    rangeStart.setHours(0, 0, 0, 0)

    // Eight weeks of volume, and the current per-muscle fatigue used for the
    // coach tip at the bottom. Independent reads, issued together.
    const [workoutExercises, fatigue] = await Promise.all([
      prisma.workoutExercise.findMany({
        where: {
          session: { userId, dateTime: { gte: rangeStart, lte: today }, duration: { not: null } },
        },
        include: {
          session: { select: { dateTime: true } },
          exercise: { include: { muscleLinks: { include: { muscle: true } } } },
          sets: { select: { id: true } }
        }
      }),
      prisma.muscleFatigueCurrent.findMany({
        where: { userId },
        include: { muscle: true }
      }),
    ])

    const weekIndexFor = (date: Date) => {
      const diffDays = Math.floor((date.getTime() - rangeStart.getTime()) / 86400000)
      return Math.min(WEEKS - 1, Math.max(0, Math.floor(diffDays / 7)))
    }

    const counts: Record<string, number[]> = {}
    for (const g of GROUP_ORDER) counts[g] = Array(WEEKS).fill(0)

    for (const we of workoutExercises) {
      const wIdx = weekIndexFor(we.session.dateTime)
      const setCount = we.sets.length
      const groupsHit = new Set(
        we.exercise.muscleLinks
          .map(ml => MUSCLE_GROUP[ml.muscle.name])
          .filter((g): g is string => Boolean(g))
      )
      for (const g of groupsHit) counts[g][wIdx] += setCount
    }

    const withRecent = GROUP_ORDER.map(name => {
      const cells = counts[name]
      const recent = cells.slice(-3).reduce((a, b) => a + b, 0)
      return { name, cells, recent }
    })

    const avgRecent = withRecent.reduce((s, r) => s + r.recent, 0) / withRecent.length
    const muscleRows = withRecent.map(r => ({
      name: r.name,
      cells: r.cells,
      status: r.recent === 0
        ? 'neglected'
        : (avgRecent > 0 && r.recent > avgRecent * 1.6) ? 'overloaded' : 'balanced'
    }))

    const neglected = muscleRows.filter(r => r.status === 'neglected').map(r => r.name)
    const overloaded = muscleRows.filter(r => r.status === 'overloaded').map(r => r.name)

    let muscleInsight: string
    if (neglected.length && overloaded.length) {
      muscleInsight = `${neglected.join(' and ')} ${neglected.length > 1 ? 'have' : 'has'} gone without volume in the last 3 weeks while ${overloaded.join(' and ')} ${overloaded.length > 1 ? 'are' : 'is'} trending high. Add a ${neglected[0].toLowerCase()} finisher this week to even things out.`
    } else if (neglected.length) {
      muscleInsight = `${neglected.join(' and ')} ${neglected.length > 1 ? "haven't" : "hasn't"} seen volume in the last 3 weeks. Work it back into your split soon.`
    } else if (overloaded.length) {
      muscleInsight = `${overloaded.join(' and ')} ${overloaded.length > 1 ? 'are' : 'is'} trending high relative to the rest of your split. Make sure recovery keeps pace.`
    } else {
      muscleInsight = 'Your training is well balanced across muscle groups over the last 8 weeks.'
    }

    // AI coach tip, derived from current per-muscle fatigue levels (read at the
    // top, alongside the volume query).
    const fatigueByGroup: Record<string, number[]> = {}
    for (const f of fatigue) {
      const g = MUSCLE_GROUP[f.muscle.name]
      if (!g) continue
      if (!fatigueByGroup[g]) fatigueByGroup[g] = []
      fatigueByGroup[g].push(f.fatigueLevel)
    }
    const groupAvg = Object.entries(fatigueByGroup).map(([group, vals]) => ({
      group, avg: vals.reduce((a, b) => a + b, 0) / vals.length
    }))

    let coachTip = 'Log a session to get a personalized recommendation for today.'
    if (groupAvg.length) {
      groupAvg.sort((a, b) => b.avg - a.avg)
      const mostFatigued  = groupAvg[0]
      const mostRecovered = groupAvg[groupAvg.length - 1]
      coachTip = mostFatigued.avg >= 50
        ? `${mostFatigued.group} is still fatigued from recent training. A ${mostRecovered.group.toLowerCase()} or core day fits best today — your ${mostRecovered.group.toLowerCase()} is recovered.`
        : `Fatigue is low across the board. Any muscle group is fair game for a strong session today.`
    }

    res.json({
      success: true,
      data: {
        weekHeads: Array.from({ length: WEEKS }, (_, i) => i === WEEKS - 1 ? 'Now' : `-${WEEKS - 1 - i}`),
        muscleRows,
        muscleInsight,
        coachTip
      }
    })

  } catch (error) {
    log.error('getCalendarMuscles failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}
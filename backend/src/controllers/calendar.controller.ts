import { Response } from 'express';
// Imported directly, not via '../server', to avoid an import cycle.
import prisma from '../lib/prisma';
import type { AuthRequest } from '../server';
import { log } from '../lib/logger'
import { fatigueColor } from '../services/data-export.service'
import { INTL_LOCALE, Locale, localeOf } from '../lib/locale'

// Muscle → group, matching the Calendar "Muscles" tab.
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

/** Group labels per language (muscle names themselves are still English). */
const GROUP_LABELS: Record<Locale, Record<string, string>> = {
  en: Object.fromEntries(GROUP_ORDER.map(g => [g, g])),
  el: {
    Chest: 'Στήθος', Back: 'Πλάτη', Legs: 'Πόδια', Shoulders: 'Ώμοι',
    Arms: 'Χέρια', Core: 'Κορμός', Calves: 'Γάμπες',
  },
}

/** The muscle-balance insight sentence, written per language for correct grammar. */
const muscleInsightFor = (
  locale: Locale, neglected: string[], overloaded: string[]
): string => {
  const neg = neglected.join(locale === 'el' ? ' και ' : ' and ')
  const over = overloaded.join(locale === 'el' ? ' και ' : ' and ')
  const negMany = neglected.length > 1
  const overMany = overloaded.length > 1

  if (locale === 'el') {
    if (neglected.length && overloaded.length) {
      return `${neg} ${negMany ? 'δεν έχουν' : 'δεν έχει'} δεχθεί όγκο τις τελευταίες 3 εβδομάδες, ενώ ${over} ${overMany ? 'ανεβαίνουν' : 'ανεβαίνει'} πολύ. Πρόσθεσε ένα finisher για ${neglected[0].toLowerCase()} αυτή την εβδομάδα για να ισορροπήσει.`
    }
    if (neglected.length) {
      return `${neg} ${negMany ? 'δεν έχουν' : 'δεν έχει'} δεχθεί όγκο τις τελευταίες 3 εβδομάδες. Ώρα να ${negMany ? 'επιστρέψουν' : 'επιστρέψει'} στο πρόγραμμά σου.`
    }
    if (overloaded.length) {
      return `${over} ${overMany ? 'ανεβαίνουν' : 'ανεβαίνει'} σε σχέση με το υπόλοιπο πρόγραμμά σου. Φρόντισε να προλαβαίνει η αποκατάσταση.`
    }
    return 'Η προπόνησή σου είναι καλά ισορροπημένη ανάμεσα στις μυϊκές ομάδες τις τελευταίες 8 εβδομάδες.'
  }

  if (neglected.length && overloaded.length) {
    return `${neg} ${negMany ? 'have' : 'has'} gone without volume in the last 3 weeks while ${over} ${overMany ? 'are' : 'is'} trending high. Add a ${neglected[0].toLowerCase()} finisher this week to even things out.`
  }
  if (neglected.length) {
    return `${neg} ${negMany ? "haven't" : "hasn't"} seen volume in the last 3 weeks. Work it back into your split soon.`
  }
  if (overloaded.length) {
    return `${over} ${overMany ? 'are' : 'is'} trending high relative to the rest of your split. Make sure recovery keeps pace.`
  }
  return 'Your training is well balanced across muscle groups over the last 8 weeks.'
}

// YYYY-MM-DD in local time. Never toISOString(), which uses the UTC date and
// puts sessions on the wrong day east of UTC.
const dayKey = (d: Date) => {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Last instant of a day, for inclusive `lte` bounds.
const endOfDay = (d: Date) => {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e
}

// GET /api/calendar?month=4&year=2026 — per-day summaries for one month
export const getCalendarMonth = async (req: AuthRequest, res: Response) => {
  try {
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    // Per-session totals and exercise count only
    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId: req.userId!,
        dateTime: {gte: start, lt: end},
      // Finished sessions only (duration is written at finish)
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
    // Aggregate per local day; RPE is volume-weighted
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

// GET /api/calendar/:date (YYYY-MM-DD) — sessions, sets and fatigue snapshot for one day
export const getCalendarDay = async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.params
    // Built from local date parts so the window matches the grid's local days
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
        // Finished sessions only
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
                // Summary only; the route and splits are fetched when the run is opened
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

    // The day's body map: each muscle's last log from its sessions
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
            // Needed to edit the note from the day view
            workoutExerciseId: we.id,
            name:       we.exercise.name,
            notes:      we.notes,
            categories: we.exercise.categoryLinks.map(cl => cl.category.name),
            muscles:    we.exercise.muscleLinks.map(ml => ml.muscle.name),
            sets:       we.sets.map(s => ({
              // Needed to fetch the run's route
              id:        s.id,
              setNumber: s.setNumber,
              rpe:       s.rpe,
              strength:  s.strength,
              cardio:    s.cardio,
              calisthenics: s.calisthenics,
              run:       s.runTrack,
            }))
          }))
        })),
        fatigueSnapshot: Array.from(fatigueByMuscle.values()).map(f => ({
          muscleName:       f.muscle.name,
          fatigueLevelAfter: f.fatigueLevelAfter,
          delta:            f.delta,
          color: fatigueColor(f.fatigueLevelAfter)
        }))
      }
    })

  } catch (error) {
    log.error('getCalendarDay failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/calendar/activity — 53-week training heatmap + streak stats
export const getCalendarActivity = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const today = new Date(); today.setHours(0, 0, 0, 0)
    // The grid ends on this week's Saturday; both dates stay at midnight so today is not "future"
    const gridEnd = new Date(today); gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()))
    const TOTAL_WEEKS = 53
    const start = new Date(gridEnd); start.setDate(gridEnd.getDate() - TOTAL_WEEKS * 7 + 1)
    // The query must cover the whole final day
    const queryEnd = endOfDay(gridEnd)

    // Year-to-date window, read in parallel with the grid
    const yearStart = new Date(today.getFullYear(), 0, 1)

    const [sessions, yearSessions] = await Promise.all([
      prisma.workoutSession.findMany({
        where: { userId, dateTime: { gte: start, lte: queryEnd }, duration: { not: null } },
        select: { dateTime: true, totalVolume: true }
      }),
      prisma.workoutSession.findMany({
        // endOfDay so today's sessions count
        where: { userId, dateTime: { gte: yearStart, lte: endOfDay(today) }, duration: { not: null } },
        select: { dateTime: true }
      }),
    ])

    const volumeByDay = new Map<string, number>()
    for (const s of sessions) {
      const key = dayKey(s.dateTime)
      volumeByDay.set(key, (volumeByDay.get(key) ?? 0) + (s.totalVolume ?? 0))
    }

    // Heat levels by quartile of the user's own daily volume
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

    // Month labels in the reader's language
    const monthName = new Intl.DateTimeFormat(INTL_LOCALE[localeOf(res)], { month: 'short' })
    const MONTHS = Array.from({ length: 12 }, (_, m) => monthName.format(new Date(2021, m, 1)))
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

    // Streaks over past days only
    const flat = weeks.flatMap(w => w.days).filter(d => !d.future)
    let longest = 0, run = 0
    for (const d of flat) { if (d.level > 0) { run++; longest = Math.max(longest, run) } else run = 0 }
    let current = 0
    for (let i = flat.length - 1; i >= 0; i--) { if (flat[i].level > 0) current++; else break }

    // Year-to-date totals
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

// GET /api/calendar/muscles — weekly sets per muscle group (8 weeks) + balance insight and coach tip
export const getCalendarMuscles = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const today = new Date(); today.setHours(23, 59, 59, 999)
    const WEEKS = 8
    const rangeStart = new Date(today)
    rangeStart.setDate(rangeStart.getDate() - WEEKS * 7 + 1)
    rangeStart.setHours(0, 0, 0, 0)

    // 8 weeks of volume and current fatigue, batched
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
    const groupLabel = GROUP_LABELS[localeOf(res)]
    const muscleRows = withRecent.map(r => ({
      // Translated here so it matches the insight sentence
      name: groupLabel[r.name] ?? r.name,
      cells: r.cells,
      status: r.recent === 0
        ? 'neglected'
        : (avgRecent > 0 && r.recent > avgRecent * 1.6) ? 'overloaded' : 'balanced'
    }))

    const neglected = muscleRows.filter(r => r.status === 'neglected').map(r => r.name)
    const overloaded = muscleRows.filter(r => r.status === 'overloaded').map(r => r.name)

    const muscleInsight = muscleInsightFor(localeOf(res), neglected, overloaded)

    // Coach tip from current fatigue per group
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
        weekHeads: Array.from({ length: WEEKS }, (_, i) =>
          i === WEEKS - 1 ? (localeOf(res) === 'el' ? 'Τώρα' : 'Now') : `-${WEEKS - 1 - i}`),
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
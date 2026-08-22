import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { calendarService } from '../services/calendar.service'
import MiniMuscleMap from '../components/muscle/MiniMuscleMap'
import CoachMark, { HINTS } from '../components/onboarding/CoachMark'
import { fmtTime } from './Workout/helpers'
import SwipeActions from '../components/SwipeActions'
import SetEditSheet from '../components/workout/SetEditSheet'
import { workoutService } from '../services/workout.service'

// Pulls MapLibre in with it, so it is loaded only when a route is opened —
// the calendar itself must not cost a map.
const RunDetail = lazy(() => import('../components/RunDetail'))
//import { useFatigueStore } from '../store/useFatigueStore'

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

type Tab = 'Month' | 'Activity' | 'Muscles'

interface DaySummary {
  sessionId: string
  totalVolume: number
  avgRpe: number
  duration: number
  intensity: string
  color: string
  exerciseCount: number
}

interface DaySession {
  id: string
  dateTime: string
  duration: number | null
  totalVolume: number | null
  avgRpe: number | null
  notes?: string | null
  exercises: any[]
}

interface DayDetail {
  session: {
    dateTime: string
    duration: number
    totalVolume: number
    avgRpe: number
    sessionCount: number
    exerciseCount: number
  }
  sessions: DaySession[]
  fatigueSnapshot: any[]
}

interface ActivityDay {
  date: string
  level: number
  future: boolean
}

interface ActivityWeek {
  monthLabel: string
  days: ActivityDay[]
}

interface ActivityData {
  weeks: ActivityWeek[]
  streak: {
    current: number
    longest: number
    totalThisYear: number
    consistencyPct: number
  }
}

interface MuscleRow {
  name: string
  cells: number[]
  status: 'neglected' | 'overloaded' | 'balanced'
}

interface MusclesData {
  weekHeads: string[]
  muscleRows: MuscleRow[]
  muscleInsight: string
  coachTip: string
}

const heatClass = (level: number) => {
  if (level === 0) return 'bg-dark-700'
  if (level === 1) return 'bg-brand-teal/25'
  if (level === 2) return 'bg-brand-teal/50'
  if (level === 3) return 'bg-brand-teal/75'
  return 'bg-brand-teal'
}

const cellClass = (n: number) => {
  if (n === 0) return 'bg-dark-700'
  if (n <= 5) return 'bg-brand-teal/25'
  if (n <= 10) return 'bg-brand-teal/50'
  if (n <= 15) return 'bg-brand-teal/75'
  return 'bg-brand-teal'
}

const statusColor = (status: MuscleRow['status']) =>
  status === 'neglected' ? 'bg-brand-red'
  : status === 'overloaded' ? 'bg-brand-orange'
  : 'bg-brand-green'

export default function Calendar() {
  const today = new Date()
  const [tab, setTab] = useState<Tab>('Month')

  // `?date=YYYY-MM-DD` opens straight onto a day. This is what makes a row in
  // History openable: the calendar already renders sets, runs and the per-day
  // muscle map, so a second session-detail screen would be two places to fix
  // the same bug. Read once, on mount — a link is a starting point, and
  // watching it would fight the user every time they picked another day.
  const [searchParams] = useSearchParams()
  const linkedDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('date') ?? '')
    ? searchParams.get('date')!
    : null

  const [month, setMonth] = useState(linkedDate ? Number(linkedDate.slice(5, 7)) : today.getMonth() + 1)
  const [year,  setYear]  = useState(linkedDate ? Number(linkedDate.slice(0, 4)) : today.getFullYear())
  const [days,  setDays]  = useState<Record<string, DaySummary>>({})
  const [selectedDate, setSelectedDate] = useState<string | null>(linkedDate)
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null)
  const [isLoadingMonth, setIsLoadingMonth] = useState(true)
  const [isLoadingDay,   setIsLoadingDay]   = useState(false)
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null)
  /** The run whose route is open over the calendar, if any. */
  const [openRun, setOpenRun] = useState<{ setId: string; title: string } | null>(null)
  // Which session's sets are currently correctable. Off by default: history is
  // read almost always and edited almost never, and a set table that is always
  // tappable invites changes nobody meant to make.
  const [editingSession, setEditingSession] = useState<string | null>(null)
  const [editingSet, setEditingSet] = useState<{ set: any; exerciseName: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null)
  const [mutating, setMutating] = useState(false)
  const [mutateError, setMutateError] = useState<string | null>(null)

  const [activity, setActivity] = useState<ActivityData | null>(null)
  const [isLoadingActivity, setIsLoadingActivity] = useState(true)
  const heatScrollRef = useRef<HTMLDivElement>(null)

  const [muscles, setMuscles] = useState<MusclesData | null>(null)
  const [isLoadingMuscles, setIsLoadingMuscles] = useState(false)

  // Load month data
  useEffect(() => {
    setIsLoadingMonth(true)
    calendarService.getMonth(month, year)
      .then(data => setDays(data.days ?? {}))
      .finally(() => setIsLoadingMonth(false))
  }, [month, year])

  // Load day detail when date selected
  useEffect(() => {
    if (!selectedDate) { setDayDetail(null); return }
    setIsLoadingDay(true)
    calendarService.getDay(selectedDate)
      .then(setDayDetail)
      .finally(() => setIsLoadingDay(false))
  }, [selectedDate])

  /**
   * Re-read the day and the month after an edit.
   *
   * Both, not just the day: deleting a session changes the month grid's dot and
   * its volume total as well, and leaving the grid stale showed a day still
   * marked as trained after its only workout had been removed.
   */
  const reloadAfterMutation = async () => {
    const [day, monthData] = await Promise.all([
      selectedDate ? calendarService.getDay(selectedDate) : Promise.resolve(null),
      calendarService.getMonth(month, year),
    ])
    setDayDetail(day)
    setDays(monthData.days ?? {})
  }

  const handleDeleteSession = async () => {
    if (!confirmDelete) return
    setMutating(true)
    setMutateError(null)
    try {
      await workoutService.deleteSession(confirmDelete.id)
      setConfirmDelete(null)
      setEditingSession(null)
      await reloadAfterMutation()
    } catch (err: any) {
      setMutateError(err?.response?.data?.error ?? 'Could not delete that workout.')
    } finally {
      setMutating(false)
    }
  }

  // Load activity/streak data once — needed for the header streak label too
  useEffect(() => {
    calendarService.getActivity()
      .then(setActivity)
      .finally(() => setIsLoadingActivity(false))
  }, [])

  // Lazy-load muscle balance data on first visit to the Muscles tab
  useEffect(() => {
    if (tab !== 'Muscles' || muscles) return
    setIsLoadingMuscles(true)
    calendarService.getMuscles()
      .then(setMuscles)
      .finally(() => setIsLoadingMuscles(false))
  }, [tab, muscles])

  // Scroll the heatmap to today when the Activity tab is opened
  useEffect(() => {
    if (tab === 'Activity' && activity && heatScrollRef.current) {
      heatScrollRef.current.scrollLeft = heatScrollRef.current.scrollWidth
    }
  }, [tab, activity])

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const dateKey = (day: number) =>
    `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`

  const isToday = (day: number) =>
    day === today.getDate() &&
    month === today.getMonth() + 1 &&
    year === today.getFullYear()

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return '<1 min'
    const m = Math.floor(seconds / 60)
    return m < 60 ? `${m} min` : `${Math.floor(m/60)}h ${m%60}m`
  }

  const legacyExercises = (dayDetail as any)?.exercises ?? []
  const effectiveSessions = dayDetail?.sessions
    ?? (dayDetail?.session
      ? [{
          id: 'legacy',
          dateTime: dayDetail.session.dateTime,
          duration: dayDetail.session.duration,
          totalVolume: dayDetail.session.totalVolume,
          avgRpe: dayDetail.session.avgRpe,
          exercises: legacyExercises
        }]
      : [])
  const sessionCount = dayDetail?.session?.sessionCount ?? effectiveSessions.length
  const exerciseCount = dayDetail?.session?.exerciseCount
    ?? effectiveSessions.reduce((sum, s) => sum + (s.exercises?.length ?? 0), 0)

  // Month tab summary stats, derived from the already-loaded month data
  const workoutDayCount = Object.keys(days).length
  const monthVolume = Object.values(days).reduce((sum, d) => sum + (d.totalVolume ?? 0), 0)
  const monthVolumeLabel = monthVolume >= 1000
    ? `${(monthVolume / 1000).toFixed(1)}k`
    : Math.round(monthVolume).toLocaleString()
  const monthConsistency = daysInMonth > 0
    ? Math.round((workoutDayCount / daysInMonth) * 100)
    : 0

  return (
    <div className="min-h-853 bg-dark-900 flex flex-col">

      {/* Header */}
      <div className="relative flex items-center justify-between px-5 pt-4 pb-2">
        <h1 className="text-white text-2xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2 text-brand-teal text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-brand-teal shadow-[0_0_8px_#00D4AA]" />
          {isLoadingActivity ? '…' : `${activity?.streak.current ?? 0} day streak`}
        </div>

        <CoachMark
          hintKey={HINTS.calendar}
          placement="bottom"
          className="left-5"
          title="Your history"
          body="Every session lands here. Switch to Muscles to see which areas you've been hitting — and which you've been avoiding."
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-5 mb-4">
        {(['Month', 'Activity', 'Muscles'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-full text-xs font-semibold border
                       transition-colors active:scale-95
                       ${tab === t
                         ? 'bg-brand-teal border-brand-teal text-black'
                         : 'bg-dark-800 border-dark-600 text-dark-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ============ MONTH TAB ============ */}
      {tab === 'Month' && (
        <>
          {/* Month stats */}
          <div className="flex gap-2 px-5 mb-4">
            {[
              { value: workoutDayCount, label: 'Workouts', color: 'text-brand-teal' },
              { value: `${monthVolumeLabel} kg`, label: 'Volume', color: 'text-white' },
              { value: `${monthConsistency}%`, label: 'Consistency', color: 'text-brand-green' },
            ].map(s => (
              <div key={s.label}
                className="flex-1 bg-dark-800 border border-dark-600 rounded-card px-2.5 py-2.5">
                <p className={`text-lg font-extrabold leading-none ${s.color}`}>{s.value}</p>
                <p className="text-dark-300 text-[10px] mt-1 tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Month navigator */}
          <div className="flex items-center justify-between px-5 mb-1">
            <button onClick={prevMonth}
              className="w-8 h-8 bg-dark-800 border border-dark-600 rounded-full
                         flex items-center justify-center text-white
                         active:scale-90 transition-transform">
              ‹
            </button>
            <h2 className="text-white text-lg font-bold">
              {MONTHS[month - 1]} {year}
            </h2>
            <button onClick={nextMonth}
              className="w-8 h-8 bg-dark-800 border border-dark-600 rounded-full
                         flex items-center justify-center text-white
                         active:scale-90 transition-transform">
              ›
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 px-1 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-dark-400 text-xs font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 px-2 gap-1 mb-0">
            {isLoadingMonth
              ? Array(35).fill(null).map((_, i) => (
                  <div key={i} className="h-9 w-full bg-dark-800 rounded-lg animate-pulse" />
                ))
              : cells.map((day, i) => {
                  if (!day) return <div key={i} />

                  const key     = dateKey(day)
                  const data    = days[key]
                  const today_  = isToday(day)
                  const selected = selectedDate === key

                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(selected ? null : key)}
                      className={`h-9 w-full rounded-lg flex flex-col
                                 items-center justify-center transition-all
                                 active:scale-90 relative
                                 ${selected
                                   ? 'bg-brand-teal/20 border border-brand-teal'
                                   : today_
                                   ? 'bg-dark-700 border border-dark-500'
                                   : data
                                   ? 'bg-dark-800 border border-dark-700'
                                   : 'bg-dark-900'
                                 }`}
                    >
                      <span className={`text-xs font-semibold
                        ${selected ? 'text-brand-teal'
                          : today_ ? 'text-white'
                          : data   ? 'text-white'
                          : 'text-dark-500'}`}>
                        {day}
                      </span>

                      {/* Workout dot */}
                      {data && (
                        <div
                          className="w-2 h-2 rounded-full mt-0.5"
                          style={{ background: data.color }}
                        />
                      )}
                    </button>
                  )
                })
            }
          </div>

          {/* Intensity legend */}
          <div className="flex items-center justify-center gap-4 mb-4 px-2">
            <span className="text-dark-500 text-xs">rest</span>
            <div className="flex-1 h-1.5 rounded-full"
              style={{ background: 'linear-gradient(to right, #2A2A2A, #4ADE80, #FACC15, #EF4444)' }} />
            <span className="text-dark-500 text-xs">high</span>
          </div>

          {/* Day detail panel */}
          <div className="flex-1 overflow-y-auto px-2 pb-24">

            {!selectedDate && (
              <div className="text-center py-12">
                <p className="text-dark-500 text-sm">
                  Tap a day to see workout details
                </p>
              </div>
            )}

            {selectedDate && isLoadingDay && (
              <div className="flex flex-col gap-3">
                <div className="h-32 bg-dark-800 rounded-card animate-pulse" />
                <div className="h-24 bg-dark-800 rounded-card animate-pulse" />
              </div>
            )}

            {selectedDate && !isLoadingDay && !dayDetail && (
              <div className="text-center py-8">
                <p className="text-dark-400 text-sm">No workout on this day</p>
              </div>
            )}

            {selectedDate && !isLoadingDay && dayDetail && (
              <div className="flex flex-col gap-4">

                {/* Session summary — two column with mini SVG */}
                <div className="bg-dark-800 rounded-card border border-dark-600 p-4">
                  <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
                    {new Date(selectedDate).toLocaleDateString('en-US', {
                      weekday: 'long', day: 'numeric', month: 'long'
                    })}
                  </p>

                  <div className="flex gap-3 mb-3">

                    {/* Mini SVG fatigue snapshot */}
                    <div className="w-25 flex-shrink-0">
                      <MiniMuscleMap fatigueSnapshot={dayDetail.fatigueSnapshot} />
                    </div>

                    {/* Stats */}
                    <div className="flex-1 flex flex-col justify-between">
                      <p className="text-white font-bold text-base ">
                        {exerciseCount} exercise workout
                      </p>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between">
                          <span className="text-dark-400 text-xs">Volume</span>
                          <span className="text-brand-teal text-xs font-bold">
                            {dayDetail.session.totalVolume
                              ? `${Math.round(dayDetail.session.totalVolume).toLocaleString()} kg`
                              : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dark-400 text-xs">Avg RPE</span>
                          <span className="text-brand-yellow text-xs font-bold">
                            {dayDetail.session.avgRpe ? dayDetail.session.avgRpe.toFixed(1) : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dark-400 text-xs">Duration</span>
                          <span className="text-white text-xs font-semibold">
                            {dayDetail.session.duration
                              ? formatDuration(dayDetail.session.duration)
                              : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dark-400 text-xs">Sessions</span>
                          <span className="text-white text-xs">
                            {sessionCount}
                          </span>
                        </div>

                      </div>
                    </div>

                  </div>
                  {/* Optional small legend below the SVG */}
                  <div className="flex gap-2 flex-wrap mt-1">
                    {(dayDetail.fatigueSnapshot ?? []).slice(0, 3).map((f: any) => (
                      <span key={f.muscleName}
                        className="text-[10px] text-dark-400">
                        <span style={{ color: f.color }}>●</span> {f.muscleName}
                      </span>
                    ))}
                    {(dayDetail.fatigueSnapshot?.length ?? 0) > 3 && (
                      <span className="text-[10px] text-dark-500">
                        +{(dayDetail.fatigueSnapshot?.length ?? 0) - 3} more
                      </span>
                    )}
                  </div>
                </div>


                {/* Exercises list */}
                <div>
                  <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
                    Exercises ({exerciseCount})
                  </p>

                  <div className="flex flex-col gap-4">
                    {effectiveSessions.map((session, sIdx) => (
                      <div key={session.id} className="flex flex-col gap-3">
                        {/* Swipe left for the bin, right to correct sets.
                            SwipeActions stops the gesture propagating, so this
                            never also slides Calendar to another tab. */}
                        <SwipeActions
                          onDelete={() => setConfirmDelete({
                            id: session.id,
                            label: `Session ${sIdx + 1}`,
                          })}
                          onEdit={() => setEditingSession(
                            editingSession === session.id ? null : session.id
                          )}
                          editLabel={editingSession === session.id ? 'Done' : 'Edit'}
                        >
                          <div className="flex items-center justify-between px-3 py-2.5">
                            <p className="text-dark-400 text-xs uppercase tracking-wider">
                              Session {sIdx + 1} · {new Date(session.dateTime)
                                .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <span className="text-dark-500 text-xs">
                              {session.totalVolume
                                ? `${Math.round(session.totalVolume).toLocaleString()} kg`
                                : '—'}
                            </span>
                          </div>
                        </SwipeActions>

                        {editingSession === session.id && (
                          <p className="text-brand-teal text-[11px] px-1 -mt-1">
                            Tap a set to correct or remove it. Fatigue and readiness
                            are rebuilt from what you change.
                          </p>
                        )}

                        {session.exercises.length === 0 && (
                          <div className="bg-dark-800 border border-dark-600 rounded-card p-4">
                            <p className="text-dark-400 text-sm">No sets logged in this session</p>
                          </div>
                        )}

                        {session.exercises.map((ex: any, idx: number) => {
                          const key = `${session.id}-${ex.name}-${idx}`
                          const isExpanded = expandedExercise === key
                          const totalSets  = ex.sets.length
                          const totalVol   = ex.sets.reduce((sum: number, s: any) =>
                            sum + (s.strength ? s.strength.reps * s.strength.weight : 0), 0)

                          // A cardio entry is a run, not a set table: reps and
                          // weight columns are empty for every row of it, and
                          // the distance, the pace and the route are the whole
                          // record of what happened.
                          const cardioSets = ex.sets.filter((s: any) => s.cardio)
                          const isCardio   = cardioSets.length > 0
                          const cardioKm   = cardioSets.reduce(
                            (sum: number, s: any) => sum + (s.cardio?.distance ?? 0), 0)
                          const cardioSec  = cardioSets.reduce(
                            (sum: number, s: any) => sum + (s.cardio?.time ?? 0), 0)

                          return (
                            <div key={key}
                              className="bg-dark-800 border border-dark-600 rounded-card overflow-hidden">

                              {/* Exercise header — tap to expand */}
                              <button
                                onClick={() => setExpandedExercise(isExpanded ? null : key)}
                                className="w-full flex items-center gap-3 p-4 text-left"
                              >
                                <div className="w-10 h-10 bg-dark-700 rounded-xl
                                                flex items-center justify-center text-lg flex-shrink-0">
                                  {isCardio ? '🏃' : '💪'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-semibold text-sm">{ex.name}</p>
                                  <p className="text-dark-400 text-xs mt-0.5">
                                    {isCardio ? (
                                      <>
                                        {cardioKm.toFixed(2)} km · {fmtTime(cardioSec)}
                                        {cardioKm > 0 && cardioSec > 0
                                          ? ` · ${fmtTime(cardioSec / cardioKm)} /km`
                                          : ''}
                                      </>
                                    ) : (
                                      <>
                                        {totalSets} sets
                                        {totalVol > 0 ? ` · ${Math.round(totalVol).toLocaleString()} kg` : ''}
                                      </>
                                    )}
                                  </p>
                                </div>
                                <span className={`text-dark-400 text-sm transition-transform
                                  ${isExpanded ? 'rotate-180' : ''}`}>
                                  ▾
                                </span>
                              </button>

                              {/* Expanded — a run, or a set table */}
                              {isExpanded && isCardio && (
                                <div className="border-t border-dark-700 px-4 py-3 flex flex-col gap-2">
                                  {cardioSets.map((s: any) => {
                                    // Average pace comes from the stored run when there is
                                    // one — it was computed from unrounded metres. Falling
                                    // back to the rounded display distance costs a second
                                    // or two on a short run, which is better than nothing.
                                    const paceSec = s.run?.avgPaceSec
                                      ?? (s.cardio?.distance > 0 && s.cardio?.time > 0
                                          ? s.cardio.time / s.cardio.distance
                                          : 0)

                                    return (
                                      <div key={s.id}
                                        className="bg-dark-700/60 border border-dark-600 rounded-btn px-3.5 py-3">
                                        <div className="flex items-center gap-3">
                                          {[
                                            { v: `${(s.cardio?.distance ?? 0).toFixed(2)}`, u: 'km' },
                                            { v: fmtTime(s.cardio?.time ?? 0), u: 'time' },
                                            { v: fmtTime(paceSec), u: 'avg / km' },
                                            ...(s.run?.elevationGainM
                                              ? [{ v: `${s.run.elevationGainM}`, u: 'm climb' }]
                                              : []),
                                          ].map(stat => (
                                            <div key={stat.u} className="flex-1 min-w-0 text-center">
                                              <p className="text-white text-[15px] font-extrabold tabular-nums">
                                                {stat.v}
                                              </p>
                                              <p className="text-dark-400 text-[9.5px] mt-0.5">{stat.u}</p>
                                            </div>
                                          ))}
                                        </div>

                                        {/* Only offer the route when one was recorded.
                                            A button that opens an empty map is worse
                                            than no button. */}
                                        {s.run ? (
                                          <button
                                            onClick={() => setOpenRun({ setId: s.id, title: ex.name })}
                                            className="w-full mt-2.5 py-2.5 rounded-btn border border-brand-teal/40
                                                       bg-[#0d2218] text-brand-teal text-xs font-bold
                                                       active:scale-[0.99] transition-transform"
                                          >
                                            {s.run.source === 'manual'
                                              ? 'Splits →'
                                              : 'Route & splits →'}
                                          </button>
                                        ) : (
                                          <p className="text-dark-500 text-[11px] text-center mt-2">
                                            No route recorded for this one
                                          </p>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                              {/* Expanded set table */}
                              {isExpanded && !isCardio && (
                                <div className="border-t border-dark-700 px-4 pb-1">

                                  {/* Table header */}
                                  <div className="grid grid-cols-4 gap-1 py-2 mb-1">
                                    {['Set', 'Reps', 'Weight', 'RPE'].map(h => (
                                      <p key={h}
                                        className="text-dark-500 text-xs uppercase
                                                   text-center">
                                        {h}
                                      </p>
                                    ))}
                                  </div>

                                  {/* Set rows */}
                                  {ex.sets.map((s: any, si: number) => (
                                    <div key={si}
                                      onClick={() => {
                                        if (editingSession === session.id) {
                                          setEditingSet({ set: s, exerciseName: ex.name })
                                        }
                                      }}
                                      className={`grid grid-cols-4 gap-1 mb-0.5 ${
                                        editingSession === session.id
                                          ? 'cursor-pointer ring-1 ring-brand-teal/30 rounded-lg'
                                          : ''
                                      }`}>
                                      <div className="bg-dark-700 rounded-lg py-2 text-center">
                                        <span className="text-dark-300 text-xs font-semibold">
                                          {s.setNumber}
                                        </span>
                                      </div>
                                      <div className="bg-dark-700 rounded-lg py-2 text-center">
                                        <span className="text-white text-xs">
                                          {s.strength?.reps ?? s.calisthenics?.reps ?? '—'}
                                        </span>
                                      </div>
                                      <div className="bg-dark-700 rounded-lg py-2 text-center">
                                        <span className="text-white text-xs">
                                          {s.strength?.weight
                                            ? `${s.strength.weight}kg`
                                            : s.cardio?.distance
                                            ? `${s.cardio.distance}km`
                                            : '—'}
                                        </span>
                                      </div>
                                      <div className="bg-dark-700 rounded-lg py-2 text-center">
                                        <span className="text-xs font-semibold"
                                          style={{
                                            color: s.rpe >= 9 ? '#EF4444'
                                              : s.rpe >= 7 ? '#FACC15'
                                              : '#4ADE80'
                                          }}>
                                          {s.rpe ?? '—'}
                                        </span>
                                      </div>
                                    </div>
                                  ))}

                                  {/* Exercise volume total */}
                                  {totalVol > 0 && (
                                    <div className="mt-2 flex justify-between
                                                    bg-[#0d2218] rounded-lg px-3 py-2
                                                    border border-brand-teal/20">
                                      <span className="text-dark-400 text-xs">Total volume</span>
                                      <span className="text-brand-teal text-xs font-bold">
                                        {Math.round(totalVol).toLocaleString()} kg
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ============ ACTIVITY TAB ============ */}
      {tab === 'Activity' && (
        <div className="flex-1 overflow-y-auto px-5 pb-24">

          <div className="flex items-center justify-between mb-3">
            <p className="text-white text-[15px] font-bold">Training streak</p>
            <p className="text-dark-300 text-xs">Last 12 months</p>
          </div>

          {isLoadingActivity && (
            <div className="h-40 bg-dark-800 rounded-card animate-pulse" />
          )}

          {!isLoadingActivity && activity && (
            <>
              <div className="bg-dark-800 border border-dark-600 rounded-card px-1 py-3.5">
                <div className="flex gap-1.5">
                  {/* Weekday labels */}
                  <div className="flex flex-col gap-[3px] pt-4 flex-shrink-0">
                    {DAYS.map((dl, i) => (
                      <div key={i} className="h-[13px] text-[9px] text-dark-400 flex items-center">
                        {dl}
                      </div>
                    ))}
                  </div>

                  {/* Heatmap */}
                  <div ref={heatScrollRef} className="overflow-x-auto flex-1 min-w-0 pb-1 no-scrollbar">
                    {/* Trailing padding gives the last (current) month's label room to
                        overflow its 13px column without being clipped by the scroll
                        boundary — without it, the label the view auto-scrolls to by
                        default gets cut off / appears to vanish while scrolling. */}
                    <div className="pr-8">
                      <div className="flex gap-[13px] mb-[3px]">
                        {activity.weeks.map((wk, wi) => (
                          <div key={wi} className="w-[13px] text-[9px] text-dark-400 whitespace-nowrap">
                            {wk.monthLabel}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-[3px]">
                        {activity.weeks.map((wk, wi) => (
                          <div key={wi} className="flex flex-col gap-[3px]">
                            {wk.days.map((d, di) => (
                              <div
                                key={di}
                                title={d.future ? '' : `${d.date} · ${d.level ? 'trained' : 'rest'}`}
                                className={`w-[13px] h-[13px] rounded-[3px] border
                                  ${d.future
                                    ? 'bg-transparent border-transparent'
                                    : `${heatClass(d.level)} ${d.level === 0 ? 'border-dark-600' : 'border-transparent'}`}`}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1 mt-3 text-[10px] text-dark-400">
                  <span>Less</span>
                  {[0,1,2,3,4].map(l => (
                    <div key={l} className={`w-3 h-3 rounded-[3px] ${heatClass(l)}`} />
                  ))}
                  <span>More</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mt-4">
                {[
                  { label: 'Current streak', value: `${activity.streak.current}d`, color: 'text-brand-teal', sub: "🔥 don't break it" },
                  { label: 'Longest streak', value: `${activity.streak.longest}d`, color: 'text-brand-orange', sub: 'personal best' },
                  { label: 'This year', value: `${activity.streak.totalThisYear}`, color: 'text-white', sub: 'workouts logged' },
                  { label: 'Consistency', value: `${activity.streak.consistencyPct}%`, color: 'text-brand-green', sub: 'of days active' },
                ].map(c => (
                  <div key={c.label} className="bg-dark-800 border border-dark-600 rounded-card p-3.5">
                    <p className="text-dark-300 text-xs mb-2">{c.label}</p>
                    <p className={`text-2xl font-extrabold leading-none ${c.color}`}>{c.value}</p>
                    <p className="text-dark-400 text-[11px] mt-1.5">{c.sub}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 bg-[#0a2a22] border border-brand-teal/30 rounded-card p-3.5">
                <div className="flex gap-2.5">
                  <span className="text-xl">🔥</span>
                  <div>
                    <p className="text-brand-teal text-sm font-bold mb-0.5">Keep the chain alive</p>
                    <p className="text-dark-200 text-xs leading-relaxed">
                      You're on a {activity.streak.current}-day run. Train today to reach {activity.streak.current + 1}
                      {activity.streak.longest - activity.streak.current > 0
                        ? ` and stay ${activity.streak.longest - activity.streak.current} days from your record.`
                        : ' and stay at your all-time best.'}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ MUSCLES TAB ============ */}
      {tab === 'Muscles' && (
        <div className="flex-1 overflow-y-auto px-5 pb-24">

          <div className="flex items-center justify-between mb-1.5">
            <p className="text-white text-[15px] font-bold">Muscle balance</p>
            <p className="text-dark-300 text-xs">Sets · last 8 weeks</p>
          </div>
          <p className="text-dark-400 text-xs leading-relaxed mb-3.5">
            Spot muscles you over- or under-train at a glance.
          </p>

          {isLoadingMuscles && (
            <div className="h-52 bg-dark-800 rounded-card animate-pulse" />
          )}

          {!isLoadingMuscles && muscles && (
            <>
              <div className="bg-dark-800 border border-dark-600 rounded-card px-3 py-3.5">
                <div className="flex justify-end gap-[3px] mb-1.5 pl-[74px]">
                  {muscles.weekHeads.map((wh, i) => (
                    <div key={i} className="flex-1 text-center text-[9px] text-dark-400">{wh}</div>
                  ))}
                </div>
                <div className="flex flex-col gap-1.5">
                  {muscles.muscleRows.map(row => (
                    <div key={row.name} className="flex items-center gap-[3px]">
                      <div className="w-[74px] text-xs text-dark-200 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColor(row.status)}`} />
                        {row.name}
                      </div>
                      {row.cells.map((n, ci) => (
                        <div
                          key={ci}
                          title={`${row.name} · week ${ci - 7}: ${n} sets`}
                          className={`flex-1 h-[22px] rounded flex items-center justify-center
                                     text-[10px] font-bold ${cellClass(n)}
                                     ${n > 10 ? 'text-black' : 'text-dark-300'}`}
                        >
                          {n || ''}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 bg-[#2a2000] border border-brand-yellow/35 rounded-card p-3.5">
                <div className="flex gap-2.5">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="text-brand-yellow text-sm font-bold mb-0.5">Imbalance detected</p>
                    <p className="text-dark-200 text-xs leading-relaxed">{muscles.muscleInsight}</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 bg-[#0a2a22] border border-brand-teal/30 rounded-card p-3.5">
                <div className="flex gap-2.5">
                  <span className="text-xl">🤖</span>
                  <div>
                    <p className="text-brand-teal text-sm font-bold mb-0.5">AI coach · today</p>
                    <p className="text-dark-200 text-xs leading-relaxed">{muscles.coachTip}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* The route, over everything. Its own layer rather than a route change:
          closing it must put the athlete back on the same day, scrolled to the
          same place, with the same exercise still expanded. */}
      {openRun && (
        <Suspense fallback={null}>
          <RunDetail
            setId={openRun.setId}
            title={openRun.title}
            onClose={() => setOpenRun(null)}
          />
        </Suspense>
      )}

      {editingSet && (
        <SetEditSheet
          set={editingSet.set}
          exerciseName={editingSet.exerciseName}
          onSaved={async () => {
            setEditingSet(null)
            await reloadAfterMutation()
          }}
          onClose={() => setEditingSet(null)}
        />
      )}

      {/* z-60: BottomNav is fixed at z-50 and renders after <main>, so at equal
          z-index it paints over the dialog and eats the confirm button. */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-[340px] bg-dark-800 border border-dark-600
                          rounded-card p-5">
            <p className="text-white text-base font-bold">Delete {confirmDelete.label}?</p>
            <p className="text-dark-400 text-xs mt-2 leading-relaxed">
              Every set in it is removed, and the fatigue it caused is reversed —
              your readiness and muscle map will change. This cannot be undone.
            </p>

            {mutateError && (
              <p className="text-brand-red text-xs mt-3">{mutateError}</p>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setConfirmDelete(null); setMutateError(null) }}
                disabled={mutating}
                className="flex-1 py-3 rounded-btn bg-dark-700 border border-dark-600
                           text-dark-200 text-sm font-bold disabled:opacity-40"
              >
                Keep it
              </button>
              <button
                onClick={handleDeleteSession}
                disabled={mutating}
                className="flex-1 py-3 rounded-btn bg-brand-red text-white text-sm font-bold
                           active:scale-95 transition-transform disabled:opacity-40"
              >
                {mutating ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

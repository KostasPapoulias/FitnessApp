import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { calendarService } from '../services/calendar.service'
import MiniMuscleMap from '../components/muscle/MiniMuscleMap'
import { fmtTime } from './Workout/helpers'
import SwipeActions from '../components/SwipeActions'
import SetEditSheet from '../components/workout/SetEditSheet'
import ExerciseSetsSheet from '../components/workout/ExerciseSetsSheet'
import { workoutService } from '../services/workout.service'
import ChunkBoundary from '../components/ChunkBoundary'
import { lazyRetry } from '../lib/lazyRetry'
import { useT } from '../i18n'
import { AlertTriangleIcon, FlameIcon, ModalityIcon, NoteIcon, PencilIcon, TrashIcon } from '../components/icons'

// Lazy: RunDetail pulls in MapLibre, loaded only when a route is opened.
const RunDetail = lazyRetry(() => import('../components/RunDetail'))

// Weekday names from Intl, in the grid's column order (1 Jan 2023 was a Sunday).
const weekdayNamesFor = (intl: string) =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(intl, { weekday: 'short' }).format(new Date(2023, 0, 1 + i)))

// Tab identity; labels are looked up for display.
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
  const { t, tn, num, intl } = useT()
  const today = new Date()
  const [tab, setTab] = useState<Tab>('Month')

  // `?date=YYYY-MM-DD` opens a day directly (used by History). Read once on mount.
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
  /**
   * The exercise whose sets sheet is open, as ids — the sheet re-reads the day
   * so it follows edits.
   */
  const [openExercise, setOpenExercise] =
    useState<{ sessionId: string; index: number } | null>(null)
  const [confirmDeleteSet, setConfirmDeleteSet] =
    useState<{ set: any; exerciseName: string } | null>(null)
  /** The run whose route is open over the calendar, if any. */
  const [openRun, setOpenRun] = useState<{ setId: string; title: string } | null>(null)
  // The session whose sets are editable; off by default
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

  const weekdayNames = useMemo(() => weekdayNamesFor(intl), [intl])
  const tabLabels: Record<Tab, string> = {
    Month: t('calendar.tabMonth'),
    Activity: t('calendar.tabActivity'),
    Muscles: t('calendar.tabMuscles'),
  }

  useEffect(() => {
    setIsLoadingMonth(true)
    calendarService.getMonth(month, year)
      .then(data => setDays(data.days ?? {}))
      .finally(() => setIsLoadingMonth(false))
  }, [month, year])

  useEffect(() => {
    if (!selectedDate) { setDayDetail(null); return }
    setIsLoadingDay(true)
    calendarService.getDay(selectedDate)
      .then(setDayDetail)
      .finally(() => setIsLoadingDay(false))
  }, [selectedDate])

  /** Re-read the day and the month after an edit (the month grid changes too). */
  const reloadAfterMutation = async () => {
    const [day, monthData] = await Promise.all([
      selectedDate ? calendarService.getDay(selectedDate) : Promise.resolve(null),
      calendarService.getMonth(month, year),
    ])
    setDayDetail(day)
    setDays(monthData.days ?? {})
  }

  // Re-read from the current day on each render, so the sheet follows edits
  const openExerciseData = openExercise
    ? dayDetail?.sessions
        .find(s => s.id === openExercise.sessionId)
        ?.exercises[openExercise.index] ?? null
    : null

  /**
   * Save a note, then patch it into the loaded day (notes change nothing else,
   * so no reload). Resolves false on failure, for the "Not synced" marker.
   */
  const handleSaveNotes = async (sessionId: string, exercise: any, notes: string) => {
    if (!exercise.workoutExerciseId) return false
    try {
      await workoutService.updateExerciseNotes(sessionId, exercise.workoutExerciseId, notes)
    } catch {
      return false
    }
    // The server stores a cleared note as null
    const stored = notes.trim() || null
    setDayDetail(prev => prev && {
      ...prev,
      sessions: prev.sessions.map(s => s.id !== sessionId ? s : {
        ...s,
        exercises: s.exercises.map(e =>
          e.workoutExerciseId === exercise.workoutExerciseId ? { ...e, notes: stored } : e
        ),
      }),
    })
    return true
  }

  const handleDeleteSet = async () => {
    if (!confirmDeleteSet) return
    setMutating(true)
    setMutateError(null)
    try {
      await workoutService.deleteSet(confirmDeleteSet.set.id)
      setConfirmDeleteSet(null)
      await reloadAfterMutation()
    } catch (err: any) {
      setMutateError(err?.response?.data?.error ?? t('calendar.removeSetFailed'))
    } finally {
      setMutating(false)
    }
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
      setMutateError(err?.response?.data?.error ?? t('calendar.deleteSessionFailed'))
    } finally {
      setMutating(false)
    }
  }

  // Activity and streak data, loaded once (the header uses it too)
  useEffect(() => {
    calendarService.getActivity()
      .then(setActivity)
      .finally(() => setIsLoadingActivity(false))
  }, [])

  // Muscle balance data, loaded on first visit to its tab
  useEffect(() => {
    if (tab !== 'Muscles' || muscles) return
    setIsLoadingMuscles(true)
    calendarService.getMuscles()
      .then(setMuscles)
      .finally(() => setIsLoadingMuscles(false))
  }, [tab, muscles])

  // Scroll the heatmap to today when the Activity tab opens
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
    if (seconds < 60) return t('calendar.underMinute')
    const m = Math.floor(seconds / 60)
    return m < 60
      ? t('calendar.minutes', { count: m })
      : t('calendar.hoursMinutes', { hours: Math.floor(m / 60), minutes: m % 60 })
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
    ? `${num(monthVolume / 1000)}k`
    : Math.round(monthVolume).toLocaleString(intl)
  const monthConsistency = daysInMonth > 0
    ? Math.round((workoutDayCount / daysInMonth) * 100)
    : 0

  return (
    <div className="flex-1 bg-dark-900 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h1 className="text-white text-2xl font-bold">{t('calendar.title')}</h1>
        <div className="flex items-center gap-2 text-brand-teal text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-brand-teal shadow-[0_0_8px_#00D4AA]" />
          {isLoadingActivity ? '…' : tn('calendar.streak', activity?.streak.current ?? 0)}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-5 mb-4">
        {(['Month', 'Activity', 'Muscles'] as Tab[]).map(t_ => (
          <button
            key={t_}
            onClick={() => setTab(t_)}
            className={`flex-1 py-2 rounded-full text-xs font-semibold border
                       transition-colors active:scale-95
                       ${tab === t_
                         ? 'bg-brand-teal border-brand-teal text-black'
                         : 'bg-dark-800 border-dark-600 text-dark-300'}`}
          >
            {tabLabels[t_]}
          </button>
        ))}
      </div>

      {/* ============ MONTH TAB ============ */}
      {tab === 'Month' && (
        <>
          {/* Month stats */}
          <div className="flex gap-2 px-5 mb-4">
            {[
              { value: workoutDayCount, label: t('calendar.workouts'), color: 'text-brand-teal' },
              { value: `${monthVolumeLabel} kg`, label: t('calendar.volume'), color: 'text-white' },
              { value: `${monthConsistency}%`, label: t('calendar.consistency'), color: 'text-brand-green' },
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
              {new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric' })
                .format(new Date(year, month - 1, 1))}
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
            {weekdayNames.map(d => (
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
            <span className="text-dark-500 text-xs">{t('calendar.intensityRest')}</span>
            <div className="flex-1 h-1.5 rounded-full"
              style={{ background: 'linear-gradient(to right, #2A2A2A, #4ADE80, #FACC15, #EF4444)' }} />
            <span className="text-dark-500 text-xs">{t('calendar.intensityHigh')}</span>
          </div>

          {/* Day detail panel */}
          <div className="flex-1 overflow-y-auto px-2 pb-6">

            {!selectedDate && (
              <div className="text-center py-12">
                <p className="text-dark-500 text-sm">{t('calendar.tapDay')}</p>
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
                <p className="text-dark-400 text-sm">{t('calendar.noWorkout')}</p>
              </div>
            )}

            {selectedDate && !isLoadingDay && dayDetail && (
              <div className="flex flex-col gap-4">

                {/* Session summary with the mini body map */}
                <div className="bg-dark-800 rounded-card border border-dark-600 p-4">
                  <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
                    {new Date(selectedDate).toLocaleDateString(intl, {
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
                        {tn('calendar.exerciseWorkout', exerciseCount)}
                      </p>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between">
                          <span className="text-dark-400 text-xs">{t('calendar.volume')}</span>
                          <span className="text-brand-teal text-xs font-bold">
                            {dayDetail.session.totalVolume
                              ? `${Math.round(dayDetail.session.totalVolume).toLocaleString(intl)} kg`
                              : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dark-400 text-xs">{t('calendar.avgRpe')}</span>
                          <span className="text-brand-yellow text-xs font-bold">
                            {dayDetail.session.avgRpe ? num(dayDetail.session.avgRpe) : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dark-400 text-xs">{t('calendar.duration')}</span>
                          <span className="text-white text-xs font-semibold">
                            {dayDetail.session.duration
                              ? formatDuration(dayDetail.session.duration)
                              : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dark-400 text-xs">{t('calendar.sessions')}</span>
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
                        {t('calendar.morePlus', { count: (dayDetail.fatigueSnapshot?.length ?? 0) - 3 })}
                      </span>
                    )}
                  </div>
                </div>


                {/* Exercises list */}
                <div>
                  <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
                    {t('calendar.exercises', { count: exerciseCount })}
                  </p>

                  <div className="flex flex-col gap-4">
                    {effectiveSessions.map((session, sIdx) => (
                      <div key={session.id} className="flex flex-col gap-3">
                        {/* Swipe left for delete, right to edit sets */}
                        <SwipeActions
                          left={{
                            label: editingSession === session.id ? t('calendar.editDone') : t('calendar.edit'),
                            icon: <PencilIcon className="w-4 h-4" />,
                            onSelect: () => setEditingSession(
                              editingSession === session.id ? null : session.id
                            ),
                          }}
                          right={{
                            label: t('common.delete'), icon: <TrashIcon className="w-4 h-4" />, tone: 'danger',
                            onSelect: () => setConfirmDelete({
                              id: session.id,
                              label: t('calendar.session', { number: sIdx + 1 }),
                            }),
                          }}
                        >
                          <div className="flex items-center justify-between px-3 py-2.5">
                            <p className="text-dark-400 text-xs uppercase tracking-wider">
                              {t('calendar.session', { number: sIdx + 1 })} · {new Date(session.dateTime)
                                .toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <span className="text-dark-500 text-xs">
                              {session.totalVolume
                                ? `${Math.round(session.totalVolume).toLocaleString(intl)} kg`
                                : '—'}
                            </span>
                          </div>
                        </SwipeActions>

                        {editingSession === session.id && (
                          <p className="text-brand-teal text-[11px] px-1 -mt-1">
                            {t('calendar.editHint')}
                          </p>
                        )}

                        {session.exercises.length === 0 && (
                          <div className="bg-dark-800 border border-dark-600 rounded-card p-4">
                            <p className="text-dark-400 text-sm">{t('calendar.noSets')}</p>
                          </div>
                        )}

                        {session.exercises.map((ex: any, idx: number) => {
                          const key = `${session.id}-${ex.name}-${idx}`
                          const totalSets  = ex.sets.length
                          const totalVol   = ex.sets.reduce((sum: number, s: any) =>
                            sum + (s.strength ? s.strength.reps * s.strength.weight : 0), 0)

                          // Cardio entries show distance and pace, not a set table
                          const cardioSets = ex.sets.filter((s: any) => s.cardio)
                          const isCardio   = cardioSets.length > 0
                          const cardioKm   = cardioSets.reduce(
                            (sum: number, s: any) => sum + (s.cardio?.distance ?? 0), 0)
                          const cardioSec  = cardioSets.reduce(
                            (sum: number, s: any) => sum + (s.cardio?.time ?? 0), 0)

                          return (
                            <div key={key}
                              className="bg-dark-800 border border-dark-600 rounded-card overflow-hidden">

                              {/* Tap to open the sets in a sheet */}
                              <button
                                onClick={() => setOpenExercise({ sessionId: session.id, index: idx })}
                                className="w-full flex items-center gap-3 p-4 text-left
                                           active:bg-dark-700/40 transition-colors"
                              >
                                <div className="w-10 h-10 bg-dark-700 rounded-xl
                                                flex items-center justify-center text-lg flex-shrink-0">
                                  <ModalityIcon
                                    modality={isCardio ? 'Cardio' : 'Strength'}
                                    className="w-5 h-5 text-brand-teal"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-semibold text-sm">{ex.name}</p>
                                  <p className="text-dark-400 text-xs mt-0.5">
                                    {isCardio ? (
                                      <>
                                        {num(cardioKm, 2)} km · {fmtTime(cardioSec)}
                                        {cardioKm > 0 && cardioSec > 0
                                          ? ` · ${fmtTime(cardioSec / cardioKm)} /km`
                                          : ''}
                                      </>
                                    ) : (
                                      <>
                                        {tn('calendar.sets', totalSets)}
                                        {totalVol > 0 ? ` · ${Math.round(totalVol).toLocaleString(intl)} kg` : ''}
                                      </>
                                    )}
                                  </p>
                                </div>
                                <span className="text-dark-500 text-base">›</span>
                              </button>

                              {/* The note, clamped; part of the same tap target */}
                              {ex.notes && (
                                <button
                                  onClick={() => setOpenExercise({ sessionId: session.id, index: idx })}
                                  className="w-full flex items-start gap-2 px-4 pb-3.5 -mt-1 text-left"
                                >
                                  <NoteIcon className="w-3.5 h-3.5 text-dark-400 flex-shrink-0 mt-[3px]" />
                                  <span className="text-dark-300 text-xs leading-5 line-clamp-2 break-words min-w-0">
                                    {ex.notes}
                                  </span>
                                </button>
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
        <div className="flex-1 overflow-y-auto px-5 pb-6">

          <div className="flex items-center justify-between mb-3">
            <p className="text-white text-[15px] font-bold">{t('calendar.streakTitle')}</p>
            <p className="text-dark-300 text-xs">{t('calendar.last12Months')}</p>
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
                    {weekdayNames.map((dl, i) => (
                      <div key={i} className="h-[13px] text-[9px] text-dark-400 flex items-center">
                        {dl}
                      </div>
                    ))}
                  </div>

                  {/* Heatmap */}
                  <div ref={heatScrollRef} className="overflow-x-auto flex-1 min-w-0 pb-1 no-scrollbar">
                    {/* Trailing padding so the current month's label isn't clipped */}
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
                                title={d.future ? '' : `${d.date} · ${d.level ? t('calendar.dayTrained') : t('calendar.dayRest')}`}
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
                  <span>{t('calendar.heatLess')}</span>
                  {[0,1,2,3,4].map(l => (
                    <div key={l} className={`w-3 h-3 rounded-[3px] ${heatClass(l)}`} />
                  ))}
                  <span>{t('calendar.heatMore')}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mt-4">
                {[
                  { label: t('calendar.currentStreak'), value: t('calendar.days', { count: activity.streak.current }), color: 'text-brand-teal', sub: t('calendar.currentStreakSub') },
                  { label: t('calendar.longestStreak'), value: t('calendar.days', { count: activity.streak.longest }), color: 'text-brand-orange', sub: t('calendar.longestStreakSub') },
                  { label: t('calendar.thisYear'), value: `${activity.streak.totalThisYear}`, color: 'text-white', sub: t('calendar.thisYearSub') },
                  { label: t('calendar.consistency'), value: `${activity.streak.consistencyPct}%`, color: 'text-brand-green', sub: t('calendar.consistencySub') },
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
                  <FlameIcon className="w-5 h-5 text-brand-teal flex-shrink-0" />
                  <div>
                    <p className="text-brand-teal text-sm font-bold mb-0.5">{t('calendar.keepChain')}</p>
                    <p className="text-dark-200 text-xs leading-relaxed">
                      {activity.streak.longest - activity.streak.current > 0
                        ? t('calendar.chainRecord', {
                            days: activity.streak.current,
                            next: activity.streak.current + 1,
                            gap: activity.streak.longest - activity.streak.current,
                          })
                        : t('calendar.chainBest', {
                            days: activity.streak.current,
                            next: activity.streak.current + 1,
                          })}
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
        <div className="flex-1 overflow-y-auto px-5 pb-6">

          <div className="flex items-center justify-between mb-1.5">
            <p className="text-white text-[15px] font-bold">{t('calendar.muscleBalance')}</p>
            <p className="text-dark-300 text-xs">{t('calendar.setsLast8')}</p>
          </div>
          <p className="text-dark-400 text-xs leading-relaxed mb-3.5">
            {t('calendar.muscleBlurb')}
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
                          title={t('calendar.cellTooltip', { muscle: row.name, week: ci - 7, sets: n })}
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
                  <AlertTriangleIcon className="w-5 h-5 text-brand-yellow flex-shrink-0" />
                  <div>
                    <p className="text-brand-yellow text-sm font-bold mb-0.5">{t('calendar.imbalance')}</p>
                    <p className="text-dark-200 text-xs leading-relaxed">{muscles.muscleInsight}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* The run's route as an overlay (z-[70]), so closing it returns to the same day and sheet */}
      {openRun && (
        // A failed chunk only closes the sheet
        <ChunkBoundary
          label="run-detail"
          fallback={retry => (
            <div className="fixed inset-0 z-[70] bg-dark-900 flex flex-col items-center justify-center gap-3 px-8 text-center">
              <p className="text-[15px] font-bold text-white">{t('calendar.runFailTitle')}</p>
              <p className="text-[12.5px] text-dark-300">{t('calendar.runFailBody')}</p>
              <div className="flex gap-2 mt-1">
                <button onClick={retry}
                  className="px-4 py-2.5 rounded-btn bg-brand-teal text-black text-[13px] font-extrabold">
                  {t('common.tryAgain')}
                </button>
                <button onClick={() => setOpenRun(null)}
                  className="px-4 py-2.5 rounded-btn border border-dark-600 bg-dark-800 text-dark-200 text-[13px] font-bold">
                  {t('common.close')}
                </button>
              </div>
            </div>
          )}
        >
          <Suspense fallback={null}>
            <RunDetail
              setId={openRun.setId}
              title={openRun.title}
              onClose={() => setOpenRun(null)}
            />
          </Suspense>
        </ChunkBoundary>
      )}

      {/* Before SetEditSheet: both are z-[60], and the set editor opens from this sheet */}
      {openExercise && openExerciseData && (
        <ExerciseSetsSheet
          exercise={openExerciseData}
          editable={editingSession === openExercise.sessionId}
          onPickSet={set => setEditingSet({ set, exerciseName: openExerciseData.name })}
          onDeleteSet={set => setConfirmDeleteSet({ set, exerciseName: openExerciseData.name })}
          onOpenRun={setId => setOpenRun({ setId, title: openExerciseData.name })}
          onSaveNotes={notes => handleSaveNotes(openExercise.sessionId, openExerciseData, notes)}
          onClose={() => setOpenExercise(null)}
        />
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

      {/* z-[70]: above the exercise sheet it is confirmed from */}
      {confirmDeleteSet && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6"
             data-no-page-swipe>
          <div className="absolute inset-0 bg-black/70"
               onClick={() => { setConfirmDeleteSet(null); setMutateError(null) }} />
          <div className="relative w-full max-w-[340px] bg-dark-800 border border-dark-600
                          rounded-card p-5">
            <p className="text-white text-base font-bold">
              {t('calendar.removeSetTitle', { number: confirmDeleteSet.set.setNumber })}
            </p>
            <p className="text-dark-400 text-xs mt-2 leading-relaxed">
              {t('calendar.removeSetBody', { exercise: confirmDeleteSet.exerciseName })}
            </p>

            {mutateError && <p className="text-brand-red text-xs mt-3">{mutateError}</p>}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setConfirmDeleteSet(null); setMutateError(null) }}
                disabled={mutating}
                className="flex-1 py-3 rounded-btn bg-dark-700 border border-dark-600
                           text-dark-200 text-sm font-bold disabled:opacity-40"
              >
                {t('common.keepIt')}
              </button>
              <button
                onClick={handleDeleteSet}
                disabled={mutating}
                className="flex-1 py-3 rounded-btn bg-brand-red text-white text-sm font-bold
                           active:scale-95 transition-transform disabled:opacity-40"
              >
                {mutating ? t('calendar.removing') : t('common.remove')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* z-[60]: above BottomNav */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-[340px] bg-dark-800 border border-dark-600
                          rounded-card p-5">
            <p className="text-white text-base font-bold">
              {t('calendar.deleteTitle', { label: confirmDelete.label })}
            </p>
            <p className="text-dark-400 text-xs mt-2 leading-relaxed">
              {t('calendar.deleteBody')}
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
                {t('common.keepIt')}
              </button>
              <button
                onClick={handleDeleteSession}
                disabled={mutating}
                className="flex-1 py-3 rounded-btn bg-brand-red text-white text-sm font-bold
                           active:scale-95 transition-transform disabled:opacity-40"
              >
                {mutating ? t('common.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

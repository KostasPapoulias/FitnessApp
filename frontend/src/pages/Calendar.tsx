import { useEffect, useState } from 'react'
import { calendarService } from '../services/calendar.service'
import MiniMuscleMap from '../components/muscle/MiniMuscleMap'
//import { useFatigueStore } from '../store/useFatigueStore'

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

interface DaySummary {
  sessionId: string
  totalVolume: number
  avgRpe: number
  duration: number
  intensity: string
  color: string
  exerciseCount: number
}

interface DayDetail {
  session: any
  exercises: any[]
  fatigueSnapshot: any[]
}

export default function Calendar() {
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [year,  setYear]  = useState(today.getFullYear())
  const [days,  setDays]  = useState<Record<string, DaySummary>>({})
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null)
  const [isLoadingMonth, setIsLoadingMonth] = useState(true)
  const [isLoadingDay,   setIsLoadingDay]   = useState(false)
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null)

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
    const m = Math.floor(seconds / 60)
    return m < 60 ? `${m} min` : `${Math.floor(m/60)}h ${m%60}m`
  }

  return (
    <div className="min-h-853 bg-dark-900 flex flex-col">

      {/* Header */}
      <div className="px-5 pt-4 pb-1">
        <h1 className="text-white text-2xl font-bold">Calendar</h1>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between px-5 mb-1">
        <button onClick={prevMonth}
          className="w-1 h-1 bg-dark-800 border border-dark-600 rounded-full
                     flex items-center justify-center text-white
                     active:scale-90 transition-transform">
          ‹
        </button>
        <h2 className="text-white text-lg font-bold">
          {MONTHS[month - 1]} {year}
        </h2>
        <button onClick={nextMonth}
          className="w-1 h-1 bg-dark-800 border border-dark-600 rounded-full
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
        {dayDetail.exercises.length} exercise workout
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
            {dayDetail.session.avgRpe?.toFixed(1) ?? '—'}
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
          <span className="text-dark-400 text-xs">Time</span>
          <span className="text-white text-xs">
            {new Date(dayDetail.session.dateTime)
              .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        
      </div>
    </div>
    
  </div>
  {/* Optional small legend below the SVG */}
<div className="flex gap-2 flex-wrap mt-1">
  {dayDetail.fatigueSnapshot.slice(0, 3).map((f: any) => (
    <span key={f.muscleName}
      className="text-[10px] text-dark-400">
      <span style={{ color: f.color }}>●</span> {f.muscleName}
    </span>
  ))}
  {dayDetail.fatigueSnapshot.length > 3 && (
    <span className="text-[10px] text-dark-500">
      +{dayDetail.fatigueSnapshot.length - 3} more
    </span>
  )}
</div>
</div>


            {/* Exercises list */}
            <div>
              <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
                Exercises ({dayDetail.exercises.length})
              </p>

              <div className="flex flex-col gap-3">
                {dayDetail.exercises.map((ex: any, idx: number) => {
                  const isExpanded = expandedExercise === `${ex.name}-${idx}`
                  const totalSets  = ex.sets.length
                  const totalVol   = ex.sets.reduce((sum: number, s: any) =>
                    sum + (s.strength ? s.strength.reps * s.strength.weight : 0), 0)

                  return (
                    <div key={idx}
                      className="bg-dark-800 border border-dark-600 rounded-card overflow-hidden">

                      {/* Exercise header — tap to expand */}
                      <button
                        onClick={() => setExpandedExercise(
                          isExpanded ? null : `${ex.name}-${idx}`
                        )}
                        className="w-full flex items-center gap-3 p-4 text-left"
                      >
                        <div className="w-10 h-10 bg-dark-700 rounded-xl
                                        flex items-center justify-center text-lg flex-shrink-0">
                          💪
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm">{ex.name}</p>
                          <p className="text-dark-400 text-xs mt-0.5">
                            {totalSets} sets
                            {totalVol > 0 ? ` · ${Math.round(totalVol).toLocaleString()} kg` : ''}
                          </p>
                        </div>
                        <span className={`text-dark-400 text-sm transition-transform
                          ${isExpanded ? 'rotate-180' : ''}`}>
                          ▾
                        </span>
                      </button>

                      {/* Expanded set table */}
                      {isExpanded && (
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
                              className="grid grid-cols-4 gap-1 mb-0.5">
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
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
import { Suspense, lazy, useEffect, useState } from 'react'
import { Split, splitPace } from '../lib/geo'
import { RunPayload } from '../lib/runPayload'
import { workoutService } from '../services/workout.service'
import { fmtTime } from '../pages/Workout/helpers'

/**
 * One recorded run, opened from the calendar.
 *
 * A finished run is mostly a picture — where it went and how the pace held —
 * so this is a full-screen sheet rather than a row that expands. The route is
 * fetched here and nowhere else: the day view lists every set of the day and
 * would otherwise carry a route for each one it never draws.
 */

const RouteMap = lazy(() => import('./RouteMap'))

interface Props {
  setId: string
  /** What the exercise was called, for the header. */
  title: string
  onClose: () => void
}

const MapPlaceholder = ({ label }: { label: string }) => (
  <div className="w-full h-full flex items-center justify-center
                  bg-gradient-to-br from-dark-800 to-dark-700
                  text-dark-500 text-sm">
    {label}
  </div>
)

export default function RunDetail({ setId, title, onClose }: Props) {
  const [run, setRun] = useState<RunPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    workoutService.getRunTrack(setId)
      .then(data => { if (!cancelled) setRun(data) })
      .catch(() => { if (!cancelled) setError('That run could not be loaded.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [setId])

  // Kilometres and hand-marked laps are separate lists on separate origins —
  // merged only for display, in the order they happened.
  const rows: Split[] = run
    ? [...(run.splits ?? []), ...(run.laps ?? [])].sort((a, b) => a.endMeters - b.endMeters)
    : []

  // Bars are scaled against the slowest split rather than against zero: every
  // kilometre of a run is within a minute or so of the others, and a bar from
  // zero makes a 4:30 and a 5:30 look identical.
  // The trailing partial is excluded from the scale: it is measured over a
  // couple of hundred metres, so its pace swings far wider than any full
  // kilometre's and would flatten every other bar against it.
  const paces = rows.filter(r => !r.partial).map(splitPace).filter(p => p > 0)
  const slowest = paces.length ? Math.max(...paces) : 0
  const fastest = paces.length ? Math.min(...paces) : 0
  const spread = slowest - fastest

  const stats = run ? [
    { value: (run.distanceM / 1000).toFixed(2), unit: 'km' },
    { value: fmtTime(run.durationSec), unit: 'time' },
    { value: fmtTime(run.avgPaceSec), unit: 'avg / km', accent: true },
    { value: `${run.elevationGainM}`, unit: 'm climb' },
  ] : []

  return (
    <div className="fixed inset-0 z-50 bg-dark-900 text-white overflow-y-auto"
         style={{ overscrollBehavior: 'contain' }}>
      {/* header */}
      <div className="sticky top-0 z-10 bg-dark-900/95 backdrop-blur border-b border-dark-700
                      px-4 py-3 flex items-center gap-3">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-btn border border-dark-600 bg-dark-800
                     flex items-center justify-center text-lg active:scale-90 transition-transform"
          aria-label="Back to the calendar"
        >
          ←
        </button>
        <div className="min-w-0">
          <p className="text-[10px] tracking-widest text-dark-400">RUN</p>
          <p className="text-sm font-bold truncate">{title}</p>
        </div>
      </div>

      <div className="px-4 pb-10">
        {loading && (
          <p className="text-center text-dark-400 text-sm py-16">Loading the run…</p>
        )}

        {!loading && error && (
          <p className="text-center text-brand-red text-sm py-16">{error}</p>
        )}

        {/* A cardio set logged before routes were recorded, or a treadmill
            session that never had one. Both are real sets, not errors. */}
        {!loading && !error && !run && (
          <p className="text-center text-dark-400 text-[13px] py-16 leading-relaxed">
            No route was recorded for this session.
            <br />
            Its distance and time are on the day view.
          </p>
        )}

        {run && (
          <>
            <div className="w-full h-[46vh] min-h-[240px] mt-4">
              {run.route && run.route.length > 0 ? (
                <Suspense fallback={<MapPlaceholder label="Loading map…" />}>
                  <RouteMap route={run.route} interactive className="w-full h-full" />
                </Suspense>
              ) : (
                <MapPlaceholder
                  label={run.source === 'manual'
                    ? 'No route — pace was entered by hand'
                    : 'No route recorded'}
                />
              )}
            </div>

            <div className="grid grid-cols-4 gap-1.5 mt-4">
              {stats.map(s => (
                <div key={s.unit}
                     className="bg-dark-800 border border-dark-600 rounded-card py-3 px-1 text-center">
                  <div className={`text-[18px] font-extrabold tabular-nums
                                   ${s.accent ? 'text-brand-teal' : ''}`}>
                    {s.value}
                  </div>
                  <div className="text-[9.5px] text-dark-300 mt-1">{s.unit}</div>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <div className="text-[10px] tracking-widest text-dark-400 mb-2">SPLITS</div>

              {rows.length === 0 ? (
                <p className="text-center text-[12.5px] text-dark-400 py-3">
                  Under a kilometre — no splits.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {rows.map(split => {
                    const pace = splitPace(split)
                    // Fastest fills the bar, slowest keeps a visible stub.
                    // Clamped because a partial split's pace can sit outside
                    // the range the scale was built from.
                    const fill = spread > 0
                      ? Math.max(6, Math.min(100, 18 + 82 * (1 - (pace - fastest) / spread)))
                      : 100

                    return (
                      <div key={`${split.auto ? 'km' : 'lap'}-${split.index}`}
                           className="bg-dark-800 border border-dark-600 rounded-btn px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-[26px] h-[26px] rounded-badge flex items-center
                                           justify-center text-xs font-extrabold
                                           ${split.partial
                                             ? 'bg-dark-800 text-dark-400 border border-dark-600'
                                             : 'bg-dark-700 text-dark-200'}`}>
                            {split.auto ? split.index : '⚑'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold">
                              {split.partial
                                ? `Last ${(split.meters / 1000).toFixed(2)} km`
                                : split.auto
                                ? `Km ${split.index}`
                                : `Lap · ${(split.meters / 1000).toFixed(2)} km`}
                            </div>
                            <div className="h-1.5 rounded-full bg-dark-700 overflow-hidden mt-1.5">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${fill}%`,
                                  background: pace === fastest ? '#00D4AA' : '#3f7a6d',
                                }}
                              />
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-extrabold tabular-nums">{fmtTime(pace)}</div>
                            <div className="text-[10px] text-dark-400 tabular-nums">
                              {fmtTime(split.seconds)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

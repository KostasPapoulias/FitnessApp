import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { fmtTime } from './helpers'
import { ModalityViewProps, LiveStartGate, EffortPrompt } from './LiveShared'
import { useRunTracker, RunSummary } from '../../hooks/useRunTracker'
import { useWakeLock } from '../../hooks/useWakeLock'
import { Split, averagePace, paceFromSpeed, splitPace } from '../../lib/geo'
import RunLock from './RunLock'

// MapLibre is the heaviest thing the app can load. Split out so it is fetched
// only when someone actually starts an outdoor session — a lifting workout
// never touches it.
const RouteMap = lazy(() => import('../../components/RouteMap'))

const stepBtn =
  'w-[34px] h-[34px] rounded-[9px] border border-dark-600 bg-dark-700 text-white ' +
  'text-lg font-bold flex items-center justify-center active:scale-90 transition-transform flex-shrink-0'

/** kcal per metre, matching the estimate this screen has always used. */
const KCAL_PER_METRE = 0.058

/**
 * The map's own box, shared by the map and by both of its placeholders so they
 * cannot disagree about how tall the slot is. An explicit height rather than
 * h-full on purpose — see the wrapper below.
 */
const MAP_BOX = 'w-full h-[190px]'

export default function CardioView({ onFinish }: ModalityViewProps) {
  const { selectedExercises, currentExerciseIndex, cardioTarget, completeSet } = useWorkoutStore()
  const activity = selectedExercises[currentExerciseIndex]?.exercise.name ?? 'Outdoor Run'

  const run = useRunTracker(activity)
  const wakeLock = useWakeLock()

  const [rating, setRating] = useState(false)
  const [ending, setEnding] = useState(false)
  const endingRef = useRef(false)
  const [locked, setLocked] = useState(false)
  /** Set once the athlete has answered the recovered-run prompt. */
  const [keptRecovered, setKeptRecovered] = useState(false)
  const [manualPace, setManualPace] = useState(2.85) // m/s, the effort dial
  const [summary, setSummary] = useState<RunSummary | null>(null)

  const { meters, elapsedSec, speedMps, running, started, source, status, splits, laps } = run
  const km = meters / 1000
  const cals = meters * KCAL_PER_METRE

  // The effort dial only feeds distance when there is no GPS to feed it.
  // Destructured so this tracks the dial, not every render of the screen.
  const { setManualSpeed } = run
  useEffect(() => { setManualSpeed(manualPace) }, [manualPace, setManualSpeed])

  const beginRun = () => {
    // Must happen inside the tap: iOS refuses a wake lock that is not tied to a
    // user gesture, and an effect runs after paint, outside that window.
    wakeLock.request()
    run.start()
  }

  const endRun = () => {
    // Stop the GPS and freeze the numbers before the RPE prompt, so a slow
    // rating does not keep adding metres to a run that finished.
    setSummary(run.stop())
    wakeLock.release()
    setLocked(false)
    setRating(true)
  }

  // Log a SetCardio (distance in km, time in seconds) so history + fatigue
  // record it. The RPE comes from the athlete — an easy jog and a threshold
  // effort of the same length are not the same training load.
  const endSession = async (rpe: number) => {
    // Ref guard: the summary-set request keeps this button on screen, so a
    // second tap would log the run twice and finish twice.
    if (endingRef.current) return
    endingRef.current = true
    setEnding(true)
    // A failed summary set must not strand the user in the tracker — the
    // Finish screen surfaces the error either way.
    await completeSet({
      distance: Math.round(((summary?.meters ?? meters) / 1000) * 100) / 100,
      time: summary?.elapsedSec ?? elapsedSec,
      rpe,
      restSeconds: 0,
      // The route, the splits and the pace the run was actually done at. Without
      // this the calendar has a distance and nothing else to show for the hour.
      run: summary ?? undefined,
    })
    onFinish()
  }

  /** What the athlete is doing right now — falls to zero the moment they stop. */
  const livePaceSecPerKm = paceFromSpeed(source === 'manual' ? manualPace : speedMps)
  /**
   * What the run will be remembered as.
   *
   * The finish summary uses this and not the live pace: by the time anyone taps
   * End they have stopped moving, the smoothed speed has decayed to zero, and
   * the live pace with it — which is why every finished run reported 00:00.
   */
  const avgPaceSecPerKm = summary?.avgPaceSec
    ?? averagePace(meters, elapsedSec)
  const effortLabel =
    manualPace >= 3.6 ? 'Threshold' : manualPace >= 3.0 ? 'Tempo' : manualPace >= 2.4 ? 'Easy' : 'Recovery'
  const effort = (d: number) =>
    setManualPace(v => Math.min(4.6, Math.max(1.8, Math.round((v + d) * 100) / 100)))

  const gps = {
    tracking: { ok: true, label: 'GPS locked · tracking' },
    acquiring: { ok: false, label: 'Finding GPS…' },
    weak: { ok: false, label: 'Weak GPS signal' },
    denied: { ok: false, label: 'Location off · manual pace' },
    unavailable: { ok: false, label: 'No GPS · manual pace' },
    idle: { ok: false, label: 'GPS idle' },
  }[status]

  // Kilometres and hand-marked laps are two different lists kept on two
  // different origins; they are only merged for display, newest first.
  const shownSplits = [...splits, ...laps]
    .sort((a, b) => b.endMeters - a.endMeters)
    .slice(0, 4)
    .map((sp: Split) => ({
      key: `${sp.auto ? 'km' : 'lap'}-${sp.index}`,
      badge: sp.auto ? String(sp.index) : '⚑',
      label: sp.auto ? `Km ${sp.index}` : `Lap · ${(sp.meters / 1000).toFixed(2)} km`,
      pace: `${fmtTime(splitPace(sp))} /km`,
      time: fmtTime(sp.seconds),
    }))

  // goal from the plan
  const goalLabel = cardioTarget
    ? cardioTarget.type === 'distance' ? `${cardioTarget.value} km` : fmtTime(cardioTarget.value)
    : null
  const goalProgress = cardioTarget
    ? cardioTarget.type === 'distance'
      ? Math.min(1, km / cardioTarget.value)
      : Math.min(1, elapsedSec / cardioTarget.value)
    : 0

  // ── start gate ──
  if (!started) {
    return (
      <LiveStartGate
        emoji="🏃"
        label="LIVE · CARDIO"
        title={activity}
        detail={goalLabel
          ? `Target: ${goalLabel}. Press start when you begin moving.`
          : 'Free run. Press start when you begin moving.'}
        onStart={beginRun}
      />
    )
  }

  // ── effort rating (before the set is written) ──
  if (rating) {
    return (
      <EffortPrompt
        emoji="🏃"
        label={`${activity.toUpperCase()} DONE`}
        title="Rate the effort"
        detail="Recovery is driven by how hard that felt, not just how long it took."
        summary={[
          { value: ((summary?.meters ?? meters) / 1000).toFixed(2), label: 'km' },
          { value: fmtTime(summary?.elapsedSec ?? elapsedSec), label: 'time' },
          { value: fmtTime(avgPaceSecPerKm), label: 'avg / km' },
        ]}
        initial={6}
        busy={ending}
        onConfirm={endSession}
      />
    )
  }

  // ── locked screen ──
  if (locked) {
    return (
      <RunLock
        elapsed={fmtTime(elapsedSec)}
        distanceKm={km.toFixed(2)}
        pace={fmtTime(livePaceSecPerKm)}
        avgPace={fmtTime(avgPaceSecPerKm)}
        running={running}
        statusLabel={gps.label}
        statusOk={gps.ok}
        screenAwake={wakeLock.held}
        onKeepAwake={wakeLock.request}
        onUnlock={() => setLocked(false)}
      />
    )
  }

  return (
    <div
      className="flex-1 bg-dark-900 text-white px-5 pt-4 pb-4"
      // A pull-to-refresh in a standalone PWA reloads the page. The run is
      // recovered from IndexedDB if that happens, but not losing it in the
      // first place is better.
      style={{ overscrollBehavior: 'none' }}
    >
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-brand-red text-xs font-bold tracking-wide">
          <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" />
          {running ? 'LIVE · RUNNING' : 'PAUSED · RUNNING'}
        </div>
        <div className="text-[13px] text-dark-300 font-semibold">🏃 {activity}</div>
      </div>

      {/* Recovered after a reload or an OS kill mid-run.
          Shown until it is answered, not only when the wake lock is missing: a
          resumed session arrives carrying a distance, a clock and a track from
          before, and silently adopting all three is how a stale run from an hour
          ago turns up looking like a short route nobody just ran. */}
      {run.recovered && !keptRecovered && (
        <div className="w-full mt-3 rounded-btn border border-brand-teal/40 bg-[#0a2a22] px-3.5 py-2.5">
          <p className="text-[12px] font-bold text-brand-teal">Run recovered</p>
          <p className="text-[11.5px] text-dark-200 mt-0.5 leading-snug">
            {km.toFixed(2)} km and {fmtTime(elapsedSec)} carried over from a session that
            was interrupted.
            {!wakeLock.held && ' Keeping it also puts the screen lock back on.'}
          </p>
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={() => {
                // Inside the tap: iOS grants a wake lock only from a gesture.
                wakeLock.request()
                setKeptRecovered(true)
              }}
              className="flex-1 py-2 rounded-btn bg-brand-teal text-black text-[12px] font-extrabold
                         active:scale-95 transition-transform"
            >
              Keep it
            </button>
            <button
              onClick={run.discard}
              className="flex-1 py-2 rounded-btn border border-dark-600 bg-dark-800 text-dark-200
                         text-[12px] font-bold active:scale-95 transition-transform"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* big elapsed */}
      <div className="text-center mt-3.5">
        <div className="text-[11px] tracking-[0.1em] text-dark-300">ELAPSED</div>
        <div className="text-[66px] font-extrabold leading-[1.05] tracking-tight tabular-nums">
          {fmtTime(elapsedSec)}
        </div>
      </div>

      {/* goal progress */}
      {goalLabel && (
        <div className="mt-2">
          <div className="flex justify-between text-[11px] text-dark-300 mb-1.5">
            <span>Target · {goalLabel}</span>
            <span className="text-brand-teal font-bold">{Math.round(goalProgress * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-dark-700 overflow-hidden">
            <div className="h-full bg-brand-teal transition-all" style={{ width: `${goalProgress * 100}%` }} />
          </div>
        </div>
      )}

      {/* stats — average pace sits beside the live one, because they answer
          different questions: "am I holding it?" and "what did I do?" */}
      <div className="grid grid-cols-4 gap-1.5 mt-4">
        {[
          { v: km.toFixed(2), u: 'km' },
          { v: fmtTime(avgPaceSecPerKm), u: 'avg / km', accent: true },
          { v: fmtTime(livePaceSecPerKm), u: 'now / km' },
          { v: String(Math.round(cals)), u: 'kcal' },
        ].map(s => (
          <div key={s.u} className="bg-dark-800 border border-dark-600 rounded-card py-3 px-1 text-center">
            <div className={`text-[19px] font-extrabold tabular-nums ${s.accent ? 'text-brand-teal' : ''}`}>
              {s.v}
            </div>
            <div className="text-[9.5px] text-dark-300 mt-1">{s.u}</div>
          </div>
        ))}
      </div>

      {/* route map
          The height lives on the map itself, not on this wrapper. A map sized
          with h-full depends on every ancestor resolving a definite height, and
          when one of them does not the percentage collapses to zero — MapLibre
          then silently substitutes its own 300px default, renders a full canvas
          into a 2px-tall clipped box, and reports no error at all. An explicit
          height cannot fail that way. */}
      <div className="relative w-full mt-3.5">
        {source === 'gps' ? (
          <Suspense fallback={
            <div className={`${MAP_BOX} rounded-card border border-dark-600
                            bg-gradient-to-br from-dark-800 to-dark-700
                            flex items-center justify-center text-dark-500 text-sm`}>
              Loading map…
            </div>
          }>
            <RouteMap
              getPoints={run.getPoints}
              pointCount={run.pointCount}
              follow={running}
              // Where the phone says it is, which is the only thing the map has
              // to go on until a fix clears the accuracy filter.
              center={run.position ? [run.position.lng, run.position.lat] : null}
              className={MAP_BOX}
            />
          </Suspense>
        ) : (
          <div className={`${MAP_BOX} rounded-card border border-dark-600
                          bg-gradient-to-br from-dark-800 to-dark-700
                          flex items-center justify-center text-dark-500 text-sm`}>
            No route — pace is being entered by hand
          </div>
        )}

        <div className="absolute left-3 bottom-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full
                        bg-dark-900/80 border border-dark-600 pointer-events-none">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: gps.ok ? '#00D4AA' : '#F97316',
              boxShadow: `0 0 0 4px ${gps.ok ? 'rgba(0,212,170,0.25)' : 'rgba(249,115,22,0.22)'}`,
            }}
          />
          <span className="text-xs font-bold">{running ? gps.label : 'GPS paused'}</span>
        </div>

        {run.accuracy !== null && gps.ok && (
          <div className="absolute right-3 top-3 px-2.5 py-1.5 rounded-full bg-dark-900/80
                          border border-dark-600 text-[11px] text-dark-300 font-semibold
                          pointer-events-none">
            ±{Math.round(run.accuracy)}m · {run.pointCount} pts
          </div>
        )}
      </div>

      {/* effort dial — only when nothing is measuring distance for us */}
      {source === 'manual' ? (
        <div className="mt-3.5 bg-dark-800 border border-dark-600 rounded-card px-4 py-3.5
                        flex items-center justify-between">
          <div>
            <div className="text-[10px] tracking-wide text-dark-400">EFFORT · ESTIMATED PACE</div>
            <div className="text-base font-bold mt-0.5">{effortLabel}</div>
          </div>
          <div className="flex items-center gap-2">
            <button className={stepBtn} onClick={() => effort(-0.15)}>−</button>
            <span className="min-w-[58px] text-center text-[15px] font-extrabold">{fmtTime(livePaceSecPerKm)}/km</span>
            <button className={stepBtn} onClick={() => effort(0.15)}>+</button>
          </div>
        </div>
      ) : (
        <button
          onClick={run.useManual}
          className="w-full mt-3.5 rounded-card border border-dark-600 bg-dark-800 px-4 py-3
                     text-left active:scale-[0.99] transition-transform"
        >
          <div className="text-[10px] tracking-wide text-dark-400">TREADMILL OR NO SIGNAL?</div>
          <div className="text-[13px] font-semibold mt-0.5">Switch to manual pace →</div>
        </button>
      )}

      {/* splits */}
      <div className="mt-3.5">
        <div className="text-[10px] tracking-widest text-dark-400 mb-2">SPLITS</div>
        <div className="flex flex-col gap-2">
          {shownSplits.length === 0 ? (
            <div className="text-center text-[12.5px] text-dark-400 py-2.5">
              First split lands at 1 km — or tap Lap to mark one now.
            </div>
          ) : shownSplits.map(sp => (
            <div key={sp.key} className="flex items-center gap-3 bg-dark-800 border border-dark-600 rounded-btn px-3.5 py-2.5">
              <div className="w-[26px] h-[26px] rounded-badge bg-dark-700 flex items-center justify-center
                              text-xs font-extrabold text-dark-200">{sp.badge}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold">{sp.label}</div>
                {/* The pace is the point of a split; the raw time is context. */}
                <div className="text-[11px] text-dark-400 tabular-nums mt-0.5">{sp.pace}</div>
              </div>
              <div className="text-sm font-extrabold tabular-nums">{sp.time}</div>
            </div>
          ))}
        </div>
      </div>


      {/* controls */}
      <div className="grid grid-cols-2 gap-2.5 mt-4">
        <button onClick={() => {
          if (running) return run.pause()
          // Resuming is a gesture, and a paused run has usually been paused
          // long enough for the lock to have gone with it.
          wakeLock.request()
          run.resume()
        }}
          className="py-4 rounded-btn text-[15px] font-extrabold active:scale-95 transition-transform"
          style={running
            ? { background: '#2a1a1a', color: '#EF4444', border: '1px solid rgba(239,68,68,0.4)' }
            : { background: '#00D4AA', color: '#000' }}>
          {running ? '‖ Pause' : '▶ Resume'}
        </button>
        <button onClick={run.lap}
          className="py-4 rounded-btn border border-dark-600 bg-dark-800 text-white text-[15px] font-bold
                     active:scale-95 transition-transform">
          ⚑ Lap
        </button>
      </div>

      <button
        onClick={() => {
          // Re-requested here and not just at Start. By the time anyone locks
          // the screen the original lock is routinely gone — every trip to the
          // home screen or the music controls drops it — and this tap is a
          // fresh user gesture, which is the only thing iOS grants one from.
          wakeLock.request()
          setLocked(true)
        }}
        className="w-full mt-2.5 py-3.5 rounded-btn border border-dark-600 bg-dark-800
                   text-white text-sm font-bold active:scale-95 transition-transform">
        🔒 Lock screen
      </button>

      <button onClick={endRun}
        className="w-full mt-2.5 py-3.5 rounded-btn border border-brand-red/40 bg-[#2a1a1a]
                   text-brand-red text-sm font-bold active:scale-95 transition-transform">
        ■ End Session
      </button>
    </div>
  )
}

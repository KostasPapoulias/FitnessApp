import { Suspense, useEffect, useRef, useState } from 'react'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { fmtTime } from './helpers'
import { ModalityViewProps, LiveStartGate, EffortPrompt } from './LiveShared'
import { useModalityVoice } from '../../hooks/useModalityVoice'
import { useRunTracker, RunSummary } from '../../hooks/useRunTracker'
import { useWakeLock } from '../../hooks/useWakeLock'
import { Split, paceFromSpeed, splitPace } from '../../lib/geo'
import { useLiveCues } from '../../hooks/useLiveCues'
import { usePaceCoach } from '../../hooks/usePaceCoach'
import { useSessionPrefsStore } from '../../store/useSessionPrefsStore'
import { CoachMode, PacePlan, PaceZone, describePlan } from '../../lib/paceCoach'
import { cues } from '../../lib/speech'
import RunLock from './RunLock'
import PaceSheet from './PaceSheet'
import CoachControls from './CoachControls'
import ChunkBoundary from '../../components/ChunkBoundary'
import { lazyRetry, warmChunk } from '../../lib/lazyRetry'

// MapLibre is the heaviest thing the app can load. Split out so it is fetched
// only when someone actually starts an outdoor session — a lifting workout
// never touches it.
//
// Through lazyRetry and a ChunkBoundary because this fetch happens the instant
// Start is pressed, outdoors, on cellular. When it failed, the page boundary
// caught "Importing a module script failed" and took the entire live workout
// with it — the run kept recording in IndexedDB while the athlete was looking
// at an empty exercise list. A map is worth none of that.
const loadRouteMap = () => import('../../components/RouteMap')
const RouteMap = lazyRetry(loadRouteMap)

const stepBtn =
  'w-[34px] h-[34px] rounded-[9px] border border-dark-600 bg-dark-700 text-white ' +
  'text-lg font-bold flex items-center justify-center active:scale-90 transition-transform flex-shrink-0'

/** kcal per metre, matching the estimate this screen has always used. */
const KCAL_PER_METRE = 0.058

/**
 * How each coaching zone reads on screen.
 *
 * 'idle' is not a zone the coach can be in — it is what the strip shows before
 * the rolling window has enough to say anything, which is the first minute of
 * every run. Showing "on target" through that would be a guess dressed as a
 * measurement.
 */
const ZONE: Record<CoachMode, Record<PaceZone | 'idle', { label: string; color: string }>> = {
  follow: {
    on: { label: 'On target', color: '#00D4AA' },
    slow: { label: 'Behind target', color: '#F97316' },
    fast: { label: 'Ahead of target', color: '#FACC15' },
    idle: { label: 'Finding your pace', color: '#AAAAAA' },
  },
  // A dial is never "finding" anything — it is set or it is not, from the first
  // second. And it is the SETTING that is wrong, not the athlete.
  dial: {
    on: { label: 'Dial matches target', color: '#00D4AA' },
    slow: { label: 'Dial set too slow', color: '#F97316' },
    fast: { label: 'Dial set too fast', color: '#FACC15' },
    idle: { label: 'No target set', color: '#AAAAAA' },
  },
}

/**
 * The map's own box, shared by the map and by both of its placeholders so they
 * cannot disagree about how tall the slot is. An explicit height rather than
 * h-full on purpose — see the wrapper below.
 */
const MAP_BOX = 'w-full h-[190px]'

export default function CardioView({ onFinish, registerVoice }: ModalityViewProps) {
  const { selectedExercises, currentExerciseIndex, cardioTarget, completeSet } = useWorkoutStore()
  const exercise = selectedExercises[currentExerciseIndex]?.exercise
  const activity = exercise?.name ?? 'Outdoor Run'

  /**
   * What measures this movement, and therefore what this screen is.
   *
   *   'gps'     a map, a route, a followed pace — and a manual fallback for the
   *             treadmill, because the same Running entry covers both
   *   'machine' a pace but nothing to measure it: the dial only, no route, and
   *             no location permission ever requested
   *   'reps'    no distance at any effort — a counter, and no pace
   *
   * Falls back to 'gps' when absent, which is what every cardio session did
   * before the field existed: an exercise still sitting in an older cache must
   * not lose its map.
   */
  const tracking = exercise?.cardioTracking ?? 'gps'
  const repUnit = exercise?.repUnit ?? 'reps'

  /**
   * What this movement is typically done at, in m/s, and the dial built from it.
   *
   * The dial used to be a fixed 1.8-4.6 m/s with a 2.85 m/s default — a
   * runner's range with a jogging default, applied to everything. On a fan bike
   * (reference 28 km/h, 7.78 m/s) the maximum was 16.6 km/h, so the movement's
   * own baseline was not merely a bad default, it was unreachable: every air
   * bike session opened at a jogging speed and logged the distance to match,
   * which is why the average pace read around 5:30 instead of 2:08. Walking on
   * a treadmill at 4 km/h was equally inexpressible from the other end.
   *
   * 10 km/h for a movement with no reference speed, which is what the old
   * default was worth anyway.
   */
  const referenceMps = (exercise?.referenceSpeedKmh ?? 10) / 3.6
  const dial = {
    min: referenceMps * 0.35,
    max: referenceMps * 1.8,
    // Proportional, so the number of taps from one end to the other is the same
    // whatever the movement. A fixed 0.15 m/s is a fifth of a walking pace and
    // a fiftieth of a fan bike's.
    step: referenceMps * 0.05,
  }

  // Decided once, at construction. The tracker opens a location watch the
  // instant it mounts, so switching afterwards would raise the OS prompt for a
  // session that can never use a fix.
  const run = useRunTracker(activity, tracking === 'gps' ? 'gps' : 'manual')
  const wakeLock = useWakeLock()

  const [rating, setRating] = useState(false)
  const [ending, setEnding] = useState(false)
  const endingRef = useRef(false)
  const [locked, setLocked] = useState(false)
  /** Set once the athlete has answered the recovered-run prompt. */
  const [keptRecovered, setKeptRecovered] = useState(false)
  // m/s, the dial. Opens on what the movement is actually done at.
  const [manualPace, setManualPace] = useState(referenceMps)
  // The exercise can change under a mounted screen, and a dial left on the
  // previous movement's speed is worse than one that resets: it silently
  // measures a bike session at a jogging pace. Keyed on the reference so an
  // adjustment the athlete made is not undone on every render.
  useEffect(() => { setManualPace(referenceMps) }, [referenceMps])
  /**
   * Counted work, for a movement with no distance at any effort.
   *
   * Held here and written once at the end, like every other cardio number: the
   * count is not a stream of events to be logged as they happen, it is one
   * quantity the athlete reports. Tapping it forty times must not be forty
   * writes.
   */
  const [repCount, setRepCount] = useState(0)
  const [summary, setSummary] = useState<RunSummary | null>(null)

  const { meters, elapsedSec, speedMps, running, started, source, status, splits, laps } = run
  const km = meters / 1000
  const cals = meters * KCAL_PER_METRE

  // A run is the longest stretch in the app with the phone in a pocket or on an
  // armband, so a split that only exists on screen is a split nobody sees.
  const cue = useLiveCues()

  const {
    paceCoach, paceUnit, paceStartSec, paceDeltaSec, audio,
    voice, setVoice, setPacePlan, setAudio,
  } = useSessionPrefsStore()

  /**
   * Whether a pace exists to coach.
   *
   * Reads `cardioTracking`, not `referenceSpeedKmh`. The old check used the
   * latter and got the stair climber wrong in one direction and a
   * missing-from-the-array exercise wrong in the other: `undefined !== null` is
   * true, so an out-of-range index counted as paced.
   */
  const paced = tracking !== 'reps'

  /**
   * Which coach. The GPS one judges a measurement that drifts on its own; the
   * dial one judges a setting that changes instantly and exactly. Same machine,
   * different constants and different words — see CoachMode.
   */
  const coachMode: CoachMode = source === 'gps' ? 'follow' : 'dial'

  /**
   * The coach's own switch for THIS run.
   *
   * Separate from the stored preference: silencing it at kilometre six is about
   * this run, not about never wanting one again. The stored flag decides
   * whether it starts on.
   */
  const [coachOn, setCoachOn] = useState(paceCoach)
  useEffect(() => { setCoachOn(paceCoach) }, [paceCoach])
  const [paceSheet, setPaceSheet] = useState(false)

  /** The dial expressed as a pace, which is what the dial coach judges. */
  const dialPaceSec = paceFromSpeed(manualPace)

  const plan: PacePlan = { unit: paceUnit, startSec: paceStartSec, deltaSec: paceDeltaSec }

  const coach = usePaceCoach({
    enabled: coachOn && paced,
    running: run.running,
    plan,
    mode: coachMode,
    // The setting on a dial, the measurement on GPS. Feeding the rolling
    // window in manual mode had the coach correcting the athlete against a
    // number they had typed, then rewarding them for changing it.
    paceSec: coachMode === 'dial' ? dialPaceSec : run.rollingPaceSec,
    meters: run.meters,
    elapsedSec: run.elapsedSec,
  })

  /**
   * Turning the coach on turns audio cues on with it.
   *
   * Speaking is the only thing the coach does. Leaving it possible to switch on
   * a coach that cannot be heard produces a switch that visibly does nothing,
   * which is indistinguishable from a broken feature.
   */
  const enableCoach = (on: boolean) => {
    setCoachOn(on)
    if (on && !audio) setAudio(true)
  }

  const planLabel = describePlan(plan)

  // Announce each kilometre as it lands.
  //
  // Keyed off the split COUNT, not the distance: `meters` updates several times
  // a second and any threshold test on it either fires repeatedly or misses the
  // crossing entirely. `advanceSplits` already decides where a kilometre ends,
  // so the list growing is the event — and it is the same event the on-screen
  // list renders, which means the two can never disagree.
  const announcedSplits = useRef(0)
  useEffect(() => {
    if (splits.length <= announcedSplits.current) {
      // A resumed run rehydrates its splits from IndexedDB; those already
      // happened, so adopt the count rather than reading four kilometres out.
      announcedSplits.current = splits.length
      return
    }
    const latest = splits[splits.length - 1]
    announcedSplits.current = splits.length
    if (!latest) return
    cue.buzz('milestone')
    cue.say(cues.kmSplit(latest.index, splitPace(latest)))
  }, [splits]) // eslint-disable-line react-hooks/exhaustive-deps

  // Same shape for hand-marked laps, which are a separate list on a separate
  // origin — merged only for display, so they need their own watcher.
  const announcedLaps = useRef(0)
  useEffect(() => {
    if (laps.length <= announcedLaps.current) { announcedLaps.current = laps.length; return }
    const latest = laps[laps.length - 1]
    announcedLaps.current = laps.length
    if (!latest) return
    cue.buzz('milestone')
    cue.say(cues.lapMarked(latest.index))
  }, [laps]) // eslint-disable-line react-hooks/exhaustive-deps

  // The effort dial only feeds distance when there is no GPS to feed it.
  // Destructured so this tracks the dial, not every render of the screen.
  const { setManualSpeed } = run
  // Zero for a counted movement, which is the whole reason it is passed at all
  // here. The tracker accrues `manualSpeed x elapsed` every tick while in
  // manual mode, so leaving the default 2.85 m/s in place would have logged a
  // ten-minute rope session as 1.7 km covered and fed that distance straight
  // into the fatigue model as if it were ground.
  useEffect(() => {
    setManualSpeed(tracking === 'reps' ? 0 : manualPace)
  }, [manualPace, tracking, setManualSpeed])

  // Fetch the map while the athlete is still standing at the start gate. By the
  // time Start is pressed it is in the module cache, so the one request most
  // likely to fail has already happened — with a phone that is stationary and
  // still in whatever signal the door had.
  useEffect(() => {
    if (tracking === 'gps' && source === 'gps') warmChunk(loadRouteMap)
  }, [tracking, source])

  const beginRun = () => {
    // Must happen inside the tap: iOS refuses a wake lock that is not tied to a
    // user gesture, and an effect runs after paint, outside that window.
    wakeLock.request()
    run.start()
    cue.buzz('logged')
    cue.say(cues.runStarted(activity))
  }

  const endRun = () => {
    // Stop the GPS and freeze the numbers before the RPE prompt, so a slow
    // rating does not keep adding metres to a run that finished.
    setSummary(run.stop())
    cue.buzz('complete')
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
    const loggedKm = Math.round(((summary?.meters ?? meters) / 1000) * 100) / 100
    const loggedSec = summary?.elapsedSec ?? elapsedSec
    await completeSet({
      distance: loggedKm,
      time: loggedSec,
      rpe,
      restSeconds: 0,
      // The count, where one exists. This is what lets the fatigue model tell a
      // continuous ten minutes of rope from a broken one — see cardioHse.
      reps: tracking === 'reps' && repCount > 0 ? repCount : undefined,
      // The route, the splits and the pace the run was actually done at. Without
      // this the calendar has a distance and nothing else to show for the hour.
      //
      // Skipped entirely for a counted movement: a RunTrack with zero distance,
      // no route and no splits is a row the calendar will offer to open as a
      // run and then show nothing for.
      run: tracking === 'reps' ? undefined : (summary ?? undefined),
    })
    // Confirmation that it persisted, on the same two channels a logged set
    // uses — a run is one write at the very end, so this is the only signal
    // that an hour of work actually landed.
    cue.buzz('logged')
    const loggedMin = Math.max(1, Math.round(loggedSec / 60))
    cue.say(tracking === 'reps'
      ? cues.countLogged(repCount, repUnit, loggedMin)
      : cues.runLogged(loggedKm, loggedMin))
    onFinish()
  }

  /**
   * Counts per minute, or null before there is enough to divide by.
   *
   * Null rather than 0: at eight seconds in, a count of two is 15/min, which is
   * a true division and a meaningless number. The em dash says "not yet"; a
   * figure would have said "this is your cadence".
   */
  const repRate = elapsedSec >= 20 && repCount > 0
    ? Math.round(repCount / (elapsedSec / 60))
    : null

  /** What the athlete is doing right now — falls to zero the moment they stop. */
  const livePaceSecPerKm = paceFromSpeed(source === 'manual' ? manualPace : speedMps)
  /**
   * What the run will be remembered as.
   *
   * The finish summary uses this and not the live pace: by the time anyone taps
   * End they have stopped moving, the smoothed speed has decayed to zero, and
   * the live pace with it — which is why every finished run reported 00:00.
   */
  // From the tracker, not recomputed here: dividing the continuous `meters` by
  // a whole-second `elapsedSec` sawtoothed the result by ~10s/km. See avgPaceSec.
  const avgPaceSecPerKm = summary?.avgPaceSec ?? run.avgPaceSec
  // Relative to the movement, not in absolute m/s. The old thresholds were
  // running speeds, so every fan-bike setting read "Threshold" and every
  // walking one read "Recovery" — a label that never changes says nothing.
  const effortRatio = referenceMps > 0 ? manualPace / referenceMps : 1
  const effortLabel =
    effortRatio >= 1.15 ? 'Threshold'
    : effortRatio >= 0.95 ? 'Tempo'
    : effortRatio >= 0.75 ? 'Easy'
    : 'Recovery'
  const effort = (steps: number) =>
    setManualPace(v => Math.min(dial.max, Math.max(dial.min,
      Math.round((v + steps * dial.step) * 100) / 100)))

  /**
   * Why GPS is not available, or null if it is.
   *
   * This exists because "Back to GPS" looked like a dead button. Tapping it
   * opened a watch, the watch errored, and `onGeolocationError` put the source
   * straight back to manual — so the screen returned to the dial within a
   * second and nothing said why. Three causes, and only one of them is
   * something the athlete can do anything about:
   *
   *   insecure context — the page is on plain http, and Chrome refuses
   *     `deviceorientation` and geolocation there outright. A dev server
   *     reached over the LAN by IP is the usual case and no permission grant
   *     will ever fix it.
   *   denied — a real permission refusal, which system settings can undo.
   *   unavailable — no geolocation API at all.
   */
  const gpsRefusal: { title: string; detail: string } | null =
    typeof window !== 'undefined' && !window.isSecureContext
      ? {
          title: 'GPS needs a secure connection',
          detail: 'This page is being served over http, and the browser will not report a location there. Open the app over https and GPS becomes available.',
        }
      : status === 'denied'
        ? {
            title: 'Location is turned off for this app',
            detail: 'Allow location in your browser or system settings, then tap again. Until then the dial is the only thing that can measure this session.',
          }
        : status === 'unavailable'
          ? {
              title: 'This device reports no GPS',
              detail: 'Nothing to switch back to — the dial is measuring the session.',
            }
          : null

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
  // The phone is in a pocket or on an armband for the whole of this, which is
  // the strongest case for voice anywhere in the app. Above the early returns
  // because it is a hook and those are conditional.
  useModalityVoice(registerVoice, command => {
    switch (command.kind) {
      case 'pauseRest':
        run.pause()
        return true
      case 'resumeRest':
        // Resuming re-requests the wake lock for the same reason the button
        // does: iOS only grants one from a gesture, and a long pause has
        // usually outlived the last grant. A refusal is not fatal — the run
        // keeps going, the screen may just sleep.
        wakeLock.request()
        run.resume()
        return true
      case 'mark':
      case 'advance':
        run.lap()
        return true
      default:
        return false
    }
  })

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
      >
        {/* The source, chosen BEFORE the clock starts.
            It used to be reachable only from the live screen, so anyone who
            knew they were on a treadmill had to start a GPS session, watch it
            hunt for a fix, and then switch. It is also the one decision that
            changes which coach runs, and the coach is configured right below. */}
        {tracking === 'gps' && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {([
              { src: 'gps' as const, label: 'GPS', sub: 'Outdoors' },
              { src: 'manual' as const, label: 'By hand', sub: 'Treadmill' },
            ]).map(option => (
              <button
                key={option.src}
                onClick={() => option.src === 'gps' ? run.useGps() : run.useManual()}
                className="rounded-card border px-3 py-2.5 text-center transition-colors"
                style={source === option.src
                  ? { borderColor: '#00D4AA', background: '#0a2a22' }
                  : { borderColor: '#2A2A2A', background: '#1a1a1a' }}
              >
                <span className={`block text-[13px] font-bold ${
                  source === option.src ? 'text-brand-teal' : 'text-dark-200'}`}>
                  {option.label}
                </span>
                <span className="block text-[10.5px] text-dark-400 mt-0.5">{option.sub}</span>
              </button>
            ))}
          </div>
        )}

        {tracking === 'gps' && source === 'manual' && gpsRefusal && (
          <p className="text-[11px] text-brand-orange mb-3 leading-snug text-left">
            {gpsRefusal.title}. {gpsRefusal.detail}
          </p>
        )}

        {paced && (
          <>
            <CoachControls
              coachOn={coachOn}
              onCoach={enableCoach}
              planLabel={planLabel}
              onEditPlan={() => setPaceSheet(true)}
              voiceOn={voice}
              onVoice={setVoice}
              mode={coachMode}
            />
            {paceSheet && (
              <PaceSheet
                plan={plan}
                onApply={setPacePlan}
                onClose={() => setPaceSheet(false)}
                suggestedSec={null}
                currentPaceSec={coachMode === 'dial' ? dialPaceSec : null}
                referencePaceSec={paceFromSpeed(referenceMps)}
                defaultUnit={coachMode === 'dial' ? 'min' : undefined}
              />
            )}
          </>
        )}
      </LiveStartGate>
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
        coachTarget={coachOn && paced && coach.targetSec !== null ? fmtTime(coach.targetSec) : null}
        coachLabel={ZONE[coachMode][coach.zone ?? 'idle'].label}
        coachColor={ZONE[coachMode][coach.zone ?? 'idle'].color}
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
        {(tracking === 'reps'
          // Pace and distance are both zero here and always will be. Showing
          // "0.00 km" and "00:00 now / km" is not a neutral omission — it reads
          // as a tracker that has stopped working.
          ? [
              { v: String(repCount), u: repUnit },
              { v: repRate === null ? '—' : String(repRate), u: `${repUnit} / min`, accent: true },
              { v: fmtTime(elapsedSec), u: 'elapsed' },
              { v: String(Math.round(cals)), u: 'kcal' },
            ]
          : [
              { v: km.toFixed(2), u: 'km' },
              { v: fmtTime(avgPaceSecPerKm), u: 'avg / km', accent: true },
              { v: fmtTime(livePaceSecPerKm), u: 'now / km' },
              { v: String(Math.round(cals)), u: 'kcal' },
            ]
        ).map(s => (
          <div key={s.u} className="bg-dark-800 border border-dark-600 rounded-card py-3 px-1 text-center">
            <div className={`text-[19px] font-extrabold tabular-nums ${s.accent ? 'text-brand-teal' : ''}`}>
              {s.v}
            </div>
            <div className="text-[9.5px] text-dark-300 mt-1">{s.u}</div>
          </div>
        ))}
      </div>

      {/* Coach and microphone, always on screen.
          The first version hid each control once it was switched off, so
          turning the mic off removed the only thing that could turn it back on
          — the way out was to end the session. A switch you can only press once
          is not a switch. */}
      {paced && (
        <div className="mt-3">
          <CoachControls
            coachOn={coachOn}
            onCoach={enableCoach}
            planLabel={planLabel}
            onEditPlan={() => setPaceSheet(true)}
            voiceOn={voice}
            onVoice={setVoice}
            mode={coachMode}
            zone={coach.zone}
            targetSec={coach.targetSec}
            currentPaceSec={coachMode === 'dial' ? dialPaceSec : run.rollingPaceSec}
            live
          />
        </div>
      )}

      {/* route map
          The height lives on the map itself, not on this wrapper. A map sized
          with h-full depends on every ancestor resolving a definite height, and
          when one of them does not the percentage collapses to zero — MapLibre
          then silently substitutes its own 300px default, renders a full canvas
          into a 2px-tall clipped box, and reports no error at all. An explicit
          height cannot fail that way. */}
      {tracking === 'reps' ? (
        /* The counter takes the map's slot. Nothing on a rope has a route, so
           the alternative was an empty grey box where a map goes, which reads
           as a map that failed rather than as one that does not apply. */
        <div className="w-full mt-3.5 bg-dark-800 border border-dark-600 rounded-card px-4 py-4">
          <div className="flex items-baseline justify-between">
            <div className="text-[10px] tracking-wide text-dark-400">
              {repUnit.toUpperCase()} COMPLETED
            </div>
            {repRate !== null && (
              <div className="text-[10.5px] text-dark-400 tabular-nums">
                {repRate} / min
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 mt-2.5">
            <button
              onClick={() => setRepCount(n => Math.max(0, n - 10))}
              className="w-[52px] h-[52px] rounded-[13px] border border-dark-600 bg-dark-700
                         text-white text-[17px] font-bold active:scale-90 transition-transform"
              aria-label={`Ten fewer ${repUnit}`}
            >
              −10
            </button>
            <div className="flex-1 text-center text-[40px] font-extrabold leading-none tabular-nums">
              {repCount}
            </div>
            <button
              onClick={() => setRepCount(n => Math.min(20_000, n + 10))}
              className="w-[52px] h-[52px] rounded-[13px] border border-brand-teal/40 bg-[#0a2a22]
                         text-brand-teal text-[17px] font-bold active:scale-90 transition-transform"
              aria-label={`Ten more ${repUnit}`}
            >
              +10
            </button>
          </div>

          <div className="flex gap-2 mt-2.5">
            {[25, 50, 100].map(n => (
              <button
                key={n}
                onClick={() => setRepCount(c => Math.min(20_000, c + n))}
                className="flex-1 py-2.5 rounded-btn border border-dark-600 bg-dark-900
                           text-[12.5px] font-bold text-dark-200 active:scale-[0.99] transition-transform"
              >
                +{n}
              </button>
            ))}
          </div>

          {/* Said plainly, because the alternative is an athlete assuming the
              app is counting for them and reporting nothing. */}
          <p className="text-[11px] text-dark-500 mt-2.5 leading-snug">
            Optional. Left at zero the set is scored on its duration — a count
            only sharpens it, by separating a continuous ten minutes from a
            broken one.
          </p>
        </div>
      ) : tracking === 'machine' ? null : (
      <div className="relative w-full mt-3.5">
        {source === 'gps' ? (
          <ChunkBoundary
            label="route-map"
            fallback={retry => (
              <button
                onClick={retry}
                className={`${MAP_BOX} rounded-card border border-dark-600 bg-dark-800
                            flex flex-col items-center justify-center gap-1 text-center px-6`}
              >
                <span className="text-[13px] font-bold text-dark-200">Map didn't load</span>
                <span className="text-[11.5px] text-dark-400 leading-snug">
                  Your run is still recording — distance, pace and splits are unaffected.
                  Tap to try again.
                </span>
              </button>
            )}
          >
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
          </ChunkBoundary>
        ) : (
          <div className={`${MAP_BOX} rounded-card border border-dark-600
                          bg-gradient-to-br from-dark-800 to-dark-700
                          flex items-center justify-center text-dark-500 text-sm`}>
            No route — you're setting the speed by hand
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
      )}

      {/* the dial — whenever nothing is measuring distance for us, EXCEPT a
          counted movement, where there is no distance to measure at all and a
          speed control would be a knob wired to nothing. */}
      {tracking === 'reps' ? null : source === 'manual' ? (
        <div className="mt-3.5 bg-dark-800 border border-dark-600 rounded-card px-4 py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-wide text-dark-400">SPEED YOU'RE SETTING BY HAND</div>
              <div className="text-base font-bold mt-0.5">{effortLabel}</div>
            </div>
            {/*
              + is faster, and that is not negotiable even though the number
              between the buttons goes DOWN when it is pressed.
              The card is headed by a speed and an effort tier; having + drop
              the effort from Tempo to Easy so that a pace could count upward
              made the one control on screen disagree with both labels above
              it. Pace is shown because pace is what the coach speaks; the
              buttons follow the effort, which is what the athlete is choosing.
            */}
            <div className="flex items-center gap-2">
              <button className={stepBtn} aria-label="Slower" onClick={() => effort(-1)}>−</button>
              <div className="min-w-[68px] text-center">
                <div className="text-[15px] font-extrabold tabular-nums">
                  {fmtTime(livePaceSecPerKm)}/km
                </div>
                {/* Both units, because neither alone is readable on every
                    machine: a treadmill is set in km/h, a runner thinks in
                    pace, and 2:08/km on a fan bike means nothing to anyone. */}
                <div className="text-[10px] text-dark-400 tabular-nums mt-0.5">
                  {(manualPace * 3.6).toFixed(1)} km/h
                </div>
              </div>
              <button className={stepBtn} aria-label="Faster" onClick={() => effort(1)}>+</button>
            </div>
          </div>

          {/* Only where a fix could ever have helped. On an erg or in a pool
              this button offers a permission prompt in exchange for nothing. */}
          {tracking === 'gps' && (
            gpsRefusal ? (
              // Still tappable: a permission can be granted while this is on
              // screen, and the retry is the only way to find out. What it must
              // not do is look like a switch that works.
              <button
                onClick={run.useGps}
                className="w-full mt-3 px-3 py-2.5 rounded-btn border border-dark-600
                           bg-dark-900 text-left active:scale-[0.99] transition-transform"
              >
                <span className="block text-[12px] font-bold text-brand-orange">
                  {gpsRefusal.title}
                </span>
                <span className="block text-[11px] text-dark-400 mt-0.5 leading-snug">
                  {gpsRefusal.detail}
                </span>
              </button>
            ) : (
              <button
                onClick={run.useGps}
                className="w-full mt-3 py-2.5 rounded-btn border border-dark-600 bg-dark-900
                           text-[12.5px] font-bold text-dark-200 active:scale-[0.99] transition-transform"
              >
                ↩ Back to GPS
              </button>
            )
          )}
        </div>
      ) : (
        <button
          onClick={run.useManual}
          className="w-full mt-3.5 rounded-card border border-dark-600 bg-dark-800 px-4 py-3
                     text-left active:scale-[0.99] transition-transform"
        >
          <div className="text-[10px] tracking-wide text-dark-400">TREADMILL, TRACK OR NO SIGNAL</div>
          <div className="text-[13px] font-semibold mt-0.5">
            No GPS? Set your speed by hand →
          </div>
          <div className="text-[11.5px] text-dark-400 mt-1 leading-snug">
            You dial in how fast you're going and the app counts the distance from it.
            No route is drawn.
          </div>
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

      {/* Not for a counted movement. The lock screen is built around a distance
          and a pace, and it would show 0.00 km and 00:00 for the whole session
          — and the count needs taps, so locking the screen defeats it. The wake
          lock is still taken at Start, which is the part that mattered. */}
      {tracking !== 'reps' && (
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
      )}

      <button onClick={endRun}
        className="w-full mt-2.5 py-3.5 rounded-btn border border-brand-red/40 bg-[#2a1a1a]
                   text-brand-red text-sm font-bold active:scale-95 transition-transform">
        ■ End Session
      </button>

      {paceSheet && (
        <PaceSheet
          plan={plan}
          onApply={setPacePlan}
          onClose={() => setPaceSheet(false)}
          suggestedSec={coach.targetSec}
          currentPaceSec={(coachMode === 'dial' ? dialPaceSec : run.rollingPaceSec) || null}
          referencePaceSec={paceFromSpeed(referenceMps)}
          defaultUnit={coachMode === 'dial' ? 'min' : undefined}
        />
      )}
    </div>
  )
}

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
import { FlagIcon, LockIcon, ModalityIcon } from '../../components/icons'

// MapLibre is heavy: loaded only for outdoor sessions, through lazyRetry and a
// ChunkBoundary so a failed fetch on cellular can't take down the live workout
const loadRouteMap = () => import('../../components/RouteMap')
const RouteMap = lazyRetry(loadRouteMap)

const stepBtn =
  'w-[34px] h-[34px] rounded-[9px] border border-dark-600 bg-dark-700 text-white ' +
  'text-lg font-bold flex items-center justify-center active:scale-90 transition-transform flex-shrink-0'

/** kcal per metre for the calorie estimate. */
const KCAL_PER_METRE = 0.058

/** How each coaching zone reads on screen; 'idle' is the first minute, before the window can judge. */
const ZONE: Record<CoachMode, Record<PaceZone | 'idle', { label: string; color: string }>> = {
  follow: {
    on: { label: 'On target', color: '#00D4AA' },
    slow: { label: 'Behind target', color: '#F97316' },
    fast: { label: 'Ahead of target', color: '#FACC15' },
    idle: { label: 'Finding your pace', color: '#AAAAAA' },
  },
  // A dial is set from the first second; it's the setting that's off, not the athlete
  dial: {
    on: { label: 'Dial matches target', color: '#00D4AA' },
    slow: { label: 'Dial set too slow', color: '#F97316' },
    fast: { label: 'Dial set too fast', color: '#FACC15' },
    idle: { label: 'No target set', color: '#AAAAAA' },
  },
}

/** Shared by the map and its placeholders so the slot height can't disagree. */
const MAP_BOX = 'w-full h-[190px]'

/** Live cardio: GPS route and pace, a manual speed dial, or a rep counter, per the movement. */
export default function CardioView({ onFinish, registerVoice }: ModalityViewProps) {
  const { selectedExercises, currentExerciseIndex, cardioTarget, completeSet } = useWorkoutStore()
  const exercise = selectedExercises[currentExerciseIndex]?.exercise
  const activity = exercise?.name ?? 'Outdoor Run'

  /**
   * What measures this movement: 'gps' (map + route, manual fallback),
   * 'machine' (dial only, never asks for location) or 'reps' (a counter, no pace).
   * Absent → 'gps', for exercises cached before the field existed.
   */
  const tracking = exercise?.cardioTracking ?? 'gps'
  const repUnit = exercise?.repUnit ?? 'reps'

  /** The movement's typical speed (m/s); the dial is built around it. 10 km/h when unknown. */
  const referenceMps = (exercise?.referenceSpeedKmh ?? 10) / 3.6
  const dial = {
    min: referenceMps * 0.35,
    max: referenceMps * 1.8,
    // Proportional, so the dial has the same number of taps for any movement
    step: referenceMps * 0.05,
  }

  // Fixed at mount: the tracker starts a location watch immediately, so a
  // non-GPS movement must never open one
  const run = useRunTracker(activity, tracking === 'gps' ? 'gps' : 'manual')
  const wakeLock = useWakeLock()

  const [rating, setRating] = useState(false)
  const [ending, setEnding] = useState(false)
  const endingRef = useRef(false)
  const [locked, setLocked] = useState(false)
  /** Set once the athlete has answered the recovered-run prompt. */
  const [keptRecovered, setKeptRecovered] = useState(false)
  // m/s, the dial; opens at the movement's reference speed
  const [manualPace, setManualPace] = useState(referenceMps)
  // Reset the dial when the exercise changes, or a bike is measured at a jogging pace
  useEffect(() => { setManualPace(referenceMps) }, [referenceMps])
  /** Counted work for a movement with no distance; written once at the end. */
  const [repCount, setRepCount] = useState(0)
  const [summary, setSummary] = useState<RunSummary | null>(null)

  const { meters, elapsedSec, speedMps, running, started, source, status, splits, laps } = run
  const km = meters / 1000
  const cals = meters * KCAL_PER_METRE

  // The phone is in a pocket, so splits are spoken as well as shown
  const cue = useLiveCues()

  const {
    paceCoach, paceUnit, paceStartSec, paceDeltaSec, audio,
    voice, setVoice, setPacePlan, setAudio,
  } = useSessionPrefsStore()

  /** Whether there is a pace to coach. */
  const paced = tracking !== 'reps'

  /** GPS coach judges a drifting measurement; dial coach judges an exact setting (see CoachMode). */
  const coachMode: CoachMode = source === 'gps' ? 'follow' : 'dial'

  /** The coach switch for this run only; the stored preference sets its initial state. */
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
    // The dial's setting in manual mode — coaching against a typed number is meaningless
    paceSec: coachMode === 'dial' ? dialPaceSec : run.rollingPaceSec,
    meters: run.meters,
    elapsedSec: run.elapsedSec,
  })

  /** Turning the coach on also turns audio cues on; it can only speak. */
  const enableCoach = (on: boolean) => {
    setCoachOn(on)
    if (on && !audio) setAudio(true)
  }

  const planLabel = describePlan(plan)

  // Announce each kilometre, keyed on the split count (the same event the list renders)
  const announcedSplits = useRef(0)
  useEffect(() => {
    if (splits.length <= announcedSplits.current) {
      // Resumed splits already happened: adopt the count without announcing
      announcedSplits.current = splits.length
      return
    }
    const latest = splits[splits.length - 1]
    announcedSplits.current = splits.length
    if (!latest) return
    cue.buzz('milestone')
    cue.say(cues.kmSplit(latest.index, splitPace(latest)))
  }, [splits]) // eslint-disable-line react-hooks/exhaustive-deps

  // Same for hand-marked laps, a separate list
  const announcedLaps = useRef(0)
  useEffect(() => {
    if (laps.length <= announcedLaps.current) { announcedLaps.current = laps.length; return }
    const latest = laps[laps.length - 1]
    announcedLaps.current = laps.length
    if (!latest) return
    cue.buzz('milestone')
    cue.say(cues.lapMarked(latest.index))
  }, [laps]) // eslint-disable-line react-hooks/exhaustive-deps

  // The dial feeds distance only without GPS
  const { setManualSpeed } = run
  // Zero for a counted movement, or elapsed time would accrue phantom distance
  // that feeds the fatigue model
  useEffect(() => {
    setManualSpeed(tracking === 'reps' ? 0 : manualPace)
  }, [manualPace, tracking, setManualSpeed])

  // Prefetch the map at the start gate, while the signal is still good
  useEffect(() => {
    if (tracking === 'gps' && source === 'gps') warmChunk(loadRouteMap)
  }, [tracking, source])

  const beginRun = () => {
    // Inside the tap: iOS grants a wake lock only from a user gesture
    wakeLock.request()
    run.start()
    cue.buzz('logged')
    cue.say(cues.runStarted(activity))
  }

  const endRun = () => {
    // Freeze the numbers before the RPE prompt so a slow rating adds no distance
    setSummary(run.stop())
    cue.buzz('complete')
    wakeLock.release()
    setLocked(false)
    setRating(true)
  }

  // Log the SetCardio (km, seconds) with the athlete's RPE
  const endSession = async (rpe: number) => {
    // Ref guard against a double tap logging the run twice
    if (endingRef.current) return
    endingRef.current = true
    setEnding(true)
    // A failed summary set must not strand the user; Finish surfaces the error
    const loggedKm = Math.round(((summary?.meters ?? meters) / 1000) * 100) / 100
    const loggedSec = summary?.elapsedSec ?? elapsedSec
    await completeSet({
      distance: loggedKm,
      time: loggedSec,
      rpe,
      restSeconds: 0,
      // Lets the fatigue model tell a continuous effort from a broken one (see cardioHse)
      reps: tracking === 'reps' && repCount > 0 ? repCount : undefined,
      // Route, splits and pace for the calendar; skipped for a counted movement
      run: tracking === 'reps' ? undefined : (summary ?? undefined),
    })
    // The only confirmation that the run was saved
    cue.buzz('logged')
    const loggedMin = Math.max(1, Math.round(loggedSec / 60))
    cue.say(tracking === 'reps'
      ? cues.countLogged(repCount, repUnit, loggedMin)
      : cues.runLogged(loggedKm, loggedMin))
    onFinish()
  }

  /** Counts per minute; null for the first 20 s, when the division is meaningless. */
  const repRate = elapsedSec >= 20 && repCount > 0
    ? Math.round(repCount / (elapsedSec / 60))
    : null

  /** Current pace; falls to zero when the athlete stops. */
  const livePaceSecPerKm = paceFromSpeed(source === 'manual' ? manualPace : speedMps)
  /**
   * The run's average pace, used by the finish summary (the live pace has
   * decayed to zero by the time End is tapped). From the tracker, not
   * recomputed here (see avgPaceSec).
   */
  const avgPaceSecPerKm = summary?.avgPaceSec ?? run.avgPaceSec
  // Relative to the movement's reference speed, so the effort label means something on any machine
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
   * Why GPS is unavailable, or null. Shown so "Back to GPS" doesn't look dead:
   * insecure context (plain http — no grant fixes it), denied (fixable in
   * settings), or unavailable (no API).
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

  // Kilometres and hand-marked laps merged for display, newest first
  const shownSplits = [...splits, ...laps]
    .sort((a, b) => b.endMeters - a.endMeters)
    .slice(0, 4)
    .map((sp: Split) => ({
      key: `${sp.auto ? 'km' : 'lap'}-${sp.index}`,
      // A number for an automatic split, a flag for a marked lap
      badge: sp.auto ? String(sp.index) : <FlagIcon className="w-3.5 h-3.5" />,
      label: sp.auto ? `Km ${sp.index}` : `Lap · ${(sp.meters / 1000).toFixed(2)} km`,
      pace: `${fmtTime(splitPace(sp))} /km`,
      time: fmtTime(sp.seconds),
    }))

  // Goal from the plan
  const goalLabel = cardioTarget
    ? cardioTarget.type === 'distance' ? `${cardioTarget.value} km` : fmtTime(cardioTarget.value)
    : null
  const goalProgress = cardioTarget
    ? cardioTarget.type === 'distance'
      ? Math.min(1, km / cardioTarget.value)
      : Math.min(1, elapsedSec / cardioTarget.value)
    : 0

  // ── start gate ──
  // Voice control; above the early returns because it is a hook
  useModalityVoice(registerVoice, command => {
    switch (command.kind) {
      case 'pauseRest':
        run.pause()
        return true
      case 'resumeRest':
        // Re-request the wake lock (gesture only on iOS); a refusal isn't fatal
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
        icon={<ModalityIcon modality="Cardio" className="w-14 h-14" />}
        label="LIVE · CARDIO"
        title={activity}
        detail={goalLabel
          ? `Target: ${goalLabel}. Press start when you begin moving.`
          : 'Free run. Press start when you begin moving.'}
        onStart={beginRun}
      >
        {/* Source chosen before the clock starts; it also decides which coach runs */}
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
        icon={<ModalityIcon modality="Cardio" className="w-14 h-14" />}
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
      // Stop pull-to-refresh from reloading the page mid-run
      style={{ overscrollBehavior: 'none' }}
    >
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-brand-red text-xs font-bold tracking-wide">
          <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" />
          {running ? 'LIVE · RUNNING' : 'PAUSED · RUNNING'}
        </div>
        <div className="text-[13px] text-dark-300 font-semibold flex items-center justify-center gap-1.5">
          <ModalityIcon modality="Cardio" className="w-4 h-4" /> {activity}
        </div>
      </div>

      {/* Recovered after a reload or OS kill: shown until answered, so a stale
          run isn't silently adopted */}
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
                // Inside the tap: iOS grants a wake lock only from a gesture
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

      {/* stats — live pace beside the average */}
      <div className="grid grid-cols-4 gap-1.5 mt-4">
        {(tracking === 'reps'
          // No pace or distance for a counted movement; zeros would look broken
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

      {/* Coach and microphone, always shown so either can be switched back on */}
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

      {/* route map — the height is explicit on the map (MAP_BOX): with h-full a
          collapsed ancestor gives MapLibre a 0px box and it fails silently */}
      {tracking === 'reps' ? (
        /* The counter takes the map's slot */
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

          {/* Said plainly, so nobody assumes the app is counting for them */}
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
              // The raw position, until a fix passes the accuracy filter
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

      {/* the dial — whenever nothing measures distance, except a counted movement */}
      {tracking === 'reps' ? null : source === 'manual' ? (
        <div className="mt-3.5 bg-dark-800 border border-dark-600 rounded-card px-4 py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-wide text-dark-400">SPEED YOU'RE SETTING BY HAND</div>
              <div className="text-base font-bold mt-0.5">{effortLabel}</div>
            </div>
            {/* + is faster (follows the effort), even though the pace number goes down */}
            <div className="flex items-center gap-2">
              <button className={stepBtn} aria-label="Slower" onClick={() => effort(-1)}>−</button>
              <div className="min-w-[68px] text-center">
                <div className="text-[15px] font-extrabold tabular-nums">
                  {fmtTime(livePaceSecPerKm)}/km
                </div>
                {/* Both units: treadmills use km/h, runners think in pace */}
                <div className="text-[10px] text-dark-400 tabular-nums mt-0.5">
                  {(manualPace * 3.6).toFixed(1)} km/h
                </div>
              </div>
              <button className={stepBtn} aria-label="Faster" onClick={() => effort(1)}>+</button>
            </div>
          </div>

          {/* Only where a GPS fix could help */}
          {tracking === 'gps' && (
            gpsRefusal ? (
              // Still tappable: permission may be granted meanwhile, and a retry is the only check
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
                {/* The pace matters most; the raw time is context */}
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
          // Resuming is a gesture; a long pause has usually lost the lock
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
          <FlagIcon className="w-4 h-4" /> Lap
        </button>
      </div>

      {/* Not for a counted movement: the lock screen shows distance and pace,
          and counting needs taps */}
      {tracking !== 'reps' && (
        <button
          onClick={() => {
            // Re-requested here: the Start lock is often gone by now, and this tap is a gesture
            wakeLock.request()
            setLocked(true)
          }}
          className="w-full mt-2.5 py-3.5 rounded-btn border border-dark-600 bg-dark-800
                     text-white text-sm font-bold active:scale-95 transition-transform">
          <LockIcon className="w-4 h-4" /> Lock screen
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

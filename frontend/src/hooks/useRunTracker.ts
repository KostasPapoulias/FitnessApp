import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GAP_MS, MAX_ACCURACY_M, RouteSegment, Split, SplitState, TrackPoint,
  advanceSplits, averagePace, elevationGain, ema, emptySplitState, encodeRoute,
  evaluateFix, finalSplit, isGap, routeBounds, simplify, smoothPosition,
} from '../lib/geo'
import { SavedRun, TrackGap, clearRun, loadRun, saveRun } from '../lib/runStorage'

/**
 * A live outdoor session: elapsed time, distance, speed, and the route.
 *
 * Two things this owns that look trivial and are not.
 *
 * DISTANCE. A phone standing still reports a position that wanders several
 * metres between fixes. Summing every reported movement is how a 5k logs as
 * 5.4k, so distance only accumulates when the position has moved far enough
 * from its ANCHOR to be movement rather than noise — see commitFix below.
 *
 * TIME. Elapsed is computed from timestamps, never counted up a tick at a time.
 * A counter loses every tick the browser throttles or drops, and always in the
 * same direction: short. Reading the clock means a stall shows up as a jump,
 * which is at least honest and can be reconciled against the track.
 */

/** Weight of each new speed reading. Low enough to stop the number flickering. */
const SPEED_ALPHA = 0.3
/** How often the session is mirrored to IndexedDB. */
const FLUSH_MS = 5_000
/** Display refresh. Fast enough to look live, slow enough to cost nothing. */
const TICK_MS = 250

export type RunStatus =
  | 'idle'
  | 'acquiring'
  | 'tracking'
  | 'weak'
  | 'denied'
  | 'unavailable'

export type RunSource = 'gps' | 'manual'

export interface RunSummary {
  meters: number
  elapsedSec: number
  /** Simplified for storage and drawing — the full track never leaves memory. */
  track: TrackPoint[]
  /** The same track, gap-segmented and rounded, ready to persist and redraw. */
  route: RouteSegment[]
  bounds: [[number, number], [number, number]] | null
  gaps: TrackGap[]
  /**
   * Seconds per kilometre over the whole run.
   *
   * Carried explicitly rather than left to be recomputed downstream: distance
   * is rounded to two decimals before it is stored, and dividing the rounded
   * number moves the pace of a short run by a second or two.
   */
  avgPaceSec: number
  splits: Split[]
  laps: Split[]
  elevationGainM: number
  startedAt: number
  source: RunSource
}

const hasGeolocation = () =>
  typeof navigator !== 'undefined' && 'geolocation' in navigator

export const useRunTracker = (activityKey: string) => {
  const [status, setStatus] = useState<RunStatus>('idle')
  const [source, setSource] = useState<RunSource>('gps')
  const [started, setStarted] = useState(false)
  const [running, setRunning] = useState(false)
  const [recovered, setRecovered] = useState(false)

  const [elapsedSec, setElapsedSec] = useState(0)
  const [meters, setMeters] = useState(0)
  const [speedMps, setSpeedMps] = useState(0)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  /**
   * The last position the device reported, believed or not.
   *
   * Deliberately separate from the track. The track only accepts fixes good
   * enough to measure distance with, and a fix too vague to measure with is
   * still far better than a hardcoded city centre to point a camera at. This is
   * what the map follows before the first real fix lands — and, indoors, it may
   * be the only thing it ever gets.
   */
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [pointCount, setPointCount] = useState(0)
  const [gapCount, setGapCount] = useState(0)
  const [splits, setSplits] = useState<Split[]>([])
  const [laps, setLaps] = useState<Split[]>([])

  // Everything the interval and the geolocation callback touch lives in refs.
  // Both fire outside React's render cycle, and routing them through state
  // would rebuild the watch on every fix.
  const points = useRef<TrackPoint[]>([])
  const gaps = useRef<TrackGap[]>([])
  const anchor = useRef<TrackPoint | null>(null)
  const lastFix = useRef<TrackPoint | null>(null)
  /** Running low-pass of position — see smoothPosition. */
  const smoothed = useRef<TrackPoint | null>(null)
  const distance = useRef(0)
  /** Kilometre splits, folded forward one sample at a time — see advanceSplits. */
  const splitState = useRef<SplitState>(emptySplitState())
  const lapState = useRef<Split[]>([])
  /** Where the last hand-marked lap ended; laps are measured from each other. */
  const lastLap = useRef({ meters: 0, seconds: 0 })
  const smoothedSpeed = useRef<number | null>(null)
  const manualSpeed = useRef(2.85)
  const watchId = useRef<number | null>(null)
  const lastTick = useRef<number>(0)
  const lastFlush = useRef<number>(0)
  const clock = useRef({ startedAt: 0, pausedAt: 0 as number | 0, pausedMs: 0 })
  const runningRef = useRef(false)
  const sourceRef = useRef<RunSource>('gps')
  const startedRef = useRef(false)

  const flush = useCallback(() => {
    if (!startedRef.current) return
    const run: SavedRun = {
      activityKey,
      startedAt: clock.current.startedAt,
      pausedMs: clock.current.pausedMs,
      meters: distance.current,
      points: points.current,
      gaps: gaps.current,
      splitState: splitState.current,
      laps: lapState.current,
      savedAt: Date.now(),
    }
    void saveRun(run)
    lastFlush.current = Date.now()
  }, [activityKey])

  /**
   * Fold one GPS fix into the session.
   *
   * Order matters: the cheap rejections come first, and the anchor is only
   * advanced by a fix that was actually believed. Holding the anchor still
   * while readings wander is what makes standing at a crossing cost nothing.
   */
  const commitFix = useCallback((position: GeolocationPosition) => {
    const raw: TrackPoint = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      t: position.timestamp,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      speed: position.coords.speed,
    }

    setAccuracy(raw.accuracy)
    setStatus(raw.accuracy > MAX_ACCURACY_M ? 'weak' : 'tracking')
    // Before the running check: where the phone is does not depend on whether
    // the clock has been started, and the map needs it either way.
    setPosition({ lat: raw.lat, lng: raw.lng, accuracy: raw.accuracy })

    if (!runningRef.current) return

    // Smoothing has to be reset BEFORE the fix is smoothed, not after it is
    // classified: averaging the first fix back from a lock against the position
    // the phone had when it locked puts the result somewhere the user never was.
    if (isGap(lastFix.current, raw)) smoothed.current = null

    const fix = smoothPosition(smoothed.current, raw)
    const decision = evaluateFix(fix, anchor.current, lastFix.current)

    // Every believed fix advances `previous`, including ones that change
    // nothing else — it is what the gap check measures silence against.
    if (decision.kind !== 'reject') {
      lastFix.current = fix
      smoothed.current = fix
    }

    switch (decision.kind) {
      case 'reject':
        return

      case 'hold':
        // The anchor deliberately stays put. Only a fix actively reporting
        // standing still decays the displayed speed; below-threshold movement
        // just means not enough has happened yet.
        if (decision.stationary) {
          smoothedSpeed.current = ema(smoothedSpeed.current, 0, SPEED_ALPHA)
        }
        return

      case 'gap':
        gaps.current.push({ from: decision.from, to: decision.to })
        setGapCount(gaps.current.length)
        anchor.current = fix
        points.current.push(fix)
        setPointCount(points.current.length)
        return

      case 'anchor':
        anchor.current = fix
        points.current.push(fix)
        setPointCount(points.current.length)
        return

      case 'advance':
        distance.current += decision.meters
        points.current.push(fix)
        setPointCount(points.current.length)
        smoothedSpeed.current = ema(smoothedSpeed.current, decision.speed, SPEED_ALPHA)
        anchor.current = fix
        return
    }
  }, [])

  const onGeolocationError = useCallback((error: GeolocationPositionError) => {
    // A timeout is not a failure — the next fix may well arrive. Only a refused
    // permission is permanent, and only that one takes the session to manual.
    if (error.code === error.PERMISSION_DENIED) {
      setStatus('denied')
      setSource('manual')
      sourceRef.current = 'manual'
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
      return
    }
    setStatus('weak')
  }, [])

  const startWatch = useCallback(() => {
    if (!hasGeolocation()) {
      setStatus('unavailable')
      setSource('manual')
      sourceRef.current = 'manual'
      return
    }
    if (watchId.current !== null) return

    setStatus('acquiring')
    watchId.current = navigator.geolocation.watchPosition(commitFix, onGeolocationError, {
      enableHighAccuracy: true,
      // Never hand back a cached position: a fix from five minutes ago placed
      // at the current timestamp is indistinguishable from a teleport.
      maximumAge: 0,
      timeout: 30_000,
    })
  }, [commitFix, onGeolocationError])

  // ── acquire the signal as soon as the screen opens ──
  //
  // Not when Start is pressed. Two reasons, and the second is the important one.
  //
  // The map has nowhere to point until something reports a position, and until
  // this ran only on Start there was nothing to report — so the camera sat on a
  // hardcoded city centre while the athlete stood somewhere else entirely.
  //
  // And a cold GPS takes tens of seconds to go from a first coarse fix to one
  // accurate enough to measure with. Starting that clock when the athlete opens
  // the screen rather than when they start running means the early, useless
  // fixes are spent standing still, instead of eating the first minutes of the
  // run — which is exactly when a rejected fix costs real distance.
  useEffect(() => {
    if (sourceRef.current === 'manual') return
    startWatch()
    // startWatch is a no-op if a watch is already up, so this composes with
    // both recovery and start without racing either.
  }, [startWatch])

  // ── recovery ──
  // A run found on launch is resumed rather than offered, because the only
  // reason one exists is that the page died mid-session and the user is
  // standing in the street waiting for their app to come back.
  useEffect(() => {
    let cancelled = false

    loadRun(activityKey).then(saved => {
      if (cancelled || !saved) return

      points.current = saved.points
      gaps.current = saved.gaps
      distance.current = saved.meters
      lastFix.current = saved.points[saved.points.length - 1] ?? null
      anchor.current = null // the first new fix re-anchors

      // Time the app was not running is not time the user was not running —
      // but it is time we did not measure. Anything longer than a blink is
      // excluded from elapsed and recorded as a gap, so the total never claims
      // a precision the track cannot support.
      const dead = Date.now() - saved.savedAt
      const pausedMs = saved.pausedMs + (dead > GAP_MS ? dead : 0)
      if (dead > GAP_MS) {
        gaps.current.push({ from: saved.savedAt, to: Date.now() })
      }

      clock.current = { startedAt: saved.startedAt, pausedAt: 0, pausedMs }

      // Splits cannot be rebuilt from a recovered track — it is simplified and
      // carries no cumulative distance — so a record written before splits were
      // persisted resumes counting from where it is now, rather than claiming
      // times for kilometres nobody measured. Anchoring the resumed boundary at
      // the CURRENT elapsed matters as much as anchoring it at the current
      // distance: left at zero, the next kilometre would be timed from the
      // start of the run and report the whole session as one split.
      const resumedAtSec = Math.max(0, (Date.now() - saved.startedAt - pausedMs) / 1000)
      splitState.current = saved.splitState ?? {
        splits: [],
        previous: { meters: saved.meters, seconds: resumedAtSec },
        boundary: { meters: saved.meters, seconds: resumedAtSec },
      }
      lapState.current = saved.laps ?? []
      // Laps run back to back from the start, so where the last one ended is
      // just the sum of them — no extra field to persist and keep in step.
      lastLap.current = lapState.current.reduce(
        (end, lap) => ({ meters: lap.endMeters, seconds: end.seconds + lap.seconds }),
        { meters: 0, seconds: 0 }
      )
      setSplits(splitState.current.splits)
      setLaps(lapState.current)

      setMeters(saved.meters)
      setPointCount(saved.points.length)
      setGapCount(gaps.current.length)
      setRecovered(true)
      setStarted(true)
      startedRef.current = true
      setRunning(true)
      runningRef.current = true
      startWatch()
    })

    return () => { cancelled = true }
  }, [activityKey, startWatch])

  // ── the clock ──
  useEffect(() => {
    lastTick.current = Date.now()

    const id = setInterval(() => {
      const now = Date.now()
      const sinceLast = (now - lastTick.current) / 1000
      lastTick.current = now

      if (!startedRef.current) return

      const reference = runningRef.current ? now : (clock.current.pausedAt || now)
      const elapsed = Math.max(
        0,
        (reference - clock.current.startedAt - clock.current.pausedMs) / 1000
      )
      setElapsedSec(Math.floor(elapsed))

      if (runningRef.current) {
        // Manual mode has no fixes to fold in, so distance comes from the
        // effort dial and real wall-clock time — never from a tick count.
        if (sourceRef.current === 'manual') {
          distance.current += manualSpeed.current * sinceLast
          smoothedSpeed.current = manualSpeed.current
        }
        setMeters(distance.current)
        setSpeedMps(smoothedSpeed.current ?? 0)

        // Splits are folded here, where distance and elapsed are read from the
        // same instant. Sampling them from separate effects is what let a
        // kilometre be timed against an elapsed value from a different tick.
        // Unrounded elapsed, so a split is not quantised to whole seconds twice.
        const before = splitState.current.splits.length
        splitState.current = advanceSplits(splitState.current, {
          meters: distance.current,
          seconds: elapsed,
        })
        if (splitState.current.splits.length !== before) {
          setSplits(splitState.current.splits)
          // A kilometre is worth writing down immediately rather than waiting
          // for the next flush — it is the one moment the user might look away
          // and the phone might die.
          flush()
        }
      }

      if (now - lastFlush.current > FLUSH_MS) flush()
    }, TICK_MS)

    return () => clearInterval(id)
  }, [flush])

  // ── controls ──
  const start = useCallback(() => {
    if (startedRef.current) return
    clock.current = { startedAt: Date.now(), pausedAt: 0, pausedMs: 0 }
    // A second run in the same mounted screen must not inherit the first one's
    // kilometres — stop() leaves them in place so the caller can still read the
    // summary it was handed.
    splitState.current = emptySplitState()
    lapState.current = []
    lastLap.current = { meters: 0, seconds: 0 }
    setSplits([])
    setLaps([])
    setStarted(true)
    startedRef.current = true
    setRunning(true)
    runningRef.current = true
    startWatch()
    flush()
  }, [startWatch, flush])

  const pause = useCallback(() => {
    if (!runningRef.current) return
    clock.current.pausedAt = Date.now()
    setRunning(false)
    runningRef.current = false
    // Dropping the anchor means the distance covered while "paused" is never
    // silently added when tracking resumes.
    anchor.current = null
    smoothed.current = null
    smoothedSpeed.current = 0
    setSpeedMps(0)
    flush()
  }, [flush])

  const resume = useCallback(() => {
    if (runningRef.current || !startedRef.current) return
    if (clock.current.pausedAt) {
      clock.current.pausedMs += Date.now() - clock.current.pausedAt
      clock.current.pausedAt = 0
    }
    setRunning(true)
    runningRef.current = true
    // Both cleared: the user may be somewhere else entirely, and neither the
    // gap check nor the smoothing should reach back across the pause.
    lastFix.current = null
    smoothed.current = null
    startWatch()
  }, [startWatch])

  /**
   * Mark a lap by hand.
   *
   * Measured against the previous lap only. Kilometre splits keep their own
   * origin, so pressing Lap mid-kilometre no longer re-times the kilometre.
   */
  const lap = useCallback(() => {
    if (!startedRef.current) return

    const reference = runningRef.current ? Date.now() : (clock.current.pausedAt || Date.now())
    const seconds = Math.max(
      0,
      (reference - clock.current.startedAt - clock.current.pausedMs) / 1000
    )
    const meters = distance.current

    lapState.current = [...lapState.current, {
      index: lapState.current.length + 1,
      meters: meters - lastLap.current.meters,
      seconds: seconds - lastLap.current.seconds,
      endMeters: meters,
      auto: false,
    }]
    lastLap.current = { meters, seconds }
    setLaps(lapState.current)
    flush()
  }, [flush])

  const stop = useCallback((): RunSummary => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    runningRef.current = false
    startedRef.current = false
    setRunning(false)

    const reference = clock.current.pausedAt || Date.now()
    const elapsed = Math.max(
      0,
      Math.floor((reference - clock.current.startedAt - clock.current.pausedMs) / 1000)
    )
    const track = simplify(points.current, 5)
    const route = encodeRoute(track)

    // The stretch since the last whole kilometre, which no boundary will ever
    // close now that the run is over.
    const tail = finalSplit(splitState.current, {
      meters: distance.current,
      seconds: elapsed,
    })
    const splits = tail
      ? [...splitState.current.splits, tail]
      : splitState.current.splits

    const summary: RunSummary = {
      meters: distance.current,
      elapsedSec: elapsed,
      track,
      route,
      bounds: routeBounds(route),
      gaps: gaps.current,
      // From the unrounded distance, before the caller rounds it for storage
      avgPaceSec: Math.round(averagePace(distance.current, elapsed)),
      splits,
      laps: lapState.current,
      elevationGainM: elevationGain(points.current),
      startedAt: clock.current.startedAt,
      source: sourceRef.current,
    }

    // Only once the session has been turned into a summary the caller owns —
    // clearing earlier would lose the run if writing the set then failed.
    void clearRun()
    return summary
  }, [])

  /**
   * Throw away a recovered run and start clean.
   *
   * A run is resumed rather than offered, because the usual reason one exists is
   * that the page died mid-session and the athlete is standing in the street
   * waiting. But the same rule catches a session that was abandoned an hour ago
   * and never ended — and that one arrives carrying somebody's old track, an old
   * distance and an old clock, with no way to say no to it.
   *
   * The watch is deliberately left running afterwards: the athlete is still
   * standing there, still about to run, and still wants a GPS lock.
   */
  const discard = useCallback(() => {
    points.current = []
    gaps.current = []
    anchor.current = null
    lastFix.current = null
    smoothed.current = null
    distance.current = 0
    smoothedSpeed.current = null
    splitState.current = emptySplitState()
    lapState.current = []
    lastLap.current = { meters: 0, seconds: 0 }
    clock.current = { startedAt: 0, pausedAt: 0, pausedMs: 0 }
    runningRef.current = false
    startedRef.current = false

    setStarted(false)
    setRunning(false)
    setRecovered(false)
    setElapsedSec(0)
    setMeters(0)
    setSpeedMps(0)
    setPointCount(0)
    setGapCount(0)
    setSplits([])
    setLaps([])

    void clearRun()
  }, [])

  const setManualSpeed = useCallback((mps: number) => {
    manualSpeed.current = mps
  }, [])

  /** Switch to the effort dial deliberately — treadmill, track, or no signal. */
  const useManual = useCallback(() => {
    sourceRef.current = 'manual'
    setSource('manual')
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [])

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  return {
    status, source, started, running, recovered,
    elapsedSec, meters, speedMps, accuracy, pointCount, gapCount,
    splits, laps, position,
    /** Distance over time — the number a run is judged by. Zero until moving. */
    avgPaceSec: averagePace(meters, elapsedSec),
    start, pause, resume, lap, stop, discard, setManualSpeed, useManual,
    getPoints: () => points.current,
  }
}

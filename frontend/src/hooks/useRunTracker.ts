import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GAP_MS, MAX_ACCURACY_M, RouteSegment, Split, SplitState, TrackPoint,
  advanceSplits, averagePace, elevationGain, ema, emptySplitState, encodeSegments,
  evaluateFix, finalSplit, isGap, routeBounds, segmentTrack, smoothPosition,
} from '../lib/geo'
import { SavedRun, TrackGap, clearRun, loadRun, saveRun } from '../lib/runStorage'

/**
 * A live outdoor session: elapsed time, distance, speed and route.
 * Distance accumulates only when the position has moved far enough from its
 * anchor to be movement rather than GPS noise (see commitFix). Elapsed time
 * is computed from timestamps, never counted up by ticks.
 */

/** Smoothing weight for each new speed reading. */
const SPEED_ALPHA = 0.3
/** How often the session is mirrored to IndexedDB. */
const FLUSH_MS = 5_000
/** Display refresh interval. */
const TICK_MS = 250

/** Window for the coachable rolling pace — steadier than live speed, more responsive than the average. */
const PACE_WINDOW_SEC = 45
/** Minimum window span to compute a pace. */
const PACE_MIN_SPAN_SEC = 20
/** Minimum distance in the window to compute a pace. */
const PACE_MIN_METRES = 25

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
  /** Simplified for storage and drawing. */
  track: TrackPoint[]
  /** Gap-segmented, rounded route, ready to store and draw. */
  route: RouteSegment[]
  bounds: [[number, number], [number, number]] | null
  gaps: TrackGap[]
  /** Average s/km, from unrounded distance (the stored distance is rounded). */
  avgPaceSec: number
  splits: Split[]
  laps: Split[]
  elevationGainM: number
  startedAt: number
  source: RunSource
}

const hasGeolocation = () =>
  typeof navigator !== 'undefined' && 'geolocation' in navigator

/**
 * @param initialSource 'manual' for movements the phone can't measure (erg,
 * treadmill, pool). Must be known at construction, or the location prompt is
 * raised for a session that never uses GPS.
 */
export const useRunTracker = (activityKey: string, initialSource: RunSource = 'gps') => {
  const [status, setStatus] = useState<RunStatus>('idle')
  const [source, setSource] = useState<RunSource>(initialSource)
  const [started, setStarted] = useState(false)
  const [running, setRunning] = useState(false)
  const [recovered, setRecovered] = useState(false)

  const [elapsedSec, setElapsedSec] = useState(0)
  const [meters, setMeters] = useState(0)
  const [speedMps, setSpeedMps] = useState(0)
  /** s/km over the last PACE_WINDOW_SEC; 0 until measurable. */
  const [rollingPaceSec, setRollingPaceSec] = useState(0)
  /**
   * Average pace, computed in the tick from unfloored elapsed time and the same
   * instant's distance (dividing the displayed values makes it sawtooth).
   */
  const [avgPaceSec, setAvgPaceSec] = useState(0)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  /** The last reported position, believed or not — the map follows it before the first usable fix. */
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [pointCount, setPointCount] = useState(0)
  const [gapCount, setGapCount] = useState(0)
  const [splits, setSplits] = useState<Split[]>([])
  const [laps, setLaps] = useState<Split[]>([])

  // Refs, since the interval and geolocation callbacks run outside render
  const points = useRef<TrackPoint[]>([])
  const gaps = useRef<TrackGap[]>([])
  const anchor = useRef<TrackPoint | null>(null)
  const lastFix = useRef<TrackPoint | null>(null)
  /** Running low-pass of position (see smoothPosition). */
  const smoothed = useRef<TrackPoint | null>(null)
  const distance = useRef(0)
  /** Kilometre splits, folded forward per sample (see advanceSplits). */
  const splitState = useRef<SplitState>(emptySplitState())
  const lapState = useRef<Split[]>([])
  /** Where the last manual lap ended. */
  const lastLap = useRef({ meters: 0, seconds: 0 })
  const smoothedSpeed = useRef<number | null>(null)
  /** Recent (elapsed, distance) samples for the rolling pace; elapsed, so pauses leave no hole. */
  const paceWindow = useRef<Array<{ seconds: number; meters: number }>>([])
  const manualSpeed = useRef(2.85)
  const watchId = useRef<number | null>(null)
  const lastTick = useRef<number>(0)
  const lastFlush = useRef<number>(0)
  const clock = useRef({ startedAt: 0, pausedAt: 0 as number | 0, pausedMs: 0 })
  const runningRef = useRef(false)
  const sourceRef = useRef<RunSource>(initialSource)
  const startedRef = useRef(false)

  /** Rolling pace (s/km) over the trailing window; trimmed from the front, appended only while running. */
  const sampleRollingPace = useCallback((elapsed: number): number => {
    const window = paceWindow.current
    window.push({ seconds: elapsed, meters: distance.current })
    while (window.length > 2 && elapsed - window[0].seconds > PACE_WINDOW_SEC) window.shift()

    const oldest = window[0]
    const seconds = elapsed - oldest.seconds
    const meters = distance.current - oldest.meters
    if (seconds < PACE_MIN_SPAN_SEC || meters < PACE_MIN_METRES) return 0
    return averagePace(meters, seconds)
  }, [])

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
   * Fold one GPS fix into the session: cheap rejections first, and the anchor
   * only moves on a believed fix, so standing still costs nothing.
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
    // Position updates even before Start — the map needs it
    setPosition({ lat: raw.lat, lng: raw.lng, accuracy: raw.accuracy })

    if (!runningRef.current) return
    // In manual mode the dial owns distance
    if (sourceRef.current === 'manual') return

    // Reset smoothing before smoothing a fix after a gap
    if (isGap(lastFix.current, raw)) smoothed.current = null

    const fix = smoothPosition(smoothed.current, raw)
    const decision = evaluateFix(fix, anchor.current, lastFix.current)

    // Every believed fix advances `previous` (the gap check measures from it)
    if (decision.kind !== 'reject') {
      lastFix.current = fix
      smoothed.current = fix
    }

    switch (decision.kind) {
      case 'reject':
        return

      case 'hold':
        // The anchor stays put; only a stationary fix decays the displayed speed
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
    // Only a refused permission is permanent (switches to manual); timeouts are not
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
    if (sourceRef.current === 'manual') return
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
      // Never a cached position — it would appear as a teleport
      maximumAge: 0,
      timeout: 30_000,
    })
  }, [commitFix, onGeolocationError])

  // ── acquire the signal as soon as the screen opens ──
  // So the map can centre on the athlete, and a cold GPS settles before the run starts.
  useEffect(() => {
    if (sourceRef.current === 'manual') return
    startWatch()
    // startWatch is a no-op when already watching
  }, [startWatch])

  // ── recovery ──
  // ── recovery ──
  // A saved run is resumed automatically: the page died mid-session.
  useEffect(() => {
    let cancelled = false

    loadRun(activityKey).then(saved => {
      if (cancelled || !saved) return

      points.current = saved.points
      gaps.current = saved.gaps
      distance.current = saved.meters
      lastFix.current = saved.points[saved.points.length - 1] ?? null
      anchor.current = null // the next fix re-anchors

      // Time the app wasn't running is excluded from elapsed and recorded as a gap
      const dead = Date.now() - saved.savedAt
      const pausedMs = saved.pausedMs + (dead > GAP_MS ? dead : 0)
      if (dead > GAP_MS) {
        gaps.current.push({ from: saved.savedAt, to: Date.now() })
      }

      clock.current = { startedAt: saved.startedAt, pausedAt: 0, pausedMs }

      // Splits can't be rebuilt from the saved track: without saved splits,
      // counting resumes from the current distance and elapsed time
      const resumedAtSec = Math.max(0, (Date.now() - saved.startedAt - pausedMs) / 1000)
      splitState.current = saved.splitState ?? {
        splits: [],
        previous: { meters: saved.meters, seconds: resumedAtSec },
        boundary: { meters: saved.meters, seconds: resumedAtSec },
      }
      lapState.current = saved.laps ?? []
      // The last lap ended at the sum of all laps
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
        // Manual: distance from the effort dial and wall-clock time
        if (sourceRef.current === 'manual') {
          distance.current += manualSpeed.current * sinceLast
          smoothedSpeed.current = manualSpeed.current
        }
        setMeters(distance.current)
        setSpeedMps(smoothedSpeed.current ?? 0)
        setRollingPaceSec(sampleRollingPace(elapsed))
        setAvgPaceSec(averagePace(distance.current, elapsed))

        // Splits folded here, where distance and elapsed come from the same instant
        const before = splitState.current.splits.length
        splitState.current = advanceSplits(splitState.current, {
          meters: distance.current,
          seconds: elapsed,
        })
        if (splitState.current.splits.length !== before) {
          setSplits(splitState.current.splits)
          // Persist immediately after each kilometre
          flush()
        }
      }

      if (now - lastFlush.current > FLUSH_MS) flush()
    }, TICK_MS)

    return () => clearInterval(id)
  }, [flush, sampleRollingPace])

  // ── controls ──
  const start = useCallback(() => {
    if (startedRef.current) return
    clock.current = { startedAt: Date.now(), pausedAt: 0, pausedMs: 0 }
    // A new run must not inherit the previous run's splits
    splitState.current = emptySplitState()
    lapState.current = []
    lastLap.current = { meters: 0, seconds: 0 }
    paceWindow.current = []
    setRollingPaceSec(0)
    setAvgPaceSec(0)
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
    // No pace while stopped: clear the window
    paceWindow.current = []
    setRollingPaceSec(0)
    // Drop the anchor so distance covered while paused is never added
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
    // Cleared: the athlete may have moved during the pause
    lastFix.current = null
    smoothed.current = null
    startWatch()
  }, [startWatch])

  /** Mark a lap by hand, measured from the previous lap (kilometre splits are unaffected). */
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
    // Segment on gaps first, then thin each segment (see segmentTrack)
    const segments = segmentTrack(points.current, 5)
    const track = segments.flat()
    const route = encodeSegments(segments)

    // The partial last kilometre
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
      // From the unrounded distance
      avgPaceSec: Math.round(averagePace(distance.current, elapsed)),
      splits,
      laps: lapState.current,
      elevationGainM: elevationGain(points.current),
      startedAt: clock.current.startedAt,
      source: sourceRef.current,
    }

    // Cleared only once the summary is handed over
    void clearRun()
    return summary
  }, [])

  /**
   * Discard a recovered run and start clean (e.g. one abandoned long ago).
   * The GPS watch keeps running.
   */
  const discard = useCallback(() => {
    points.current = []
    gaps.current = []
    anchor.current = null
    lastFix.current = null
    smoothed.current = null
    distance.current = 0
    smoothedSpeed.current = null
    paceWindow.current = []
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
    setRollingPaceSec(0)
    setAvgPaceSec(0)
    setPointCount(0)
    setGapCount(0)
    setSplits([])
    setLaps([])

    void clearRun()
  }, [])

  const setManualSpeed = useCallback((mps: number) => {
    manualSpeed.current = mps
  }, [])

  /** Switch distance to the manual dial (treadmill, track, no signal). */
  const useManual = useCallback(() => {
    sourceRef.current = 'manual'
    setSource('manual')
    // Clear both the window and the published pace
    paceWindow.current = []
    setRollingPaceSec(0)
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [])

  /** Switch back to GPS. */
  const useGps = useCallback(() => {
    sourceRef.current = 'gps'
    setSource('gps')
    // Positional state is stale
    anchor.current = null
    lastFix.current = null
    smoothed.current = null
    paceWindow.current = []
    setRollingPaceSec(0)
    // Clear the dial's typed speed so it is not blended into the first GPS reading
    smoothedSpeed.current = null
    setSpeedMps(0)
    setStatus('acquiring')
    startWatch()
  }, [startWatch])

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  return {
    status, source, started, running, recovered,
    elapsedSec, meters, speedMps, accuracy, pointCount, gapCount,
    splits, laps, position,
    /** Pace over the last ~45 s (for coaching); 0 if unknown. */
    rollingPaceSec,
    /** Average pace over the whole run. */
    avgPaceSec,
    start, pause, resume, lap, stop, discard, setManualSpeed, useManual, useGps,
    getPoints: () => points.current,
  }
}

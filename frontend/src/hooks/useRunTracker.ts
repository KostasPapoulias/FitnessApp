import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GAP_MS, MAX_ACCURACY_M, TrackPoint,
  elevationGain, ema, evaluateFix, isGap, simplify, smoothPosition,
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
  gaps: TrackGap[]
  elevationGainM: number
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
  const [pointCount, setPointCount] = useState(0)
  const [gapCount, setGapCount] = useState(0)

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
      setElapsedSec(
        Math.max(0, Math.floor((reference - clock.current.startedAt - clock.current.pausedMs) / 1000))
      )

      if (runningRef.current) {
        // Manual mode has no fixes to fold in, so distance comes from the
        // effort dial and real wall-clock time — never from a tick count.
        if (sourceRef.current === 'manual') {
          distance.current += manualSpeed.current * sinceLast
          smoothedSpeed.current = manualSpeed.current
        }
        setMeters(distance.current)
        setSpeedMps(smoothedSpeed.current ?? 0)
      }

      if (now - lastFlush.current > FLUSH_MS) flush()
    }, TICK_MS)

    return () => clearInterval(id)
  }, [flush])

  // ── controls ──
  const start = useCallback(() => {
    if (startedRef.current) return
    clock.current = { startedAt: Date.now(), pausedAt: 0, pausedMs: 0 }
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

  const stop = useCallback((): RunSummary => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    runningRef.current = false
    startedRef.current = false
    setRunning(false)

    const reference = clock.current.pausedAt || Date.now()
    const summary: RunSummary = {
      meters: distance.current,
      elapsedSec: Math.max(
        0,
        Math.floor((reference - clock.current.startedAt - clock.current.pausedMs) / 1000)
      ),
      track: simplify(points.current, 5),
      gaps: gaps.current,
      elevationGainM: elevationGain(points.current),
      source: sourceRef.current,
    }

    // Only once the session has been turned into a summary the caller owns —
    // clearing earlier would lose the run if writing the set then failed.
    void clearRun()
    return summary
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
    start, pause, resume, stop, setManualSpeed, useManual,
    getPoints: () => points.current,
  }
}

/**
 * Pure geometry for GPS tracks: distance, pace, splits, fix filtering and
 * route simplification. The filtering rules that use it live in useRunTracker.
 */

/** IUGG mean earth radius. */
const EARTH_RADIUS_M = 6_371_008.8

const toRad = (deg: number) => (deg * Math.PI) / 180

export interface TrackPoint {
  lat: number
  lng: number
  /** Epoch ms, from the fix itself. */
  t: number
  /** Horizontal accuracy radius in metres (68% confidence). */
  accuracy: number
  /** Metres above the WGS84 ellipsoid; null when unreported. */
  altitude: number | null
  /** Doppler ground speed in m/s — more accurate than position deltas, when present. */
  speed: number | null
}

/** Great-circle distance in metres (haversine). */
export const haversine = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number => {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Exponential moving average; alpha is the weight of the new reading (lower = smoother). */
export const ema = (previous: number | null, next: number, alpha: number): number =>
  previous === null ? next : previous + alpha * (next - previous)

/** Seconds per kilometre from m/s; 0 for zero speed. */
export const paceFromSpeed = (metersPerSecond: number): number =>
  metersPerSecond > 0.1 ? 1000 / metersPerSecond : 0

/**
 * Seconds per kilometre over a whole stretch. Unlike paceFromSpeed it doesn't
 * collapse to zero when the athlete stops, so it's what a finished run reports.
 */
export const averagePace = (meters: number, seconds: number): number =>
  meters > 0 && seconds > 0 ? seconds / (meters / 1000) : 0

// ── splits ────────────────────────────────────────────────────────────────

/** One completed stretch; `meters`/`seconds` are deltas, `endMeters` is cumulative. */
export interface Split {
  /** 1-based; for auto splits, the kilometre number. */
  index: number
  meters: number
  seconds: number
  endMeters: number
  /** Marked by the kilometre counter, not the athlete. */
  auto: boolean
  /** The tail after the last full kilometre; shown apart since its pace is noisier. */
  partial?: boolean
}

/** Shortest trailing stretch worth its own split. */
const MIN_PARTIAL_SPLIT_M = 50

/** Close out the stretch after the last full kilometre, when the run ends. */
export const finalSplit = (state: SplitState, final: RunSample): Split | null => {
  const meters = final.meters - state.boundary.meters
  const seconds = final.seconds - state.boundary.seconds
  if (meters < MIN_PARTIAL_SPLIT_M || seconds <= 0) return null

  return {
    index: Math.floor(state.boundary.meters / 1000) + 1,
    meters,
    seconds,
    endMeters: final.meters,
    auto: true,
    partial: true,
  }
}

/** Seconds per kilometre for one split. */
export const splitPace = (split: Split): number =>
  averagePace(split.meters, split.seconds)

/** Both running totals, sampled together. */
export interface RunSample {
  meters: number
  seconds: number
}

export interface SplitState {
  splits: Split[]
  /** The previous sample, to measure the leg that crosses a boundary. */
  previous: RunSample
  /** Where the last boundary fell; the next split is timed from it. */
  boundary: RunSample
}

export const emptySplitState = (): SplitState => ({
  splits: [],
  previous: { meters: 0, seconds: 0 },
  boundary: { meters: 0, seconds: 0 },
})

/**
 * Fold one sample into the kilometre splits. O(1) per call.
 * A `while`, since one sample after a stall can cross several kilometres;
 * the crossing is interpolated so overshoot isn't charged to the split.
 * Manual laps are tracked separately.
 */
export const advanceSplits = (state: SplitState, sample: RunSample): SplitState => {
  // A backwards sample would produce a negative split
  if (sample.meters < state.previous.meters || sample.seconds < state.previous.seconds) {
    return { ...state, previous: sample }
  }

  let { splits, boundary } = state
  let previous = state.previous

  // Next mark from the last boundary, not the split count, so a recovered run
  // continues at the right kilometre
  while (sample.meters >= Math.floor(boundary.meters / 1000) * 1000 + 1000) {
    const mark = Math.floor(boundary.meters / 1000) * 1000 + 1000
    const legMeters = sample.meters - previous.meters
    const legSeconds = sample.seconds - previous.seconds
    const crossedAt =
      legMeters > 0
        ? previous.seconds + legSeconds * ((mark - previous.meters) / legMeters)
        : sample.seconds

    splits = [...splits, {
      index: mark / 1000,
      meters: mark - boundary.meters,
      seconds: crossedAt - boundary.seconds,
      endMeters: mark,
      auto: true,
    }]
    boundary = { meters: mark, seconds: crossedAt }
    // The rest of this leg belongs to the next split
    previous = { meters: mark, seconds: crossedAt }
  }

  return { splits, previous: sample, boundary }
}

/** Total climb in metres; only rises past the threshold count, to ignore altitude drift. */
export const elevationGain = (points: TrackPoint[], thresholdM = 3): number => {
  let gain = 0
  let reference: number | null = null

  for (const point of points) {
    if (point.altitude === null) continue
    if (reference === null) {
      reference = point.altitude
      continue
    }
    const delta = point.altitude - reference
    if (delta >= thresholdM) {
      gain += delta
      reference = point.altitude
    } else if (delta <= -thresholdM) {
      // Descending: measure the next climb from the bottom of the dip
      reference = point.altitude
    }
  }

  return Math.round(gain)
}

// ── which fixes to believe ────────────────────────────────────────────────

/** Fixes vaguer than this are rejected. */
export const MAX_ACCURACY_M = 25
/** Floor for the movement threshold, for a fix claiming sub-metre accuracy. */
export const MIN_MOVE_M = 4
/**
 * Movement threshold as a fraction of the fix's accuracy. At 1, movement
 * smaller than the stated error never counts (lower values let drift add distance).
 */
export const DRIFT_FACTOR = 1.0
/** Weight of each new fix in the smoothed position; averaging cancels drift but keeps movement. */
export const POSITION_ALPHA = 0.4
/** ~90 km/h; anything faster is a GPS jump. */
export const MAX_PLAUSIBLE_MPS = 25
/** Below this the athlete is standing still. */
export const STATIONARY_MPS = 0.5
/** A silence this long is a gap (lock, tunnel, app killed). */
export const GAP_MS = 20_000

/**
 * Low-pass the position before any distance is measured, so the route and the
 * total share one track. `previous = null` starts fresh (first fix, or after a gap).
 */
export const smoothPosition = (
  previous: TrackPoint | null,
  fix: TrackPoint,
  alpha = POSITION_ALPHA
): TrackPoint =>
  previous === null
    ? fix
    : {
        ...fix,
        lat: previous.lat + alpha * (fix.lat - previous.lat),
        lng: previous.lng + alpha * (fix.lng - previous.lng),
      }

/** Whether this fix follows a silence; checked before smoothing so it isn't averaged across the gap. */
export const isGap = (previous: TrackPoint | null, fix: TrackPoint): boolean =>
  previous !== null && fix.t - previous.t > GAP_MS

export type FixDecision =
  /** Unusable, or a correction rather than movement. Changes nothing. */
  | { kind: 'reject'; reason: 'accuracy' | 'teleport' }
  /** Believed, but no distance: the first fix, or the first after a gap. */
  | { kind: 'anchor' }
  /** Believed, and the silence before it is recorded as unmeasured. */
  | { kind: 'gap'; from: number; to: number }
  /** Believed, but not yet movement; the anchor stays put. */
  | { kind: 'hold'; stationary: boolean }
  /** Real movement. */
  | { kind: 'advance'; meters: number; speed: number }

/**
 * Decide what one GPS fix means, given the anchor. Rules, cheapest first:
 *   1. accuracy worse than MAX_ACCURACY_M → reject
 *   2. silence longer than GAP_MS → gap, no distance across it
 *   3. implied speed above MAX_PLAUSIBLE_MPS → reject (a GPS jump)
 *   4. reported speed below STATIONARY_MPS → hold
 *   5. movement must clear the fix's noise floor → otherwise hold
 * `hold` keeps the anchor fixed so a slow walk still accumulates honestly.
 */
export const evaluateFix = (
  fix: TrackPoint,
  anchor: TrackPoint | null,
  previous: TrackPoint | null
): FixDecision => {
  if (fix.accuracy > MAX_ACCURACY_M) return { kind: 'reject', reason: 'accuracy' }
  if (!anchor || !previous) return { kind: 'anchor' }

  if (isGap(previous, fix)) {
    return { kind: 'gap', from: previous.t, to: fix.t }
  }

  const meters = haversine(anchor, fix)
  const seconds = (fix.t - anchor.t) / 1000

  if (seconds > 0 && meters / seconds > MAX_PLAUSIBLE_MPS) {
    return { kind: 'reject', reason: 'teleport' }
  }

  const reported = fix.speed
  const stationary = reported !== null && reported >= 0 && reported < STATIONARY_MPS
  if (stationary) return { kind: 'hold', stationary: true }

  if (meters < Math.max(MIN_MOVE_M, fix.accuracy * DRIFT_FACTOR)) {
    return { kind: 'hold', stationary: false }
  }

  // Prefer the GPS's own speed; fall back to what this leg implies
  const legSpeed = seconds > 0 ? meters / seconds : 0
  return {
    kind: 'advance',
    meters,
    speed: reported !== null && reported >= 0 ? reported : legSpeed,
  }
}

/** Split a track at recording gaps, so no straight line is drawn across them. */
export const splitOnGaps = (points: TrackPoint[]): TrackPoint[][] => {
  const segments: TrackPoint[][] = []
  let current: TrackPoint[] = []

  for (const point of points) {
    const previous = current[current.length - 1]
    if (previous && point.t - previous.t > GAP_MS) {
      segments.push(current)
      current = []
    }
    current.push(point)
  }

  if (current.length > 0) segments.push(current)
  // A single point draws nothing
  return segments.filter(segment => segment.length >= 2)
}

/** Equirectangular projection in metres around an origin; accurate over a track's few km. */
const project = (
  point: { lat: number; lng: number },
  origin: { lat: number; lng: number }
): { x: number; y: number } => ({
  x: toRad(point.lng - origin.lng) * Math.cos(toRad(origin.lat)) * EARTH_RADIUS_M,
  y: toRad(point.lat - origin.lat) * EARTH_RADIUS_M,
})

/** Distance from p to segment ab, in projected metres. */
const distanceToSegment = (
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy

  // Degenerate segment
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y)

  // Clamped, so it measures to the segment rather than the line
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Ramer–Douglas–Peucker simplification, tolerance in metres. Iterative, so a
 * long track can't overflow the stack.
 */
export const simplify = (points: TrackPoint[], toleranceM = 5): TrackPoint[] => {
  if (points.length <= 2) return points.slice()

  const origin = points[0]
  const projected = points.map(p => project(p, origin))
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true

  const stack: Array<[number, number]> = [[0, points.length - 1]]

  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    if (last <= first + 1) continue

    let furthest = -1
    let furthestDistance = 0

    for (let i = first + 1; i < last; i++) {
      const distance = distanceToSegment(projected[i], projected[first], projected[last])
      if (distance > furthestDistance) {
        furthestDistance = distance
        furthest = i
      }
    }

    if (furthestDistance > toleranceM && furthest > 0) {
      keep[furthest] = true
      stack.push([first, furthest], [furthest, last])
    }
  }

  return points.filter((_, index) => keep[index])
}

// ── storing a finished route ──────────────────────────────────────────────

/** Consecutive positions as [lng, lat] (GeoJSON order). */
export type RouteSegment = Array<[number, number]>

/** Five decimals (~1.1 m): finer than GPS, about half the stored size. */
const round5 = (n: number) => Math.round(n * 1e5) / 1e5

/**
 * Split on gaps first, then simplify each segment. The reverse order makes
 * simplified straights look like gaps and breaks the route into fragments.
 */
export const segmentTrack = (points: TrackPoint[], toleranceM = 5): TrackPoint[][] =>
  splitOnGaps(points).map(segment => simplify(segment, toleranceM))

/** Rounded [lng, lat] pairs from already split and thinned segments. */
export const encodeSegments = (segments: TrackPoint[][]): RouteSegment[] =>
  segments.map(segment =>
    segment.map(p => [round5(p.lng), round5(p.lat)] as [number, number])
  )

/** A track ready to store and draw, segmented on gaps. Takes the raw track (see segmentTrack). */
export const encodeRoute = (points: TrackPoint[], toleranceM = 5): RouteSegment[] =>
  encodeSegments(segmentTrack(points, toleranceM))

/** [[west, south], [east, north]], or null for an empty route. */
export const routeBounds = (
  segments: RouteSegment[]
): [[number, number], [number, number]] | null => {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity

  for (const segment of segments) {
    for (const [lng, lat] of segment) {
      if (lng < west) west = lng
      if (lng > east) east = lng
      if (lat < south) south = lat
      if (lat > north) north = lat
    }
  }

  return Number.isFinite(west) ? [[west, south], [east, north]] : null
}

/**
 * Geometry for GPS tracks. Pure functions, no browser APIs — everything here
 * can be reasoned about and tested without a phone or a permission prompt.
 *
 * The hard part of a run tracker is not reading the GPS, it is deciding which
 * readings to believe. A phone standing still reports a position that wanders
 * several metres between fixes, and naively summing those wanders is how a 5k
 * logs as 5.4k. The filtering rules live in useRunTracker; this file provides
 * the measurements they are built from.
 */

/** IUGG mean earth radius. */
const EARTH_RADIUS_M = 6_371_008.8

const toRad = (deg: number) => (deg * Math.PI) / 180

export interface TrackPoint {
  lat: number
  lng: number
  /** Epoch ms, from the fix itself rather than when we processed it. */
  t: number
  /** Horizontal accuracy in metres — the radius of the 68% confidence circle. */
  accuracy: number
  /** Metres above the WGS84 ellipsoid. Null on devices that won't say. */
  altitude: number | null
  /**
   * Ground speed in m/s, straight from the GPS. Derived from Doppler shift
   * rather than from consecutive positions, so it is both more accurate and
   * more responsive than anything we could compute — when it is present at all.
   */
  speed: number | null
}

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than the planar approximation: the error is negligible at
 * these distances either way, but haversine costs nothing extra and does not
 * quietly degrade near the poles or across the antimeridian.
 */
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

/**
 * Exponential moving average.
 *
 * Raw GPS speed jitters by a km/h or more between fixes even at a steady pace,
 * and a number that flickers is a number people stop trusting. Alpha is the
 * weight of the NEW reading: lower is smoother and laggier.
 */
export const ema = (previous: number | null, next: number, alpha: number): number =>
  previous === null ? next : previous + alpha * (next - previous)

/** Seconds per kilometre from a speed in m/s. Zero speed has no pace. */
export const paceFromSpeed = (metersPerSecond: number): number =>
  metersPerSecond > 0.1 ? 1000 / metersPerSecond : 0

/**
 * Seconds per kilometre over a whole stretch.
 *
 * This is the number a run is actually judged by, and it is NOT the same thing
 * as paceFromSpeed: that one reads the current smoothed speed, so it collapses
 * to zero the moment someone stops — which is exactly when a finished run gets
 * summarised. Average pace is distance over time and cannot do that.
 */
export const averagePace = (meters: number, seconds: number): number =>
  meters > 0 && seconds > 0 ? seconds / (meters / 1000) : 0

// ── splits ────────────────────────────────────────────────────────────────

/**
 * One completed stretch of a run.
 *
 * `meters` and `seconds` are always deltas — what THIS split cost — because a
 * split whose distance is cumulative cannot be turned into a pace. `endMeters`
 * carries the cumulative position separately for anyone who needs to place the
 * split along the run.
 */
export interface Split {
  /** 1-based. For auto splits this is also the kilometre number. */
  index: number
  meters: number
  seconds: number
  endMeters: number
  /** Marked by the kilometre counter rather than by the athlete. */
  auto: boolean
  /**
   * The stretch after the last full kilometre, closed out when the run ended.
   *
   * Shown apart from the others because its pace is measured over a shorter
   * distance and is correspondingly noisier — a 120m tail at 4:40 is not
   * evidence of a fast finish.
   */
  partial?: boolean
}

/** Distance below which a trailing stretch is not worth a row of its own. */
const MIN_PARTIAL_SPLIT_M = 50

/**
 * Close out the stretch after the last full kilometre.
 *
 * Called once, when the run ends. Without it a 900m run reports no splits at
 * all — which reads exactly like the bug where every split showed zero.
 */
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

/** A sample of the run's two running totals, taken together. */
export interface RunSample {
  meters: number
  seconds: number
}

export interface SplitState {
  splits: Split[]
  /** The previous sample, so the leg that crosses a boundary can be measured. */
  previous: RunSample
  /** Where the last boundary fell — the origin the next split is timed from. */
  boundary: RunSample
}

export const emptySplitState = (): SplitState => ({
  splits: [],
  previous: { meters: 0, seconds: 0 },
  boundary: { meters: 0, seconds: 0 },
})

/**
 * Fold one sample into the kilometre splits.
 *
 * Pure and O(1) per call, so the live screen can hand it every tick without
 * keeping a sample history. Two things it fixes over counting kilometres by
 * hand:
 *
 * MULTIPLE BOUNDARIES. The `while` matters. After a stall — a locked phone, a
 * throttled tab — distance and elapsed both jump, and a single sample can cross
 * two or three kilometres at once. An `if` silently drops all but one.
 *
 * INTERPOLATION. Fixes land about a second apart and a runner covers three to
 * five metres in that time, so the sample that first reads past 1000m is
 * already several metres beyond it. Charging that overshoot to the split is
 * what makes an even pace produce splits that alternate fast and slow. Assuming
 * constant speed across the crossing leg puts the boundary where it belongs.
 *
 * Manual laps deliberately do not live here. They shared a counter with the
 * kilometre splits before, which left every automatic split after a lap timed
 * from the lap rather than from the previous kilometre.
 */
export const advanceSplits = (state: SplitState, sample: RunSample): SplitState => {
  // Elapsed only ever moves forward; distance can be re-read flat. Neither may
  // go backwards, and a backwards sample would produce a negative split.
  if (sample.meters < state.previous.meters || sample.seconds < state.previous.seconds) {
    return { ...state, previous: sample }
  }

  let { splits, boundary } = state
  let previous = state.previous

  // The next mark is derived from where the last boundary fell, not from how
  // many splits have been recorded. They are the same thing on a run tracked
  // start to finish, and they are not the same thing on one recovered from a
  // crash — a resumed run that had already covered 3.2km must post its next
  // split at 4km, rather than replay kilometres one to three with no times.
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

/**
 * Total climb in metres, ignoring descent.
 *
 * Barometric altitude is noisy — several metres of drift while stationary — so
 * only rises past a threshold count. Without it a flat run accumulates a
 * few hundred metres of imaginary climbing.
 */
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
      // Descending: move the reference down so the next climb is measured from
      // the bottom of the dip rather than from the top of the previous hill.
      reference = point.altitude
    }
  }

  return Math.round(gain)
}

// ── which fixes to believe ────────────────────────────────────────────────

/** Fixes worse than this are noise pretending to be a position. */
export const MAX_ACCURACY_M = 25
/** Floor for the movement threshold, for a fix claiming sub-metre accuracy. */
export const MIN_MOVE_M = 4
/**
 * Movement threshold as a fraction of the fix's own claimed accuracy.
 *
 * One, not a half: you cannot claim to have measured a movement smaller than
 * your own stated measurement error. At a half, a phone standing still on a
 * device that reports no speed accumulated 1.4km over five minutes, because
 * drift regularly exceeded the threshold and dragged the anchor along with it.
 */
export const DRIFT_FACTOR = 1.0
/**
 * Weight of each new fix in the smoothed position.
 *
 * Drift oscillates around the true position; movement persists. Averaging the
 * last few fixes cancels the first and barely delays the second — it is the
 * difference between a stationary phone reporting nothing and a stationary
 * phone inventing a kilometre.
 */
export const POSITION_ALPHA = 0.4
/** ~90 km/h. Above this it is a GPS jump, not an athlete. */
export const MAX_PLAUSIBLE_MPS = 25
/** Below this the GPS is telling us the user is standing still. */
export const STATIONARY_MPS = 0.5
/** No fix for this long means something stopped us — a lock, a tunnel, a kill. */
export const GAP_MS = 20_000

/**
 * Low-pass the position itself.
 *
 * Applied before any distance is measured, so both the route and the total are
 * built from the same smoothed track. A run drawn from raw fixes is visibly
 * jagged even when the total is right; this fixes both at once.
 *
 * Pass `previous = null` to start a new smoothing run — the first fix of a
 * session, and the first after a gap, must not be averaged against a position
 * from somewhere else entirely.
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

/**
 * Whether this fix follows a silence rather than the previous fix.
 *
 * Exposed separately because the caller has to know BEFORE it smooths: a fix
 * arriving after four minutes of nothing must not be averaged against a
 * position from wherever the user was when the phone locked, or the smoothed
 * point lands somewhere neither position ever was.
 */
export const isGap = (previous: TrackPoint | null, fix: TrackPoint): boolean =>
  previous !== null && fix.t - previous.t > GAP_MS

export type FixDecision =
  /** Unusable, or a correction rather than movement. Changes nothing. */
  | { kind: 'reject'; reason: 'accuracy' | 'teleport' }
  /** Believed, but no distance: the first fix, or the first after a gap. */
  | { kind: 'anchor' }
  /** Believed, and the silence before it is recorded as unmeasured. */
  | { kind: 'gap'; from: number; to: number }
  /** Believed, but not yet movement — the anchor stays put. */
  | { kind: 'hold'; stationary: boolean }
  /** Real movement. */
  | { kind: 'advance'; meters: number; speed: number }

/**
 * Decide what one GPS fix means, given where we were.
 *
 * This is the single most correctness-critical function in the tracker, and it
 * is pure so that it can be argued with directly. The rules, in the order they
 * are cheapest to fail:
 *
 *   1. A fix vaguer than MAX_ACCURACY_M is not a position.
 *   2. Silence longer than GAP_MS means the straight line across it is neither
 *      a route nor a distance — the app was not running, so it cannot claim to
 *      know what happened.
 *   3. Implied speed above MAX_PLAUSIBLE_MPS is assisted GPS correcting itself,
 *      not a sprint.
 *   4. A fix that reports standing still IS standing still. Doppler speed is
 *      far more trustworthy here than comparing two noisy positions.
 *   5. Movement must clear the noise floor of the fix that reported it.
 *
 * Rules 4 and 5 are what stop a phone waiting at a crossing from inventing
 * distance. `hold` deliberately does not move the anchor: a slow walk keeps
 * accumulating displacement against a fixed origin until it clears the
 * threshold honestly, rather than being filtered away one small step at a time.
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

/**
 * Split a track wherever recording stopped.
 *
 * The tracker already refuses to count the distance across a gap; drawing one
 * would put the claim back on screen in the most convincing form there is. A
 * straight line across four minutes of locked phone is not a route the user
 * ran, so each recorded stretch is its own segment and the gaps stay empty.
 */
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
  // A single point draws nothing and only confuses the renderer
  return segments.filter(segment => segment.length >= 2)
}

/**
 * Local planar projection in metres, relative to an origin.
 *
 * Equirectangular, which is wrong over continents and accurate to well under a
 * metre over the few kilometres a track covers — more than enough to measure
 * how far a point sits from a straight line.
 */
const project = (
  point: { lat: number; lng: number },
  origin: { lat: number; lng: number }
): { x: number; y: number } => ({
  x: toRad(point.lng - origin.lng) * Math.cos(toRad(origin.lat)) * EARTH_RADIUS_M,
  y: toRad(point.lat - origin.lat) * EARTH_RADIUS_M,
})

/** Perpendicular distance from p to the segment ab, all in projected metres. */
const distanceToSegment = (
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy

  // Degenerate segment — a and b are the same place
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y)

  // Projection parameter, clamped so it measures to the segment not the line
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Ramer–Douglas–Peucker simplification, tolerance in metres.
 *
 * A 45-minute run at one fix per second is ~2,700 points; at a 5m tolerance
 * that becomes a couple of hundred with no visible change to the line. Worth
 * doing before anything is stored or drawn — the cost is paid on every render
 * of the map and every byte of every upload, forever.
 *
 * Iterative rather than recursive: the recursive form is prettier but its depth
 * is bounded by the point count in the worst case, and blowing the stack to
 * save a few kilobytes is a poor trade.
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

/** A run of consecutive positions, as [lng, lat] — GeoJSON's order, not ours. */
export type RouteSegment = Array<[number, number]>

/**
 * Five decimal places: about 1.1m at these latitudes.
 *
 * Finer than the GPS itself and far finer than the 5m simplification the track
 * has already been through, so nothing visible is lost — and it roughly halves
 * the stored size against the seventeen digits a raw double serialises to.
 */
const round5 = (n: number) => Math.round(n * 1e5) / 1e5

/**
 * A track, ready to store and to draw.
 *
 * Segmented on gaps at encode time rather than at render time so the stored
 * shape already carries the one thing a bare list of coordinates cannot: that
 * the app was not recording between two of them. Nothing downstream can then
 * accidentally join a straight line across four minutes of locked phone.
 */
export const encodeRoute = (points: TrackPoint[]): RouteSegment[] =>
  splitOnGaps(points).map(segment =>
    segment.map(p => [round5(p.lng), round5(p.lat)] as [number, number])
  )

/** [[west, south], [east, north]], or null for a route with nothing in it. */
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

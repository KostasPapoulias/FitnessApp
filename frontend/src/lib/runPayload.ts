/**
 * A finished run as sent to and returned by the API: the drawn route and the
 * numbers, without the tracker's raw fixes.
 */

import { RouteSegment, Split } from './geo'

export interface RunPayload {
  /** Epoch ms the clock was started. */
  startedAt: number
  distanceM: number
  durationSec: number
  /** Seconds per kilometre over the whole run. */
  avgPaceSec: number
  elevationGainM: number
  /** 'gps' when a route was recorded, 'manual' for a treadmill or lost signal. */
  source: string
  /** Gap-segmented [lng, lat] pairs. Empty for a manual session. */
  route: RouteSegment[]
  /** [[west, south], [east, north]], for framing the map. */
  bounds: [[number, number], [number, number]] | null
  splits: Split[]
  laps: Split[]
}

/** Strip a tracker summary down to the payload. */
export const toRunPayload = (summary: {
  startedAt: number
  meters: number
  elapsedSec: number
  avgPaceSec: number
  elevationGainM: number
  source: string
  route: RouteSegment[]
  bounds: [[number, number], [number, number]] | null
  splits: Split[]
  laps: Split[]
}): RunPayload => ({
  startedAt: summary.startedAt,
  distanceM: Math.round(summary.meters),
  durationSec: summary.elapsedSec,
  avgPaceSec: summary.avgPaceSec,
  elevationGainM: summary.elevationGainM,
  source: summary.source,
  route: summary.route,
  bounds: summary.bounds,
  splits: summary.splits,
  laps: summary.laps,
})

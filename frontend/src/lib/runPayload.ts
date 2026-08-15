/**
 * The shape a finished run travels and is stored in.
 *
 * Deliberately its own type rather than the tracker's RunSummary. A summary
 * carries the live TrackPoint array — timestamps, accuracies, altitudes, one
 * entry per fix — which is what the tracker needs while running and is several
 * times the size of anything a history screen can use. What crosses the wire is
 * the drawn route and the numbers, nothing else.
 *
 * The same type comes back out of the API, so the run detail screen and the
 * live screen agree on what a run is by construction.
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
  /** [[west, south], [east, north]] — lets the map frame the run without
   *  walking the whole route first. */
  bounds: [[number, number], [number, number]] | null
  splits: Split[]
  laps: Split[]
}

/** Everything the tracker knows, minus what only the tracker needs. */
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

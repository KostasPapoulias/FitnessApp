import { useEffect, useRef, useState } from 'react'
import {
  AJAXError, Map as MapLibreMap, Marker, setWorkerUrl,
  type ErrorEvent, type GeoJSONSource,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { TrackPoint, splitOnGaps } from '../lib/geo'
import api from '../services/api'

/**
 * The live route.
 *
 * Imported lazily by the cardio screen — MapLibre is by far the heaviest thing
 * in the app, and someone lifting weights should never pay for it.
 *
 * The map is deliberately NOT interactive. During a run it is a readout, not a
 * tool: a pan that drags the view off the athlete is pure annoyance, and every
 * touch it swallows is a touch the screen lock was meant to stop.
 */

/**
 * Point MapLibre at its own worker.
 *
 * Left alone it derives the worker's URL at runtime by concatenating onto
 * `import.meta.url`, which is a reference no bundler can see — so the worker
 * file is never emitted, the fetch 404s, and no tile is ever parsed. The map
 * still paints the style's background colour, which is why the failure looks
 * like a blank map rather than a broken one. Importing it as a worker makes
 * Rollup bundle it with its own dependencies and hand back a real URL.
 *
 * Module scope, so it is set before any Map can be constructed.
 */
setWorkerUrl(maplibreWorkerUrl)

const ROUTE_SOURCE = 'route'
const ROUTE_LAYER = 'route-line'
const BRAND_TEAL = '#00D4AA'

interface Props {
  /** Read on demand — the track lives in a ref, not in state. */
  getPoints: () => TrackPoint[]
  /** Bumps whenever a point is added, which is what drives a redraw. */
  pointCount: number
  /** Keep the camera on the athlete. */
  follow?: boolean
  className?: string
}

const toGeoJson = (points: TrackPoint[]) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: {
    type: 'MultiLineString' as const,
    coordinates: splitOnGaps(points).map(segment =>
      segment.map(p => [p.lng, p.lat] as [number, number])
    ),
  },
})

export default function RouteMap({ getPoints, pointCount, follow = true, className }: Props) {
  const container = useRef<HTMLDivElement | null>(null)
  const map = useRef<MapLibreMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const ready = useRef(false)
  const [failed, setFailed] = useState<string | null>(null)
  /**
   * Why the map is empty, when it is empty but still standing.
   *
   * A refused style and a refused tile look identical on a phone — both leave a
   * dark rectangle — and the difference decides whether the key or its origin
   * allowlist is at fault. There is no console on a run, so it goes on screen.
   */
  const [diagnostic, setDiagnostic] = useState<string | null>(null)

  // ── build the map once ──
  useEffect(() => {
    let cancelled = false
    let watchdog: number | undefined

    const build = async () => {
      try {
        // The key lives on the server so it can be rotated without rebuilding
        // the frontend. It is public the moment a tile loads either way.
        const { data } = await api.get('/config/map')
        const styleUrl: string = data?.data?.styleUrl
        if (!styleUrl) throw new Error('no style')
        if (cancelled || !container.current) return

        const instance = new MapLibreMap({
          container: container.current,
          style: styleUrl,
          center: [23.7275, 37.9838],
          zoom: 15,
          interactive: false,
          // MapTiler's terms require attribution; it comes from the style, and
          // compacting it keeps it legible on a 190px-tall map.
          attributionControl: { compact: true },
        })

        // A style that never arrives fires no 'load' and, if the request was
        // cancelled rather than refused, no 'error' either — the map just sits
        // there being a dark rectangle. Say so rather than let it look normal.
        watchdog = window.setTimeout(() => {
          if (!cancelled && !ready.current) {
            setDiagnostic(previous => previous ?? 'Map style did not load')
          }
        }, 10_000)

        instance.on('load', () => {
          if (cancelled) return
          window.clearTimeout(watchdog)
          instance.addSource(ROUTE_SOURCE, { type: 'geojson', data: toGeoJson(getPoints()) })
          instance.addLayer({
            id: ROUTE_LAYER,
            type: 'line',
            source: ROUTE_SOURCE,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': BRAND_TEAL,
              // Thickens with zoom so the line stays readable at every scale
              'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 5, 20, 7],
            },
          })
          ready.current = true
          draw()
        })

        instance.on("error", (event: ErrorEvent) => {
          const error = event.error
          console.error('Map error:', error?.message ?? event)

          // Anything that is not a failed request is a style or render
          // complaint the user can do nothing about, and a badge they cannot
          // act on is just noise on top of a run.
          if (!(error instanceof AJAXError)) return

          const resource =
            error.url.includes('/style.json') ? 'style'
            : error.url.includes('/fonts/') ? 'labels'
            : 'tiles'

          setDiagnostic(
            error.status === 401 || error.status === 403
              ? `Map ${resource} refused (${error.status}) — key or its allowed origins`
              : `Map ${resource} failed (${error.status})`
          )
        })

        map.current = instance
      } catch {
        if (!cancelled) setFailed('Map unavailable — tracking continues.')
      }
    }

    void build()

    return () => {
      cancelled = true
      window.clearTimeout(watchdog)
      marker.current?.remove()
      map.current?.remove()
      map.current = null
      ready.current = false
    }
    // Built once for the life of the screen; new points are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── redraw on new points ──
  const draw = () => {
    const instance = map.current
    if (!instance || !ready.current) return

    const points = getPoints()
    if (points.length === 0) return

    const source = instance.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
    source?.setData(toGeoJson(points))

    const last = points[points.length - 1]
    const position: [number, number] = [last.lng, last.lat]

    if (!marker.current) {
      const dot = document.createElement('div')
      dot.style.cssText =
        `width:14px;height:14px;border-radius:50%;background:${BRAND_TEAL};` +
        `border:2px solid #000;box-shadow:0 0 0 5px rgba(0,212,170,0.25)`
      marker.current = new Marker({ element: dot }).setLngLat(position).addTo(instance)
      instance.jumpTo({ center: position, zoom: 16 })
      return
    }

    marker.current.setLngLat(position)
    // easeTo rather than jumpTo: a map that snaps on every fix reads as
    // twitchy, and the fixes arrive about once a second.
    if (follow) instance.easeTo({ center: position, duration: 800 })
  }

  useEffect(draw, [pointCount, follow])

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-dark-800 border border-dark-600
                       rounded-card text-dark-400 text-[12.5px] ${className ?? ''}`}>
        {failed}
      </div>
    )
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <div
        ref={container}
        className="absolute inset-0 rounded-card overflow-hidden border border-dark-600 bg-dark-800"
      />
      {diagnostic && (
        // Top-left: the accuracy readout owns the right, the GPS pill the
        // bottom-left, and MapTiler's attribution the bottom-right.
        <div className="absolute left-2 top-2 max-w-[72%] px-2.5 py-1.5 rounded-btn
                        bg-dark-900/85 border border-brand-red/40 text-[11px]
                        text-brand-red font-semibold leading-snug pointer-events-none">
          {diagnostic}
        </div>
      )}
    </div>
  )
}

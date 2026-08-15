import { useEffect, useRef, useState } from 'react'
import {
  AJAXError, LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl,
  type ErrorEvent, type GeoJSONSource,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { RouteSegment, TrackPoint, splitOnGaps } from '../lib/geo'
import api from '../services/api'

/**
 * A route on a basemap, live or finished.
 *
 * LIVE (`getPoints` + `pointCount`): the track is read on demand from a ref
 * that changes many times a minute, and the camera follows the athlete.
 *
 * FINISHED (`route`): a stored set of gap-segmented coordinates, framed once so
 * the whole run is on screen. Same component because the map, the style, the
 * failure handling and the line styling are identical, and a second copy of
 * this would drift from the first within a release.
 *
 * Imported lazily by both callers — MapLibre is by far the heaviest thing in
 * the app, and someone lifting weights should never pay for it.
 *
 * The map is deliberately NOT interactive during a run: a pan that drags the
 * view off the athlete is pure annoyance, and every touch it swallows is a
 * touch the screen lock was meant to stop. A finished run is a different
 * matter — there, panning and zooming is the whole point.
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

/** How long a map may stay blank before it has to explain itself. */
const WATCHDOG_MS = 10_000

interface Props {
  /** Live: read on demand — the track lives in a ref, not in state. */
  getPoints?: () => TrackPoint[]
  /** Live: bumps whenever a point is added, which is what drives a redraw. */
  pointCount?: number
  /** Live: keep the camera on the athlete. */
  follow?: boolean
  /** Finished: a stored route, already segmented on gaps. */
  route?: RouteSegment[]
  /** Finished: allow the athlete to look around their own run. */
  interactive?: boolean
  className?: string
}

const emptyFeature = () => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'MultiLineString' as const, coordinates: [] as RouteSegment[] },
})

const toFeature = (segments: RouteSegment[]) => ({
  ...emptyFeature(),
  geometry: { type: 'MultiLineString' as const, coordinates: segments },
})

/** Live points become the same shape a stored route already has. */
const fromPoints = (points: TrackPoint[]): RouteSegment[] =>
  splitOnGaps(points).map(segment =>
    segment.map(p => [p.lng, p.lat] as [number, number])
  )

const boundsOf = (segments: RouteSegment[]): LngLatBounds | null => {
  const bounds = new LngLatBounds()
  let any = false
  for (const segment of segments) {
    for (const position of segment) {
      bounds.extend(position)
      any = true
    }
  }
  return any ? bounds : null
}

const dot = (color: string, size: number) => {
  const element = document.createElement('div')
  element.style.cssText =
    `width:${size}px;height:${size}px;border-radius:50%;background:${color};` +
    `border:2px solid #000;box-shadow:0 0 0 5px rgba(0,212,170,0.25)`
  return element
}

export default function RouteMap({
  getPoints, pointCount = 0, follow = true, route, interactive, className,
}: Props) {
  const container = useRef<HTMLDivElement | null>(null)
  const map = useRef<MapLibreMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const ready = useRef(false)
  const framed = useRef(false)
  const [failed, setFailed] = useState<string | null>(null)
  /**
   * Why the map is empty, when it is empty but still standing.
   *
   * A refused style, a refused tile and a worker that never started all look
   * identical on a phone — every one of them leaves a dark rectangle — and the
   * difference decides whether the key, its origin allowlist, or the build is
   * at fault. There is no console on a run, so it goes on screen.
   */
  const [diagnostic, setDiagnostic] = useState<string | null>(null)

  const isLive = typeof getPoints === 'function'
  const currentSegments = (): RouteSegment[] =>
    isLive ? fromPoints(getPoints!()) : (route ?? [])

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
        const styleName: string = data?.data?.style ?? 'unknown'
        if (!styleUrl) throw new Error('no style')
        if (cancelled) return
        if (!container.current) {
          // Nothing to attach to and nothing that will retry, so this would
          // otherwise be a permanently blank box with no explanation at all.
          setDiagnostic('Map container went away before the map was built')
          return
        }

        const instance = new MapLibreMap({
          container: container.current,
          style: styleUrl,
          center: [23.7275, 37.9838],
          zoom: 15,
          interactive: interactive ?? false,
          // MapTiler's terms require attribution; it comes from the style, and
          // compacting it keeps it legible on a small map.
          attributionControl: { compact: true },
        })

        // A style that never arrives fires no 'load' and, if the request was
        // cancelled rather than refused, no 'error' either — the map just sits
        // there being a dark rectangle. Say so rather than let it look normal.
        watchdog = window.setTimeout(() => {
          if (!cancelled && !ready.current) {
            setDiagnostic(previous => previous ?? `Style "${styleName}" did not load (timed out)`)
          }
        }, WATCHDOG_MS)

        instance.on('load', () => {
          if (cancelled) return
          window.clearTimeout(watchdog)

          // Re-measure before drawing anything.
          //
          // This map is mounted from a lazy chunk into a container that is
          // often still being laid out — a Suspense fallback swapping out, a
          // sheet animating in, a screen that changed height when the GPS pill
          // appeared. MapLibre sizes its canvas once at construction, and a
          // canvas sized against a container that was 0px high renders
          // perfectly correctly to nowhere: no error, no warning, no tile
          // failure, just nothing on screen. resize() is cheap and rules the
          // whole class of that out.
          instance.resize()
          instance.addSource(ROUTE_SOURCE, { type: 'geojson', data: emptyFeature() })
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

          // A map that loaded its style, parsed its tiles and still shows
          // nothing has exactly one common cause left, and it is invisible from
          // the console: a canvas with no area. Measure it once the first frame
          // has settled and say so on screen, because "blank" on its own is not
          // something anyone can act on.
          instance.once('idle', () => {
            if (cancelled) return
            const canvas = instance.getCanvas()
            const box = container.current?.getBoundingClientRect()
            const width = Math.round(box?.width ?? 0)
            const height = Math.round(box?.height ?? 0)

            // Not `< 2`: a collapsed box still measures the 2px of its own
            // borders, which is exactly what this missed the first time. A map
            // thinner than a finger is a map nobody can see.
            if (width < 24 || height < 24) {
              setDiagnostic(`Map has no room to draw — container is ${width}×${height}px`)
              // The height came from somewhere up the tree, so name the chain
              // rather than leave the next person bisecting Tailwind classes.
              const chain: string[] = []
              let node: HTMLElement | null = container.current
              while (node && chain.length < 6) {
                const rect = node.getBoundingClientRect()
                chain.push(`${node.className.split(/\s+/)[0] || node.tagName}:${Math.round(rect.height)}px`)
                node = node.parentElement
              }
              console.warn('[RouteMap] height chain:', chain.join(' ← '))
              return
            }
            if (canvas.width < 24 || canvas.height < 24) {
              setDiagnostic(`Map canvas is ${canvas.width}×${canvas.height} inside ${width}×${height}px`)
              return
            }
            // Everything measured fine, so anything still wrong is worth
            // knowing the numbers for.
            console.info(
              `[RouteMap] style "${styleName}" drew into ${width}×${height}px ` +
              `(canvas ${canvas.width}×${canvas.height}, dpr ${window.devicePixelRatio})`
            )
          })
        })

        instance.on('error', (event: ErrorEvent) => {
          const error = event.error
          console.error('Map error:', error?.message ?? event)

          // Every failure gets a badge now. The previous version reported only
          // AJAXErrors and returned on everything else, which is precisely how
          // a dead worker or a refused WebGL context produced a black rectangle
          // with nothing to go on — the two failures that leave no network
          // trace were the two that stayed silent.
          if (error instanceof AJAXError) {
            const resource =
              error.url.includes('/style.json') ? 'style'
              : error.url.includes('/fonts/') ? 'labels'
              : error.url.includes('/sprite') ? 'icons'
              : 'tiles'

            setDiagnostic(
              error.status === 401 || error.status === 403
                ? `Map ${resource} refused (${error.status}) — key or its allowed origins`
                : `Map ${resource} failed (${error.status})`
            )
            return
          }

          const message = error?.message ?? String(event)
          setDiagnostic(
            /webgl|context|gpu/i.test(message) ? `Map cannot draw here — ${message}`
            : /worker/i.test(message) ? `Map worker failed — ${message}`
            : `Map error — ${message}`
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
      marker.current = null
      map.current?.remove()
      map.current = null
      ready.current = false
      framed.current = false
    }
    // Built once for the life of the screen; new points are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── redraw ──
  const draw = () => {
    const instance = map.current
    if (!instance || !ready.current) return

    const segments = currentSegments()
    const source = instance.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
    source?.setData(toFeature(segments))

    if (segments.length === 0) return

    // A finished run is framed once, whole. Fitting it on every redraw would
    // fight the athlete the moment they zoomed in on a corner of it.
    if (!isLive) {
      if (framed.current) return
      const bounds = boundsOf(segments)
      if (!bounds) return
      instance.fitBounds(bounds, { padding: 28, duration: 0, maxZoom: 16 })
      framed.current = true

      const first = segments[0][0]
      const lastSegment = segments[segments.length - 1]
      const last = lastSegment[lastSegment.length - 1]
      new Marker({ element: dot(BRAND_TEAL, 12) }).setLngLat(first).addTo(instance)
      new Marker({ element: dot('#FFFFFF', 12) }).setLngLat(last).addTo(instance)
      return
    }

    const lastSegment = segments[segments.length - 1]
    const position = lastSegment[lastSegment.length - 1]

    if (!marker.current) {
      marker.current = new Marker({ element: dot(BRAND_TEAL, 14) })
        .setLngLat(position)
        .addTo(instance)
      instance.jumpTo({ center: position, zoom: 16 })
      return
    }

    marker.current.setLngLat(position)
    // easeTo rather than jumpTo: a map that snaps on every fix reads as
    // twitchy, and the fixes arrive about once a second.
    if (follow) instance.easeTo({ center: position, duration: 800 })
  }

  useEffect(draw, [pointCount, follow, route])

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
      {/*
        Sized in normal flow — NOT `absolute inset-0`, which is what kept this
        map two pixels tall.

        MapLibre puts its own `maplibregl-map` class on this very div, and that
        rule declares `position: relative`. It has the same specificity as
        Tailwind's `.absolute`, and it arrives in this component's lazily-loaded
        CSS chunk — after the main stylesheet — so it wins. The div stopped being
        positioned, `inset-0` no longer sized it, its height fell back to `auto`,
        and its only child is MapLibre's own absolutely-positioned canvas
        container, which contributes no height at all. The result was a 0px box
        wearing 2px of border, with a correctly rendered 388×300 canvas clipped
        inside it and not one error anywhere to say so.

        `w-full h-full` cannot lose that argument: `.maplibregl-map` sets no
        width or height, so there is nothing to override it.
      */}
      <div
        ref={container}
        className="w-full h-full rounded-card overflow-hidden border border-dark-600 bg-dark-800"
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

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
 * A route on a basemap. Live (`getPoints` + `pointCount`): follows the athlete,
 * non-interactive. Finished (`route`): framed once, pan and zoom allowed.
 * Loaded lazily by callers — MapLibre is the heaviest dependency.
 */

/**
 * Point MapLibre at its bundled worker. Its runtime-derived URL is invisible
 * to the bundler, so the worker would 404 and the map would stay blank.
 */
setWorkerUrl(maplibreWorkerUrl)

const ROUTE_SOURCE = 'route'
const ROUTE_LAYER = 'route-line'
const BRAND_TEAL = '#00D4AA'

/** How long a map may stay blank before it shows a diagnostic. */
const WATCHDOG_MS = 10_000

interface Props {
  /** Live: read on demand (the track lives in a ref). */
  getPoints?: () => TrackPoint[]
  /** Live: bumps when a point is added, triggering a redraw. */
  pointCount?: number
  /** Live: keep the camera on the athlete. */
  follow?: boolean
  /** Live: the device position [lng, lat], used until the track has a point. */
  center?: [number, number] | null
  /** Finished: a stored route, already segmented on gaps. */
  route?: RouteSegment[]
  /** Finished: allow panning and zooming. */
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

/** Live points in the stored route's shape. */
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

/** Camera position before any location is known (Athens). */
const FALLBACK_CENTER: [number, number] = [23.7275, 37.9838]

export default function RouteMap({
  getPoints, pointCount = 0, follow = true, center, route, interactive, className,
}: Props) {
  const container = useRef<HTMLDivElement | null>(null)
  const map = useRef<MapLibreMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const ready = useRef(false)
  const framed = useRef(false)
  const [failed, setFailed] = useState<string | null>(null)
  /** Why the map is blank, shown on screen (there is no console on a phone). */
  const [diagnostic, setDiagnostic] = useState<string | null>(null)

  const isLive = typeof getPoints === 'function'
  const currentSegments = (): RouteSegment[] =>
    isLive ? fromPoints(getPoints!()) : (route ?? [])

  // The map is built once; a ref keeps it reading the live center
  const centerRef = useRef<[number, number] | null>(center ?? null)
  centerRef.current = center ?? centerRef.current

  // ── build the map once ──
  useEffect(() => {
    let cancelled = false
    let watchdog: number | undefined

    const build = async () => {
      try {
        // Key served by the backend, so it can rotate without a frontend build
        const { data } = await api.get('/config/map')
        const styleUrl: string = data?.data?.styleUrl
        const styleName: string = data?.data?.style ?? 'unknown'
        if (!styleUrl) throw new Error('no style')
        if (cancelled) return
        if (!container.current) {
          // Container gone: say so rather than stay blank
          setDiagnostic('Map container went away before the map was built')
          return
        }

        const instance = new MapLibreMap({
          container: container.current,
          style: styleUrl,
          center: centerRef.current ?? FALLBACK_CENTER,
          zoom: centerRef.current ? 16 : 15,
          interactive: interactive ?? false,
          // Attribution is required; compact keeps it legible
          attributionControl: { compact: true },
        })

        // A style that never loads fires nothing; the watchdog reports it
        watchdog = window.setTimeout(() => {
          if (!cancelled && !ready.current) {
            setDiagnostic(previous => previous ?? `Style "${styleName}" did not load (timed out)`)
          }
        }, WATCHDOG_MS)

        instance.on('load', () => {
          if (cancelled) return
          window.clearTimeout(watchdog)

          // Re-measure first: the container may have been 0px high when the
          // map was constructed (lazy load, animating sheet)
          instance.resize()
          instance.addSource(ROUTE_SOURCE, { type: 'geojson', data: emptyFeature() })
          instance.addLayer({
            id: ROUTE_LAYER,
            type: 'line',
            source: ROUTE_SOURCE,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': BRAND_TEAL,
              // Thicker at higher zoom
              'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 5, 20, 7],
            },
          })
          ready.current = true
          draw()

          // After the first frame, report a canvas with no area on screen
          instance.once('idle', () => {
            if (cancelled) return
            const canvas = instance.getCanvas()
            const box = container.current?.getBoundingClientRect()
            const width = Math.round(box?.width ?? 0)
            const height = Math.round(box?.height ?? 0)

            // Under 24px (a collapsed box still measures its borders)
            if (width < 24 || height < 24) {
              setDiagnostic(`Map has no room to draw — container is ${width}×${height}px`)
              // Name the chain of heights so the collapse can be traced
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
            // Log the numbers when everything measured fine
            console.info(
              `[RouteMap] style "${styleName}" drew into ${width}×${height}px ` +
              `(canvas ${canvas.width}×${canvas.height}, dpr ${window.devicePixelRatio})`
            )
          })
        })

        instance.on('error', (event: ErrorEvent) => {
          const error = event.error
          console.error('Map error:', error?.message ?? event)

          // Every failure is shown — AJAX errors, a dead worker, no WebGL
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
    // Built once; new points are handled by the redraw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── redraw ──
  const draw = () => {
    const instance = map.current
    if (!instance || !ready.current) return

    const segments = currentSegments()
    const source = instance.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
    source?.setData(toFeature(segments))

    // A live map with no track yet centres on the device
    if (isLive && segments.length === 0) {
      const here = centerRef.current
      if (!here) return

      if (!marker.current) {
        marker.current = new Marker({ element: dot(BRAND_TEAL, 14) })
          .setLngLat(here)
          .addTo(instance)
        instance.jumpTo({ center: here, zoom: 16 })
        return
      }
      marker.current.setLngLat(here)
      if (follow) instance.easeTo({ center: here, duration: 800 })
      return
    }

    if (segments.length === 0) return

    // A finished run is framed once, so it doesn't fight the user's zoom
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
    // easeTo, so ~1 Hz fixes don't make the map twitch
    if (follow) instance.easeTo({ center: position, duration: 800 })
  }

  // `center` in deps, so the camera follows the device between accepted fixes
  useEffect(draw, [pointCount, follow, route, center])

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
      {/* Sized with w-full h-full in normal flow — MapLibre's own class sets
          position: relative and would defeat `absolute inset-0`, collapsing the map */}
      <div
        ref={container}
        className="w-full h-full rounded-card overflow-hidden border border-dark-600 bg-dark-800"
      />
      {diagnostic && (
        // Top-left: other corners are taken (accuracy, GPS pill, attribution)
        <div className="absolute left-2 top-2 max-w-[72%] px-2.5 py-1.5 rounded-btn
                        bg-dark-900/85 border border-brand-red/40 text-[11px]
                        text-brand-red font-semibold leading-snug pointer-events-none">
          {diagnostic}
        </div>
      )}
    </div>
  )
}

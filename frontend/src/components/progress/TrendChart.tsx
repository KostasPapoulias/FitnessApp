import { ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'

/**
 * The app's one line chart.
 *
 * Lifted out of `BodyweightCard`, which built the first one: measured width,
 * scrub-to-nearest-point, a single labelled endpoint, and a table twin. The
 * progress screen needed the same thing twice more (estimated 1RM, muscle
 * fatigue) and three copies of a scrub handler would have drifted — they
 * already differ in what they plot and nothing else.
 *
 * Two conventions it keeps, both deliberate:
 *
 *   - **The nearest point wins the scrub, not the one under the finger.** A 2px
 *     line is not a hit target on a phone, so the whole plot height is live at
 *     any x.
 *   - **A tooltip is never the only way to read a value.** Every chart carries a
 *     table twin behind a toggle. It is also the only readable form of the data
 *     for anyone not using a pointer.
 */

const SURFACE = '#1A1A1A'  // dark-800, the card behind the plot
const GRID = '#2A2A2A'     // dark-600, one shade off the surface
const AXIS = '#888888'

const AXIS_H = 22          // included in the measured height, or labels clip
const PAD_X = 10
const PAD_TOP = 16         // room for the endpoint label above the last point

export interface TrendPoint {
  /** ISO timestamp. Used for the axis and the table, never for spacing. */
  at: string
  value: number
  /** Draws a ring instead of nothing — a PR, or any point worth calling out. */
  marked?: boolean
  /** Extra line in the tooltip and the table, e.g. "100kg × 5". */
  detail?: string
}

interface Props {
  points: TrendPoint[]
  /** Value → display string, unit included. Used everywhere a number is shown. */
  format: (value: number) => string
  /** Line and fill colour. Defaults to brand-teal. */
  color?: string
  /**
   * `auto` fits the data with padding — correct for bodyweight or a 1RM, where
   * the interesting movement is a few percent and a zero baseline flattens it.
   * `zero` anchors at 0, which is required for anything already expressed as a
   * proportion of a maximum (fatigue is 0–100 and must not be rescaled).
   */
  baseline?: 'auto' | 'zero'
  /** With `baseline: 'zero'`, the top of the domain. Defaults to the data's max. */
  ceiling?: number
  /** Floor on the visible span, so a flat series does not become dramatic noise. */
  minSpan?: number
  plotHeight?: number
  /** Column heading for the table twin. */
  valueHeader?: string
  /** Shown instead of the plot when there is nothing to draw. */
  empty?: ReactNode
  /**
   * Shown under the value when there is exactly one point. Worth setting where
   * the reader can do something about it — "log another and a trend appears".
   */
  singleHint?: string
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

const fmtFull = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function TrendChart({
  points,
  format,
  color = '#00D4AA',
  baseline = 'auto',
  ceiling,
  minSpan = 1,
  plotHeight = 120,
  valueHeader = 'Value',
  empty,
  singleHint,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  // Measured, not assumed. The card sits inside AppLayout's centred
  // max-w-[430px], and a viewBox scaled to fit would stretch the type with it.
  useLayoutEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    setWidth(element.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  // A stable id per instance: two charts on one screen sharing a gradient id
  // means the second one silently takes the first one's colour.
  const gradientId = useMemo(
    () => `trend-fill-${Math.random().toString(36).slice(2, 9)}`,
    []
  )

  const geometry = useMemo(() => {
    if (points.length < 2 || width === 0) return null

    const values = points.map(p => p.value)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)

    let min: number
    let max: number
    if (baseline === 'zero') {
      min = 0
      max = Math.max(ceiling ?? rawMax, minSpan)
    } else {
      const span = Math.max(rawMax - rawMin, minSpan)
      const padding = span * 0.15
      min = rawMin - padding
      max = rawMax + padding
    }

    const innerW = Math.max(width - PAD_X * 2, 1)
    const innerH = plotHeight - PAD_TOP

    // Evenly spaced by index rather than by date. Training is irregular, and
    // spacing by time leaves most of the plot empty around a two-week gap.
    const x = (i: number) => PAD_X + (i / (points.length - 1)) * innerW
    const y = (value: number) =>
      PAD_TOP + innerH - ((value - min) / (max - min || 1)) * innerH

    const coords = points.map((p, i) => ({ x: x(i), y: y(p.value) }))
    const line = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ')
    const area =
      `${line} L${coords[coords.length - 1].x.toFixed(1)},${plotHeight} ` +
      `L${coords[0].x.toFixed(1)},${plotHeight} Z`

    return { coords, line, area, rawMin, rawMax }
  }, [points, width, baseline, ceiling, minSpan, plotHeight])

  const scrub = (clientX: number) => {
    const element = wrapRef.current
    if (!element || !geometry) return
    const localX = clientX - element.getBoundingClientRect().left
    let nearest = 0
    let best = Infinity
    geometry.coords.forEach((c, i) => {
      const distance = Math.abs(c.x - localX)
      if (distance < best) { best = distance; nearest = i }
    })
    setActiveIndex(nearest)
  }

  if (points.length === 0) {
    return <div className="px-4 pb-4 text-dark-400 text-xs">{empty ?? 'Nothing logged yet.'}</div>
  }

  // One point is a number, not a trend. Drawing a flat line across the card
  // would imply a stability nobody measured.
  if (points.length === 1) {
    return (
      <div className="px-4 pb-4">
        <p className="text-white text-xl font-bold tabular-nums">{format(points[0].value)}</p>
        <p className="text-dark-400 text-xs mt-1">
          {fmtFull(points[0].at)} — {singleHint ?? 'one entry so far, so there is no trend to draw yet.'}
        </p>
      </div>
    )
  }

  const active = activeIndex != null ? points[activeIndex] : null
  const activeCoord = activeIndex != null && geometry ? geometry.coords[activeIndex] : null
  const lastCoord = geometry?.coords[geometry.coords.length - 1]

  return (
    <>
      <div
        ref={wrapRef}
        className="relative touch-none select-none"
        style={{ height: plotHeight + AXIS_H }}
        onPointerDown={e => scrub(e.clientX)}
        onPointerMove={e => { if (e.buttons > 0 || e.pointerType === 'mouse') scrub(e.clientX) }}
        onPointerLeave={() => setActiveIndex(null)}
        onPointerUp={() => setActiveIndex(null)}
      >
        {geometry && (
          <svg width={width} height={plotHeight + AXIS_H} className="block">
            {/* Recessive grid: solid hairlines one shade off the surface. */}
            {[0, 0.5, 1].map(t => {
              const y = PAD_TOP + (plotHeight - PAD_TOP) * t
              return <line key={t} x1={PAD_X} x2={width - PAD_X} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
            })}

            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={geometry.area} fill={`url(#${gradientId})`} />
            <path
              d={geometry.line}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Called-out points. Hollow rings, so they read as annotations on
                the line rather than as a second series drawn over it. */}
            {points.map((point, i) => point.marked && (
              <circle
                key={`mark-${i}`}
                cx={geometry.coords[i].x}
                cy={geometry.coords[i].y}
                r={4}
                fill={SURFACE}
                stroke={color}
                strokeWidth={2}
              />
            ))}

            {activeCoord ? (
              <>
                <line
                  x1={activeCoord.x} x2={activeCoord.x}
                  y1={PAD_TOP} y2={plotHeight}
                  stroke={GRID} strokeWidth={1}
                />
                <circle cx={activeCoord.x} cy={activeCoord.y} r={5}
                  fill={color} stroke={SURFACE} strokeWidth={2} />
              </>
            ) : lastCoord && (
              // The endpoint is the only filled point when idle — a value beside
              // every dot is chaos and goes unread.
              <circle cx={lastCoord.x} cy={lastCoord.y} r={5}
                fill={color} stroke={SURFACE} strokeWidth={2} />
            )}

            <text x={PAD_X} y={plotHeight + 15} fill={AXIS} fontSize={10}>
              {fmtDate(points[0].at)}
            </text>
            <text x={width - PAD_X} y={plotHeight + 15} fill={AXIS} fontSize={10} textAnchor="end">
              {fmtDate(points[points.length - 1].at)}
            </text>
          </svg>
        )}

        {/* Range as text rather than a tick ladder — two numbers carry a
            mobile-width plot and a full axis would crowd it. */}
        {geometry && (
          <div className="absolute top-0 left-0 px-3 text-[10px] text-dark-400 tabular-nums">
            {format(baseline === 'zero' ? (ceiling ?? geometry.rawMax) : geometry.rawMax)}
          </div>
        )}

        {active && activeCoord && (
          <div
            className="absolute -top-1 px-2 py-1 rounded-btn bg-dark-700 border border-dark-500
                       text-[11px] text-white whitespace-nowrap pointer-events-none"
            style={{ left: Math.min(Math.max(activeCoord.x - 45, 0), Math.max(width - 110, 0)) }}
          >
            <span className="font-bold tabular-nums">{format(active.value)}</span>
            <span className="text-dark-300 ml-1.5">{fmtDate(active.at)}</span>
            {active.detail && <span className="text-dark-300 ml-1.5">{active.detail}</span>}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowTable(v => !v)}
        className="w-full px-4 py-2 text-left text-dark-400 text-xs active:bg-dark-700"
      >
        {showTable ? 'Hide values' : `Show all ${points.length} values`}
      </button>

      {showTable && (
        <div className="px-4 pb-3 max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-dark-400">
                <th className="text-left font-normal py-1">Date</th>
                <th className="text-right font-normal py-1">{valueHeader}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((point, i) => (
                <tr key={i} className="border-t border-dark-700">
                  <td className="py-1.5 text-dark-200">
                    {fmtFull(point.at)}
                    {point.detail && <span className="text-dark-400 ml-1.5">{point.detail}</span>}
                  </td>
                  <td className="py-1.5 text-right text-white tabular-nums">
                    {format(point.value)}
                    {point.marked && <span className="text-brand-yellow ml-1">★</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

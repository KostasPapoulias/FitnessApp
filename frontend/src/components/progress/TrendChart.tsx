import { ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { StarFilledIcon } from '../icons'

/**
 * The app's line chart: measured width, scrub to the nearest point (the whole
 * height is live), a labelled endpoint, and a table view for reading values
 * without a pointer.
 */

const SURFACE = '#1A1A1A'  // dark-800, the card behind the plot
const GRID = '#2A2A2A'     // dark-600, one shade off the surface
const AXIS = '#888888'

const AXIS_H = 22          // included in the measured height, or labels clip
const PAD_X = 10
const PAD_TOP = 16         // room for the endpoint label above the last point

export interface TrendPoint {
  /** ISO timestamp, for the axis and table (points are spaced by index). */
  at: string
  value: number
  /** Draws a ring (e.g. a PR). */
  marked?: boolean
  /** Extra line in the tooltip and table, e.g. "100kg × 5". */
  detail?: string
}

interface Props {
  points: TrendPoint[]
  /** Value → display string, unit included. */
  format: (value: number) => string
  /** Line and fill colour. Defaults to brand-teal. */
  color?: string
  /**
   * `auto` fits the data (bodyweight, 1RM); `zero` anchors at 0 (values that
   * are already a proportion, like fatigue).
   */
  baseline?: 'auto' | 'zero'
  /** With `baseline: 'zero'`, the domain's top. Defaults to the data's max. */
  ceiling?: number
  /** Minimum visible span, so a flat series stays flat. */
  minSpan?: number
  plotHeight?: number
  /** Column heading in the table view. */
  valueHeader?: string
  /** Shown instead of the plot when there is nothing to draw. */
  empty?: ReactNode
  /** Hint shown when there is exactly one point. */
  singleHint?: string
}

// Date in the reader's locale.
const fmtDate = (iso: string, intl: string) =>
  new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short' })

const fmtFull = (iso: string, intl: string) =>
  new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' })

export default function TrendChart({
  points,
  format,
  color = '#00D4AA',
  baseline = 'auto',
  ceiling,
  minSpan = 1,
  plotHeight = 120,
  valueHeader,
  empty,
  singleHint,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const { t, intl } = useT()

  // Measured width, so text is not stretched by a scaled viewBox
  useLayoutEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    setWidth(element.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  // Unique gradient id per instance
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

    // Spaced by index, not date, so training gaps don't empty the plot
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
    return <div className="px-4 pb-4 text-dark-400 text-xs">{empty ?? t('chart.empty')}</div>
  }

  // A single point is shown as a value, not a line
  if (points.length === 1) {
    return (
      <div className="px-4 pb-4">
        <p className="text-white text-xl font-bold tabular-nums">{format(points[0].value)}</p>
        <p className="text-dark-400 text-xs mt-1">
          {fmtFull(points[0].at, intl)} — {singleHint ?? t('chart.single')}
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
            {/* Grid lines */}
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

            {/* Marked points as hollow rings */}
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
              // Only the endpoint is filled when idle
              <circle cx={lastCoord.x} cy={lastCoord.y} r={5}
                fill={color} stroke={SURFACE} strokeWidth={2} />
            )}

            <text x={PAD_X} y={plotHeight + 15} fill={AXIS} fontSize={10}>
              {fmtDate(points[0].at, intl)}
            </text>
            <text x={width - PAD_X} y={plotHeight + 15} fill={AXIS} fontSize={10} textAnchor="end">
              {fmtDate(points[points.length - 1].at, intl)}
            </text>
          </svg>
        )}

        {/* Value range as text */}
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
            <span className="text-dark-300 ml-1.5">{fmtDate(active.at, intl)}</span>
            {active.detail && <span className="text-dark-300 ml-1.5">{active.detail}</span>}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowTable(v => !v)}
        className="w-full px-4 py-2 text-left text-dark-400 text-xs active:bg-dark-700"
      >
        {showTable ? t('chart.hideValues') : t('chart.showValues', { count: points.length })}
      </button>

      {showTable && (
        <div className="px-4 pb-3 max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-dark-400">
                <th className="text-left font-normal py-1">{t('chart.date')}</th>
                <th className="text-right font-normal py-1">{valueHeader ?? t('chart.value')}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((point, i) => (
                <tr key={i} className="border-t border-dark-700">
                  <td className="py-1.5 text-dark-200">
                    {fmtFull(point.at, intl)}
                    {point.detail && <span className="text-dark-400 ml-1.5">{point.detail}</span>}
                  </td>
                  <td className="py-1.5 text-right text-white tabular-nums">
                    {format(point.value)}
                    {point.marked && <StarFilledIcon className="w-3 h-3 inline-block align-[-1px] ml-1 text-brand-yellow" />}
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

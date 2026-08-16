import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BiometricPoint } from '../../services/profile.service'

/**
 * Bodyweight over time, with BMI.
 *
 * The Biometric series was written from onboarding and every profile edit and
 * never read back — `onboarding.controller` even names the chart it was feeding.
 * This is that chart.
 *
 * The story is mostly ONE number, so the current weight and BMI lead as a stat
 * tile and the line supports them, rather than a plot with the headline buried
 * in it. Single series, so there is no legend: the heading names it.
 *
 * BMI is derived here and never stored. It is a pure function of two columns
 * already on the profile, and a stored copy would silently disagree with them
 * the first time either changed.
 */

const SERIES = '#00D4AA'      // brand-teal
const SURFACE = '#1A1A1A'     // dark-800, the card behind it
const GRID = '#2A2A2A'        // dark-600, one shade off the surface
const PLOT_H = 120
const AXIS_H = 22             // the container includes this, or the labels clip
const PAD_X = 10
const PAD_TOP = 16            // room for the endpoint label above the last point

/** WHO bands. Colour is never the only cue — the label always says which. */
const bmiBand = (bmi: number) =>
  bmi < 18.5 ? { label: 'Underweight', tone: 'text-brand-yellow' } :
  bmi < 25   ? { label: 'Normal',      tone: 'text-brand-green' } :
  bmi < 30   ? { label: 'Overweight',  tone: 'text-brand-yellow' } :
               { label: 'Obese',       tone: 'text-brand-orange' }

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

const fmtFull = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

interface Props {
  points: BiometricPoint[]
  /** Centimetres, from the profile. BMI is hidden without it. */
  heightCm?: number | null
  imperial: boolean
}

export default function BodyweightCard({ points, heightCm, imperial }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  // Measured rather than assumed. The card sits inside AppLayout's centred
  // max-w-[430px], but a viewBox scaled to fit would stretch the type with it.
  useLayoutEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    setWidth(element.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  const toDisplay = (kg: number) => imperial ? kg * 2.20462 : kg
  const unit = imperial ? 'lb' : 'kg'
  const fmtWeight = (kg: number) => toDisplay(kg).toFixed(1)

  const latest = points.length > 0 ? points[points.length - 1] : null

  const bmi = useMemo(() => {
    if (!latest || !heightCm || heightCm <= 0) return null
    const metres = heightCm / 100
    return latest.value / (metres * metres)
  }, [latest, heightCm])

  const geometry = useMemo(() => {
    if (points.length < 2 || width === 0) return null

    const values = points.map(p => p.value)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)

    // A non-zero baseline is correct here: bodyweight moves by a few percent,
    // and anchoring at zero would flatten a real trend into a straight line.
    // The floor on the span stops a stable weight becoming dramatic noise.
    const span = Math.max(rawMax - rawMin, 2)
    const padding = span * 0.15
    const min = rawMin - padding
    const max = rawMax + padding

    const innerW = Math.max(width - PAD_X * 2, 1)
    const innerH = PLOT_H - PAD_TOP

    const x = (i: number) => PAD_X + (i / (points.length - 1)) * innerW
    const y = (value: number) => PAD_TOP + innerH - ((value - min) / (max - min)) * innerH

    const coords = points.map((p, i) => ({ x: x(i), y: y(p.value) }))
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
    const area =
      `${line} L${coords[coords.length - 1].x.toFixed(1)},${PLOT_H} L${coords[0].x.toFixed(1)},${PLOT_H} Z`

    return { coords, line, area, min, max, rawMin, rawMax }
  }, [points, width])

  // Nearest point to the pointer, not the one directly under it — a 2px line is
  // not a hit target, and the whole plot height is in play at any x.
  const scrub = (clientX: number) => {
    const element = wrapRef.current
    if (!element || !geometry) return
    const { left } = element.getBoundingClientRect()
    const localX = clientX - left
    let nearest = 0
    let best = Infinity
    geometry.coords.forEach((c, i) => {
      const distance = Math.abs(c.x - localX)
      if (distance < best) { best = distance; nearest = i }
    })
    setActiveIndex(nearest)
  }

  const active = activeIndex != null ? points[activeIndex] : null
  const activeCoord = activeIndex != null && geometry ? geometry.coords[activeIndex] : null

  return (
    <div className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">

      {/* Stat tile. Proportional figures on the hero — tabular-nums makes a
          large number look loose, and nothing is aligned under it. */}
      <div className="p-4 pb-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-dark-300 text-xs uppercase tracking-wider">Bodyweight</p>
          {latest ? (
            <p className="text-white text-3xl font-bold mt-1 leading-none">
              {fmtWeight(latest.value)}
              <span className="text-dark-300 text-base font-semibold ml-1">{unit}</span>
            </p>
          ) : (
            <p className="text-dark-300 text-sm mt-2">Not recorded yet</p>
          )}
        </div>

        {bmi != null && (
          <div className="text-right">
            <p className="text-dark-300 text-xs uppercase tracking-wider">BMI</p>
            <p className="text-white text-2xl font-bold mt-1 leading-none">{bmi.toFixed(1)}</p>
            <p className={`text-xs mt-0.5 font-medium ${bmiBand(bmi).tone}`}>
              {bmiBand(bmi).label}
            </p>
          </div>
        )}
      </div>

      {latest && bmi == null && (
        <p className="px-4 pb-1 text-dark-400 text-xs">
          Add your height in Edit Profile to see BMI.
        </p>
      )}

      {/* Plot */}
      {geometry ? (
        <>
          <div
            ref={wrapRef}
            className="relative touch-none select-none"
            style={{ height: PLOT_H + AXIS_H }}
            onPointerDown={e => scrub(e.clientX)}
            onPointerMove={e => { if (e.buttons > 0 || e.pointerType === 'mouse') scrub(e.clientX) }}
            onPointerLeave={() => setActiveIndex(null)}
            onPointerUp={() => setActiveIndex(null)}
          >
            <svg width={width} height={PLOT_H + AXIS_H} className="block">
              {/* Recessive grid: solid hairlines, one shade off the surface. */}
              {[0, 0.5, 1].map(t => {
                const y = PAD_TOP + (PLOT_H - PAD_TOP) * t
                return <line key={t} x1={PAD_X} x2={width - PAD_X} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              })}

              <defs>
                <linearGradient id="bw-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={geometry.area} fill="url(#bw-fill)" />
              <path
                d={geometry.line}
                fill="none"
                stroke={SERIES}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Crosshair while scrubbing */}
              {activeCoord && (
                <>
                  <line
                    x1={activeCoord.x} x2={activeCoord.x}
                    y1={PAD_TOP} y2={PLOT_H}
                    stroke={GRID} strokeWidth={1}
                  />
                  <circle cx={activeCoord.x} cy={activeCoord.y} r={5}
                    fill={SERIES} stroke={SURFACE} strokeWidth={2} />
                </>
              )}

              {/* The endpoint is the only marked point, and the only labelled
                  one — a value beside every dot is chaos and goes unread. */}
              {!activeCoord && (
                <circle
                  cx={geometry.coords[geometry.coords.length - 1].x}
                  cy={geometry.coords[geometry.coords.length - 1].y}
                  r={5}
                  fill={SERIES}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
              )}

              {/* Axis band, inside the measured height so nothing clips. */}
              <text x={PAD_X} y={PLOT_H + 15} fill="#888888" fontSize={10}>
                {fmtDate(points[0].measuredAt)}
              </text>
              <text x={width - PAD_X} y={PLOT_H + 15} fill="#888888" fontSize={10} textAnchor="end">
                {fmtDate(points[points.length - 1].measuredAt)}
              </text>
            </svg>

            {/* Range, as text rather than a full axis — two numbers carry a
                mobile-width plot, and a tick ladder would crowd it. */}
            <div className="absolute top-0 left-0 px-3 text-[10px] text-dark-400 tabular-nums">
              {fmtWeight(geometry.rawMax)}{unit}
            </div>

            {active && (
              <div
                className="absolute -top-1 px-2 py-1 rounded-btn bg-dark-700 border border-dark-500
                           text-[11px] text-white whitespace-nowrap pointer-events-none"
                style={{
                  left: Math.min(Math.max((activeCoord?.x ?? 0) - 40, 0), Math.max(width - 90, 0)),
                }}
              >
                <span className="font-bold tabular-nums">{fmtWeight(active.value)}{unit}</span>
                <span className="text-dark-300 ml-1.5">{fmtDate(active.measuredAt)}</span>
              </div>
            )}
          </div>

          {/* The table twin. A tooltip must never be the only way to read a
              value — this is the same data, keyboard-reachable and printable. */}
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
                    <th className="text-right font-normal py-1">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((point, i) => (
                    <tr key={i} className="border-t border-dark-700">
                      <td className="py-1.5 text-dark-200">{fmtFull(point.measuredAt)}</td>
                      <td className="py-1.5 text-right text-white tabular-nums">
                        {fmtWeight(point.value)} {unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p className="px-4 pb-4 text-dark-400 text-xs">
          {points.length === 1
            // Deliberately not drawn. One point is a number, not a trend, and a
            // flat line across the card would imply a stability nobody measured.
            ? 'One measurement so far — update your weight in Edit Profile and a trend will appear here.'
            : 'Set your weight in Edit Profile to start tracking it.'}
        </p>
      )}
    </div>
  )
}

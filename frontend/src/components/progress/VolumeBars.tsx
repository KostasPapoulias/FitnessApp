import { useMemo, useState } from 'react'
import { VolumeWeek } from '../../types'

/**
 * Weekly training volume, as bars.
 *
 * Bars rather than a line because each week is a discrete total, not a sample of
 * something continuous — and because the zeros matter. A week off is the thing
 * that explains the weeks either side of it, and a line would slope straight
 * through it.
 *
 * Three metrics behind one control, not three charts. They answer the same
 * question in different units and they disagree usefully: a week of running
 * moves `load` a long way and `volumeKg` barely at all, so an athlete looking at
 * tonnage alone would conclude they had done nothing. Sets are the fallback for
 * anyone whose training is mostly bodyweight, where tonnage is close to
 * meaningless.
 */

type Metric = 'volumeKg' | 'load' | 'sets'

const METRICS: { key: Metric; label: string; help: string }[] = [
  { key: 'volumeKg', label: 'Tonnage', help: 'Weight moved: reps × kg, summed. Strength work only.' },
  { key: 'load', label: 'Load', help: 'Whole-body cost of the week — the same units as training load.' },
  { key: 'sets', label: 'Sets', help: 'Sets logged, whatever the modality.' },
]

const BAR = '#00D4AA'      // brand-teal
const BAR_DIM = '#2A2A2A'  // dark-600, for a week with nothing in it

/**
 * `weekStart` is a bare YYYY-MM-DD, which `new Date()` reads as UTC midnight —
 * so west of UTC it renders as the day before. Built from the parts instead.
 */
const fmtWeek = (dateOnly: string) => {
  const [y, m, d] = dateOnly.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const compact = (value: number) =>
  value >= 10000 ? `${Math.round(value / 1000)}k`
  : value >= 1000 ? `${(value / 1000).toFixed(1)}k`
  : `${Math.round(value)}`

const format = (metric: Metric, value: number) =>
  metric === 'volumeKg' ? `${compact(value)} kg`
  : metric === 'load' ? `${compact(value)} load`
  : `${value} set${value === 1 ? '' : 's'}`

interface Props {
  weeks: VolumeWeek[]
  thisWeek: VolumeWeek | null
  previousWeek: VolumeWeek | null
}

export default function VolumeBars({ weeks, thisWeek, previousWeek }: Props) {
  /**
   * Opens on whichever metric the athlete's training actually registers in.
   * Defaulting to tonnage for a runner shows an empty chart, which reads as a
   * bug rather than as a fact about their training.
   *
   * An initialiser, deliberately — not a value derived on every render. Deriving
   * it would override the segmented control: tapping "Tonnage" would recompute
   * back to "Sets" and the button would appear dead.
   */
  const [metric, setMetric] = useState<Metric>(() => {
    const totalVolume = weeks.reduce((sum, w) => sum + w.volumeKg, 0)
    const totalSets = weeks.reduce((sum, w) => sum + w.sets, 0)
    return totalVolume === 0 && totalSets > 0 ? 'sets' : 'volumeKg'
  })
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const active = activeIndex != null ? weeks[activeIndex] : null
  const meta = METRICS.find(m => m.key === metric)!

  const max = useMemo(
    () => Math.max(1, ...weeks.map(w => w[metric])),
    [weeks, metric]
  )

  const change = thisWeek && previousWeek && previousWeek[metric] > 0
    ? Math.round(((thisWeek[metric] - previousWeek[metric]) / previousWeek[metric]) * 100)
    : null

  return (
    <div className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-dark-300 text-xs uppercase tracking-wider">This week</p>
            <p className="text-white text-3xl font-bold mt-1 leading-none tabular-nums">
              {thisWeek ? format(metric, thisWeek[metric]) : '—'}
            </p>
            {change != null && (
              <p className={`text-xs mt-1 font-medium ${
                change > 0 ? 'text-brand-green' : change < 0 ? 'text-brand-orange' : 'text-dark-300'
              }`}>
                {change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change)}% vs last week
              </p>
            )}
          </div>

          {/* Segmented control. Three narrow buttons rather than a dropdown —
              switching between these is the main thing done on this card. */}
          <div className="flex bg-dark-900 rounded-full p-0.5 border border-dark-600 flex-shrink-0">
            {METRICS.map(m => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors
                  ${metric === m.key ? 'bg-brand-teal text-black' : 'text-dark-300'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-dark-400 text-[11px] mt-2 leading-relaxed">
          {meta.help}
        </p>
      </div>

      {/* Bars. Flex with a per-bar height rather than an SVG: there are at most
          52 of them, they need no curve fitting, and each one is its own tap
          target this way. */}
      <div className="px-4 pb-1">
        <div className="flex items-end gap-[3px] h-[120px]">
          {weeks.map((week, i) => {
            const value = week[metric]
            const heightPct = value > 0 ? Math.max((value / max) * 100, 4) : 2
            const isActive = activeIndex === i
            return (
              <button
                key={week.weekStart}
                onClick={() => setActiveIndex(isActive ? null : i)}
                className="flex-1 min-w-0 flex items-end h-full"
                aria-label={`Week of ${fmtWeek(week.weekStart)}: ${format(metric, value)}`}
              >
                <div
                  className="w-full rounded-t-[2px] transition-all"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: value > 0 ? BAR : BAR_DIM,
                    opacity: activeIndex == null || isActive ? 1 : 0.4,
                  }}
                />
              </button>
            )
          })}
        </div>

        <div className="flex justify-between text-[10px] text-dark-400 mt-1.5">
          <span>{weeks.length > 0 ? fmtWeek(weeks[0].weekStart) : ''}</span>
          <span>{weeks.length > 0 ? 'this week' : ''}</span>
        </div>
      </div>

      {/* Tapped week. Reads out every metric, not just the selected one — once
          a week is picked, "how much of that was running" is the next question,
          and switching the control to find out loses the selection. */}
      {active ? (
        <div className="px-4 py-3 border-t border-dark-700">
          <p className="text-white text-sm font-semibold">
            Week of {fmtWeek(active.weekStart)}
          </p>
          <p className="text-dark-300 text-xs mt-1 tabular-nums">
            {active.sessions === 0
              ? 'No sessions — a week off.'
              : `${active.sessions} session${active.sessions === 1 ? '' : 's'} · ${active.sets} sets · ` +
                `${compact(active.volumeKg)} kg · ${compact(active.load)} load`}
          </p>
        </div>
      ) : (
        <p className="px-4 py-3 border-t border-dark-700 text-dark-400 text-xs">
          Tap a bar for that week's totals. {meta.label} shown above.
        </p>
      )}
    </div>
  )
}

import { useState } from 'react'
import PaceWheel from '../../components/PaceWheel'
import { PacePlan, PaceUnit, clampTarget, targetForStep } from '../../lib/paceCoach'
import { fmtTime } from './helpers'

// Opens before a run and during one — the pace you want is not always known at
// the door.
//
// Two numbers and a unit, and that is deliberately all. This replaced a sheet
// that let you add a kilometre, set its pace, add another, set that one: it
// could express more shapes than anyone runs, and it made the two that people
// do run ("hold this" and "take five seconds off each kilometre") into a
// data-entry exercise.

/**
 * The paces on offer, built around what this movement is actually done at.
 *
 * A fixed 2:30-12:00 list was a runner's list. An air bike's reference pace is
 * 2:08/km and a swim's is 20:00/km, so one of them could not be expressed at
 * all and the other sat in the final row. Anchoring the range to the movement
 * keeps the wheel short enough to scroll and always contains the answer.
 *
 * 0.55x to 2.2x of reference: fast enough for an interval, slow enough for a
 * recovery effort, and around sixty rows either side.
 */
const targetsFor = (referencePaceSec: number): number[] => {
  // Proportional too, and for the same reason as the range. Five seconds is a
  // fine step on a 6:00/km run and an absurd one either way from there: on a
  // fan bike at 2:09 it is a 4% jump per notch, and on a 12:00/km walk the
  // wheel came out 240 rows long. Snapped to a readable grid rather than left
  // as an arbitrary fraction, so the labels land on round numbers.
  const GRID = [1, 2, 5, 10, 15, 30]
  const wanted = referencePaceSec / 60
  const step = GRID.reduce((best, g) =>
    Math.abs(g - wanted) < Math.abs(best - wanted) ? g : best, GRID[0])

  const lo = clampTarget(Math.round((referencePaceSec * 0.55) / step) * step)
  const hi = clampTarget(Math.round((referencePaceSec * 2.2) / step) * step)
  const out: number[] = []
  for (let pace = lo; pace <= hi; pace += step) out.push(pace)
  return out.length ? out : [clampTarget(referencePaceSec)]
}

/** The option closest to a pace that may not sit on this movement's grid. */
const nearest = (options: number[], wanted: number): number =>
  options.reduce((best, o) => Math.abs(o - wanted) < Math.abs(best - wanted) ? o : best, options[0])
/** Seconds per unit the progression can move by. Both signs, and zero. */
const DELTAS = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30]

const UNIT = {
  km: { one: 'kilometre', short: 'km' },
  min: { one: 'minute', short: 'min' },
} as const

interface Props {
  plan: PacePlan
  onApply: (plan: PacePlan) => void
  onClose: () => void
  /** Where the wheel opens when the remembered plan is still the default. */
  suggestedSec: number | null
  currentPaceSec: number | null
  /**
   * Seconds per km this movement is typically done at, which sets the range of
   * the wheel. A road run and a fan bike do not belong on the same list.
   */
  referencePaceSec: number
  /**
   * Which unit to open on when the plan has not been touched this session.
   *
   * Minutes for a machine, kilometres for the road. An erg gets reset between
   * pieces, so "kilometre three" is a number nobody on one can see.
   */
  defaultUnit?: PaceUnit
}

export default function PaceSheet({
  plan, onApply, onClose, suggestedSec, currentPaceSec, referencePaceSec, defaultUnit,
}: Props) {
  const TARGETS = targetsFor(referencePaceSec)
  const [unit, setUnit] = useState<PaceUnit>(defaultUnit ?? plan.unit)
  const [startSec, setStartSec] = useState(() =>
    // Snapped to THIS movement's grid, and pulled into its range. The remembered
    // plan is whatever the last session used, so opening the fan-bike sheet on
    // a running pace would park the wheel at an end stop with the real answer
    // forty rows away; and an off-grid value renders as no row selected at all.
    nearest(TARGETS, plan.startSec || suggestedSec || currentPaceSec || referencePaceSec)
  )
  const [deltaSec, setDeltaSec] = useState(() => {
    const nearest = DELTAS.reduce((best, d) =>
      Math.abs(d - plan.deltaSec) < Math.abs(best - plan.deltaSec) ? d : best, 0)
    return nearest
  })

  const words = UNIT[unit]
  const draft: PacePlan = { unit, startSec, deltaSec }

  // Four steps of the plan, so the athlete can see what they have asked for
  // before they run it. This is where a 30s-per-km progression visibly stops
  // being a plan — the clamp flattens it and the preview says so.
  const preview = [1, 2, 3, 4].map(step => targetForStep(draft, step))
  const flattens = deltaSec !== 0 && preview[3] === preview[2]

  return (
    // z-[60]: BottomNav is fixed at z-50 and would cover the Done button.
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div
        className="relative bg-dark-900 border-t border-dark-600 rounded-t-[22px] px-5 pt-4
                   max-h-[88vh] overflow-y-auto"
        style={{ paddingBottom: 'max(20px, var(--safe-bottom))' }}
      >
        <div className="w-10 h-1 rounded-full bg-dark-600 mx-auto mb-4" />

        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[19px] font-extrabold">Pace plan</h2>
          {currentPaceSec !== null && currentPaceSec > 0 && (
            <span className="text-[12px] text-dark-300 tabular-nums">
              now {fmtTime(currentPaceSec)} / km
            </span>
          )}
        </div>

        {/* ── the unit ── */}
        <p className="text-[10.5px] tracking-wide text-dark-400 mb-1.5">CHANGE THE PACE EVERY</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {(['km', 'min'] as PaceUnit[]).map(option => (
            <button
              key={option}
              onClick={() => setUnit(option)}
              className="rounded-btn border py-2.5 text-[12.5px] font-bold transition-colors"
              style={unit === option
                ? { borderColor: '#00D4AA', background: '#0a2a22', color: '#00D4AA' }
                : { borderColor: '#2A2A2A', background: '#1a1a1a', color: '#AAAAAA' }}
            >
              {option === 'km' ? 'Kilometre' : 'Minute'}
            </button>
          ))}
        </div>

        {/* ── the starting pace ── */}
        <p className="text-[10.5px] tracking-wide text-dark-400 mb-1.5">
          STARTING PACE / KM
        </p>
        <PaceWheel
          options={TARGETS}
          value={TARGETS.includes(startSec) ? startSec : nearest(TARGETS, startSec)}
          onChange={setStartSec}
          label={fmtTime}
          ariaLabel="Starting pace per kilometre"
        />

        {/* ── the progression ── */}
        <p className="text-[10.5px] tracking-wide text-dark-400 mt-5 mb-1.5">
          THEN, EACH {words.short.toUpperCase()}
        </p>
        <PaceWheel
          options={DELTAS}
          value={deltaSec}
          onChange={setDeltaSec}
          label={d => d === 0 ? 'Hold it' : d < 0 ? `${Math.abs(d)}s faster` : `${d}s easier`}
          sub={d => d === 0 ? 'Same pace the whole way' : null}
          ariaLabel={`Pace change per ${words.one}`}
        />

        {/* ── what that actually means ── */}
        <div className="mt-5 rounded-card border border-dark-600 bg-dark-800 px-4 py-3">
          <div className="text-[10px] tracking-wide text-dark-400 mb-2">
            {deltaSec === 0 ? 'THE WHOLE SESSION' : `FIRST FOUR ${words.short.toUpperCase()}`}
          </div>
          {deltaSec === 0 ? (
            <div className="text-[17px] font-extrabold tabular-nums">
              {fmtTime(startSec)} <span className="text-[12px] font-bold text-dark-400">/ km</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              {preview.map((pace, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-dark-500 text-[12px]">→</span>}
                  <span className="text-[15px] font-extrabold tabular-nums">{fmtTime(pace)}</span>
                </span>
              ))}
              <span className="text-dark-500 text-[12px]">→ …</span>
            </div>
          )}

          <p className="text-[11px] text-dark-500 mt-2 leading-snug">
            {flattens
              // Said rather than silently clamped: the preview would otherwise
              // show the same number twice and look like a rendering fault.
              ? `That leaves the range of real paces within four ${words.short}, so it holds at the limit from there.`
              : deltaSec === 0
                ? `The coach calls this out at the start and tells you when you drift off it.`
                : `Announced at the top of every ${words.one}, and it keeps going past the fourth.`}
          </p>
        </div>

        <button
          onClick={() => { onApply(draft); onClose() }}
          className="w-full mt-5 py-4 rounded-btn bg-brand-teal text-black text-[16px] font-extrabold
                     active:scale-95 transition-transform"
        >
          Done
        </button>
      </div>
    </div>
  )
}

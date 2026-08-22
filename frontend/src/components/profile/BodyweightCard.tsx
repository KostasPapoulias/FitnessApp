import { useMemo } from 'react'
import { BiometricPoint } from '../../services/profile.service'
import TrendChart from '../progress/TrendChart'

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
 *
 * The plot itself is `TrendChart` — this card's own scrub-and-table
 * implementation became the shared one when the progress screen needed two more
 * charts of the same kind. What stays here is what is specific to bodyweight:
 * the stat tile, BMI, and the unit conversion.
 */

const SERIES = '#00D4AA'      // brand-teal

/** WHO bands. Colour is never the only cue — the label always says which. */
const bmiBand = (bmi: number) =>
  bmi < 18.5 ? { label: 'Underweight', tone: 'text-brand-yellow' } :
  bmi < 25   ? { label: 'Normal',      tone: 'text-brand-green' } :
  bmi < 30   ? { label: 'Overweight',  tone: 'text-brand-yellow' } :
               { label: 'Obese',       tone: 'text-brand-orange' }

interface Props {
  points: BiometricPoint[]
  /** Centimetres, from the profile. BMI is hidden without it. */
  heightCm?: number | null
  imperial: boolean
}

export default function BodyweightCard({ points, heightCm, imperial }: Props) {
  const toDisplay = (kg: number) => imperial ? kg * 2.20462 : kg
  const unit = imperial ? 'lb' : 'kg'
  const fmtWeight = (kg: number) => `${toDisplay(kg).toFixed(1)}${unit}`

  const latest = points.length > 0 ? points[points.length - 1] : null

  const bmi = useMemo(() => {
    if (!latest || !heightCm || heightCm <= 0) return null
    const metres = heightCm / 100
    return latest.value / (metres * metres)
  }, [latest, heightCm])

  // Converted for display only. Everything upstream is metric, and turning the
  // series imperial anywhere but here is how a stored kilogram becomes a pound.
  const trendPoints = useMemo(
    () => points.map(p => ({ at: p.measuredAt, value: p.value })),
    [points]
  )

  return (
    <div className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">

      {/* Stat tile. Proportional figures on the hero — tabular-nums makes a
          large number look loose, and nothing is aligned under it. */}
      <div className="p-4 pb-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-dark-300 text-xs uppercase tracking-wider">Bodyweight</p>
          {latest ? (
            <p className="text-white text-3xl font-bold mt-1 leading-none">
              {toDisplay(latest.value).toFixed(1)}
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

      {/* A non-zero baseline is correct here: bodyweight moves by a few percent,
          and anchoring at zero would flatten a real trend into a straight line.
          The minimum span stops a stable weight becoming dramatic noise. */}
      <TrendChart
        points={trendPoints}
        format={fmtWeight}
        color={SERIES}
        baseline="auto"
        minSpan={2}
        valueHeader="Weight"
        empty="Set your weight in Edit Profile to start tracking it."
        singleHint="update your weight in Edit Profile and a trend will appear here."
      />
    </div>
  )
}

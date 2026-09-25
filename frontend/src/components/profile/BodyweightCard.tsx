import { useMemo } from 'react'
import { BiometricPoint } from '../../services/profile.service'
import TrendChart from '../progress/TrendChart'
import { MessageKey, useT } from '../../i18n'

/**
 * Bodyweight over time with BMI. Current weight and BMI lead as a stat tile;
 * the chart is TrendChart. BMI is derived, never stored.
 */

const SERIES = '#00D4AA'      // brand-teal

/** WHO bands; the label always states the band, not just the colour. */
const bmiBand = (bmi: number): { label: MessageKey; tone: string } =>
  bmi < 18.5 ? { label: 'bodyweight.underweight', tone: 'text-brand-yellow' } :
  bmi < 25   ? { label: 'bodyweight.normal',      tone: 'text-brand-green' } :
  bmi < 30   ? { label: 'bodyweight.overweight',  tone: 'text-brand-yellow' } :
               { label: 'bodyweight.obese',       tone: 'text-brand-orange' }

interface Props {
  points: BiometricPoint[]
  /** Centimetres, from the profile. BMI is hidden without it. */
  heightCm?: number | null
  imperial: boolean
}

export default function BodyweightCard({ points, heightCm, imperial }: Props) {
  const { t, num } = useT()
  const toDisplay = (kg: number) => imperial ? kg * 2.20462 : kg
  const unit = imperial ? 'lb' : 'kg'
  const fmtWeight = (kg: number) => `${num(toDisplay(kg))}${unit}`

  const latest = points.length > 0 ? points[points.length - 1] : null

  const bmi = useMemo(() => {
    if (!latest || !heightCm || heightCm <= 0) return null
    const metres = heightCm / 100
    return latest.value / (metres * metres)
  }, [latest, heightCm])

  // Converted for display only; everything upstream is metric
  const trendPoints = useMemo(
    () => points.map(p => ({ at: p.measuredAt, value: p.value })),
    [points]
  )

  return (
    <div className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">

      {/* Stat tile */}
      <div className="p-4 pb-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-dark-300 text-xs uppercase tracking-wider">{t('bodyweight.title')}</p>
          {latest ? (
            <p className="text-white text-3xl font-bold mt-1 leading-none">
              {num(toDisplay(latest.value))}
              <span className="text-dark-300 text-base font-semibold ml-1">{unit}</span>
            </p>
          ) : (
            <p className="text-dark-300 text-sm mt-2">{t('bodyweight.notRecorded')}</p>
          )}
        </div>

        {bmi != null && (
          <div className="text-right">
            <p className="text-dark-300 text-xs uppercase tracking-wider">{t('bodyweight.bmi')}</p>
            <p className="text-white text-2xl font-bold mt-1 leading-none">{num(bmi)}</p>
            <p className={`text-xs mt-0.5 font-medium ${bmiBand(bmi).tone}`}>
              {t(bmiBand(bmi).label)}
            </p>
          </div>
        )}
      </div>

      {latest && bmi == null && (
        <p className="px-4 pb-1 text-dark-400 text-xs">
          {t('bodyweight.addHeight')}
        </p>
      )}

      {/* Non-zero baseline, with a minimum span so a stable weight looks stable */}
      <TrendChart
        points={trendPoints}
        format={fmtWeight}
        color={SERIES}
        baseline="auto"
        minSpan={2}
        valueHeader={t('bodyweight.valueHeader')}
        empty={t('bodyweight.empty')}
        singleHint={t('bodyweight.single')}
      />
    </div>
  )
}

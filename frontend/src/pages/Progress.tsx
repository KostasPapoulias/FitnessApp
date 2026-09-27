import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { progressService } from '../services/progress.service'
import { E1rmPoint, MuscleFatigueHistory, ProgressSummary, StrengthEntry } from '../types'
import TrendChart from '../components/progress/TrendChart'
import VolumeBars from '../components/progress/VolumeBars'
import { StarFilledIcon } from '../components/icons'
import { useT, MessageKey } from '../i18n'

/**
 * Progress: strength estimates, session volume and per-muscle fatigue history,
 * in three tabs. Each tab's data is fetched on first visit.
 */

type Tab = 'Strength' | 'Volume' | 'Recovery'

type T = ReturnType<typeof useT>

const fmtAgo = (iso: string | null, t: T['t']) => {
  if (!iso) return t('progress.agoNever')
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return t('progress.agoToday')
  if (days === 1) return t('progress.agoYesterday')
  if (days < 14) return t('progress.agoDays', { n: days })
  if (days < 60) return t('progress.agoWeeks', { n: Math.floor(days / 7) })
  return t('progress.agoMonths', { n: Math.floor(days / 30) })
}

/** Tab values stay in English (internal state); only the label is translated. */
const TABS: { value: Tab; label: MessageKey }[] = [
  { value: 'Strength', label: 'progress.tabStrength' },
  { value: 'Volume', label: 'progress.tabVolume' },
  { value: 'Recovery', label: 'progress.tabRecovery' },
]

const fatigueTone = (level: number) =>
  level >= 70 ? 'text-brand-red' : level >= 35 ? 'text-brand-yellow' : 'text-brand-green'

const fatigueColor = (level: number) =>
  level >= 70 ? '#EF4444' : level >= 35 ? '#FACC15' : '#4ADE80'

export default function Progress() {
  const navigate = useNavigate()
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('Strength')

  const [summary, setSummary] = useState<ProgressSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    progressService.getSummary()
      .then(setSummary)
      .catch(() => setError(t('progress.loadError')))
      .finally(() => setIsLoading(false))
    // t only words the error here; refetching on a language switch is not wanted
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-dark-800 border border-dark-600
                     flex items-center justify-center text-lg text-white">←</button>
        <h1 className="text-xl font-extrabold text-white">{t('progress.title')}</h1>
      </div>

      {/* Tabs, matching Calendar's control */}
      <div className="flex gap-2 mb-4">
        {TABS.map(item => (
          <button
            key={item.value}
            onClick={() => setTab(item.value)}
            className={`flex-1 py-2 rounded-btn text-xs font-semibold transition-colors
              ${tab === item.value ? 'bg-brand-teal text-black' : 'bg-dark-800 text-dark-300 border border-dark-600'}`}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-3">
          <div className="h-24 bg-dark-800 rounded-card animate-pulse" />
          <div className="h-40 bg-dark-800 rounded-card animate-pulse" />
        </div>
      )}

      {error && !isLoading && (
        <div className="bg-dark-800 rounded-card border border-brand-red/30 p-4">
          <p className="text-white text-sm">{error}</p>
        </div>
      )}

      {summary && !isLoading && (
        <>
          {tab === 'Strength' && <StrengthTab entries={summary.strength} />}
          {tab === 'Volume' && (
            <>
              <VolumeBars
                weeks={summary.volume.weeks}
                thisWeek={summary.volume.thisWeek}
                previousWeek={summary.volume.previousWeek}
              />
              <p className="text-dark-400 text-[11px] mt-3 px-1 leading-relaxed">
                {summary.volume.activeWeeks === 0
                  ? t('progress.volumeEmpty')
                  : t('progress.volumeActive', {
                      active: summary.volume.activeWeeks,
                      total: summary.volume.weeks.length,
                    })}
              </p>
            </>
          )}
          {tab === 'Recovery' && <RecoveryTab muscles={summary.muscles} />}
        </>
      )}
    </div>
  )
}

/** Exercises with a strength estimate, best first; each series is fetched when expanded. */
function StrengthTab({ entries }: { entries: StrengthEntry[] }) {
  const { t, tn } = useT()
  const [openId, setOpenId] = useState<string | null>(null)
  const [series, setSeries] = useState<Record<string, E1rmPoint[]>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const open = (entry: StrengthEntry) => {
    if (openId === entry.exerciseId) { setOpenId(null); return }
    setOpenId(entry.exerciseId)
    if (series[entry.exerciseId]) return

    setLoadingId(entry.exerciseId)
    progressService.getExerciseSeries(entry.exerciseId)
      .then(points => setSeries(prev => ({ ...prev, [entry.exerciseId]: points })))
      .catch(() => setSeries(prev => ({ ...prev, [entry.exerciseId]: [] })))
      .finally(() => setLoadingId(null))
  }

  if (entries.length === 0) {
    return (
      <div className="bg-dark-800 rounded-card border border-dark-600 p-5">
        <p className="text-white text-sm font-semibold">{t('progress.strengthEmptyTitle')}</p>
        <p className="text-dark-300 text-xs mt-2 leading-relaxed">
          {t('progress.strengthEmptyBody')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-dark-400 text-[11px] px-1 leading-relaxed">
        {t('progress.strengthIntro')}
      </p>

      {entries.map(entry => {
        const isOpen = openId === entry.exerciseId
        const points = series[entry.exerciseId]

        return (
          <div key={entry.exerciseId}
            className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">
            <button
              onClick={() => open(entry)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left
                         active:bg-dark-700"
            >
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">{entry.exerciseName}</p>
                <p className="text-dark-400 text-xs mt-0.5">
                  {tn('progress.sessionsAndLast', entry.sessionCount, {
                    ago: fmtAgo(entry.lastPerformedAt, t),
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right">
                  <p className="text-brand-teal text-lg font-bold leading-none tabular-nums">
                    {entry.e1rm}
                    <span className="text-dark-300 text-xs font-semibold ml-0.5">kg</span>
                  </p>
                  <p className="text-dark-400 text-[10px] mt-0.5">{t('progress.est1rmShort')}</p>
                </div>
                <span className={`text-dark-400 text-lg leading-none transition-transform
                                 ${isOpen ? 'rotate-90' : ''}`}>›</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-dark-700">
                {loadingId === entry.exerciseId ? (
                  <div className="h-32 m-3 bg-dark-700 rounded animate-pulse" />
                ) : points && points.length > 0 ? (
                  <>
                    {/* Actual values, not best-so-far, so a decline is visible; PRs are ringed */}
                    <TrendChart
                      points={points.map(p => ({
                        at: p.at,
                        value: p.e1rm,
                        marked: p.isPr,
                        detail: p.bestSet
                          ? `${p.bestSet.weight}kg × ${p.bestSet.reps}`
                          : undefined,
                      }))}
                      format={v => `${v}kg`}
                      baseline="auto"
                      minSpan={5}
                      valueHeader={t('progress.est1rmHeader')}
                      singleHint={t('progress.trendSingleHint')}
                    />
                    <p className="px-4 pb-3 text-dark-400 text-[11px] leading-relaxed">
                      <StarFilledIcon className="w-3 h-3 inline-block align-[-1px] text-brand-yellow" />{' '}
                      {t('progress.prNote')}
                    </p>
                  </>
                ) : (
                  <p className="px-4 py-3 text-dark-400 text-xs">
                    {t('progress.noPlot')}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Per-muscle fatigue over 30 days, heaviest first. A replay of the decay curve,
 * so the last point matches the body map.
 */
function RecoveryTab({ muscles }: { muscles: MuscleFatigueHistory[] }) {
  const { t, tn } = useT()
  const [openId, setOpenId] = useState<string | null>(null)

  const busiest = useMemo(() => muscles.slice(0, 3), [muscles])

  if (muscles.length === 0) {
    return (
      <div className="bg-dark-800 rounded-card border border-dark-600 p-5">
        <p className="text-white text-sm font-semibold">{t('progress.recoveryEmptyTitle')}</p>
        <p className="text-dark-300 text-xs mt-2 leading-relaxed">
          {t('progress.recoveryEmptyBody')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="bg-dark-800 rounded-card border border-dark-600 p-4">
        <p className="text-dark-300 text-xs uppercase tracking-wider">{t('progress.carryingMost')}</p>
        <p className="text-white text-sm mt-1.5 leading-relaxed">
          {t('progress.last30', { muscles: busiest.map(m => m.muscleName).join(', ') })}
        </p>
        <p className="text-dark-400 text-[11px] mt-2 leading-relaxed">
          {t('progress.avgNote')}
        </p>
      </div>

      {muscles.map(muscle => {
        const isOpen = openId === muscle.muscleId
        const current = muscle.points[muscle.points.length - 1]?.level ?? 0

        return (
          <div key={muscle.muscleId}
            className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">
            <button
              onClick={() => setOpenId(isOpen ? null : muscle.muscleId)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left
                         active:bg-dark-700"
            >
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">{muscle.muscleName}</p>
                <p className="text-dark-400 text-xs mt-0.5">
                  {tn('progress.muscleStats', muscle.hits.length, {
                    avg: muscle.averageLevel,
                    peak: muscle.peakLevel,
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right">
                  {/* Colour is never the only cue */}
                  <p className={`text-lg font-bold leading-none tabular-nums ${fatigueTone(current)}`}>
                    {current}%
                  </p>
                  <p className="text-dark-400 text-[10px] mt-0.5">{t('progress.now')}</p>
                </div>
                <span className={`text-dark-400 text-lg leading-none transition-transform
                                 ${isOpen ? 'rotate-90' : ''}`}>›</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-dark-700">
                {/* Fixed 0–100 scale, so a quiet month doesn't look like a hard one */}
                <TrendChart
                  points={muscle.points.map(p => ({ at: p.at, value: p.level }))}
                  format={v => `${v}%`}
                  color={fatigueColor(muscle.peakLevel)}
                  baseline="zero"
                  ceiling={100}
                  valueHeader={t('progress.fatigueHeader')}
                />
                <p className="px-4 pb-3 text-dark-400 text-[11px] leading-relaxed">
                  {t('progress.recoveryNote')}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

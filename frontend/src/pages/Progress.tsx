import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { progressService } from '../services/progress.service'
import { E1rmPoint, MuscleFatigueHistory, ProgressSummary, StrengthEntry } from '../types'
import TrendChart from '../components/progress/TrendChart'
import VolumeBars from '../components/progress/VolumeBars'

/**
 * The progress screen.
 *
 * For a strength app this was the most conspicuous absence in the product:
 * `ExerciseStrengthEstimate` was computed on every finished session, corrected
 * on every edit, and rendered nowhere. Same for session volume and the muscle
 * fatigue log. Nothing here is a new measurement — it is all reading back what
 * was already being written.
 *
 * Three tabs rather than one long scroll, because they are three different
 * questions and only one is ever being asked: am I getting stronger, am I doing
 * more, and where is the load landing. Each tab's expensive read happens once,
 * on first visit.
 *
 * `TrainingLoadCard` stays on Profile. Fitness/fatigue/form is the same family
 * of question, but it is already there and moving it would take a card away
 * from a screen someone is using today.
 */

type Tab = 'Strength' | 'Volume' | 'Recovery'

const fmtAgo = (iso: string | null) => {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

const fatigueTone = (level: number) =>
  level >= 70 ? 'text-brand-red' : level >= 35 ? 'text-brand-yellow' : 'text-brand-green'

const fatigueColor = (level: number) =>
  level >= 70 ? '#EF4444' : level >= 35 ? '#FACC15' : '#4ADE80'

export default function Progress() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Strength')

  const [summary, setSummary] = useState<ProgressSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    progressService.getSummary()
      .then(setSummary)
      .catch(() => setError('Could not load your progress. Check your connection and try again.'))
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-dark-800 border border-dark-600
                     flex items-center justify-center text-lg text-white">←</button>
        <h1 className="text-xl font-extrabold text-white">Progress</h1>
      </div>

      {/* Tabs, matching Calendar's control so the two screens feel like siblings. */}
      <div className="flex gap-2 mb-4">
        {(['Strength', 'Volume', 'Recovery'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-btn text-xs font-semibold transition-colors
              ${tab === t ? 'bg-brand-teal text-black' : 'bg-dark-800 text-dark-300 border border-dark-600'}`}
          >
            {t}
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
                  ? 'No finished sessions in the last 12 weeks yet.'
                  : `You trained in ${summary.volume.activeWeeks} of the last ${summary.volume.weeks.length} weeks.`}
              </p>
            </>
          )}
          {tab === 'Recovery' && <RecoveryTab muscles={summary.muscles} />}
        </>
      )}
    </div>
  )
}

/**
 * Every exercise with a strength estimate, best first, each expanding into its
 * own history.
 *
 * The series is fetched per exercise when it is opened. Pre-fetching all of them
 * would read the athlete's entire set history to draw charts nobody looked at.
 */
function StrengthTab({ entries }: { entries: StrengthEntry[] }) {
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
        <p className="text-white text-sm font-semibold">No strength estimates yet</p>
        <p className="text-dark-300 text-xs mt-2 leading-relaxed">
          Finish a session with a weighted or bodyweight exercise and an estimated
          one-rep max appears here. Cardio and mobility work does not produce one.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-dark-400 text-[11px] px-1 leading-relaxed">
        Estimated one-rep max from your logged sets, best first. Calisthenics
        includes your bodyweight, so it reads as a total load rather than
        something on a bar.
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
                  {entry.sessionCount} session{entry.sessionCount === 1 ? '' : 's'} · last {fmtAgo(entry.lastPerformedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right">
                  <p className="text-brand-teal text-lg font-bold leading-none tabular-nums">
                    {entry.e1rm}
                    <span className="text-dark-300 text-xs font-semibold ml-0.5">kg</span>
                  </p>
                  <p className="text-dark-400 text-[10px] mt-0.5">est. 1RM</p>
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
                    {/* Not a best-so-far line: it goes down when the athlete's
                        sets got lighter, which is the whole reason to look. PRs
                        are ringed instead. */}
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
                      valueHeader="Est. 1RM"
                      singleHint="log it once more and a trend appears here."
                    />
                    <p className="px-4 pb-3 text-dark-400 text-[11px] leading-relaxed">
                      ★ marks a new best. Estimated from weight, reps and RPE — it
                      is not a tested max.
                    </p>
                  </>
                ) : (
                  <p className="px-4 py-3 text-dark-400 text-xs">
                    No sets with a weight and rep count yet, so there is nothing to plot.
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
 * Per-muscle fatigue over the last 30 days.
 *
 * Ordered by average load, so the muscles actually carrying the training are at
 * the top. The series is a replay of the decay curve rather than the logged
 * spikes, so today's last point is the same number the body map is showing.
 */
function RecoveryTab({ muscles }: { muscles: MuscleFatigueHistory[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  const busiest = useMemo(() => muscles.slice(0, 3), [muscles])

  if (muscles.length === 0) {
    return (
      <div className="bg-dark-800 rounded-card border border-dark-600 p-5">
        <p className="text-white text-sm font-semibold">Nothing to show yet</p>
        <p className="text-dark-300 text-xs mt-2 leading-relaxed">
          Finish a session and each muscle it loaded gets a recovery curve here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="bg-dark-800 rounded-card border border-dark-600 p-4">
        <p className="text-dark-300 text-xs uppercase tracking-wider">Carrying the most</p>
        <p className="text-white text-sm mt-1.5 leading-relaxed">
          Over the last 30 days: {busiest.map(m => m.muscleName).join(', ')}.
        </p>
        <p className="text-dark-400 text-[11px] mt-2 leading-relaxed">
          Average fatigue across the window, not right now — a muscle high here is
          one that rarely gets a clear day, which is different from one that is
          sore today.
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
                  avg {muscle.averageLevel}% · peak {muscle.peakLevel}% · {muscle.hits.length} session
                  {muscle.hits.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right">
                  {/* Colour is never the only cue — the label says "now". */}
                  <p className={`text-lg font-bold leading-none tabular-nums ${fatigueTone(current)}`}>
                    {current}%
                  </p>
                  <p className="text-dark-400 text-[10px] mt-0.5">now</p>
                </div>
                <span className={`text-dark-400 text-lg leading-none transition-transform
                                 ${isOpen ? 'rotate-90' : ''}`}>›</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-dark-700">
                {/* Anchored at zero with a fixed 100 ceiling: fatigue is already
                    a percentage of a maximum, and auto-fitting it would make a
                    quiet month look like a hard one. */}
                <TrendChart
                  points={muscle.points.map(p => ({ at: p.at, value: p.level }))}
                  format={v => `${v}%`}
                  color={fatigueColor(muscle.peakLevel)}
                  baseline="zero"
                  ceiling={100}
                  valueHeader="Fatigue"
                />
                <p className="px-4 pb-3 text-dark-400 text-[11px] leading-relaxed">
                  One point per day, recovery included — the dips are the curve
                  clearing, not missing data.
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { templateService } from '../../services/template.service'
import { rpeColor, nextLoad } from './helpers'
import { useT, MessageKey } from '../../i18n'
import NumberField from '../../components/workout/NumberField'
import { LightbulbIcon } from '../../components/icons'
import { ModalityIcon } from '../../components/icons'

// Label and colour for how each suggestion was derived, shown with its reasoning.
const BASIS_STYLE: Record<string, { label: MessageKey; color: string }> = {
  progression: { label: 'plan.basisProgress',  color: '#4ADE80' },
  repeat:      { label: 'plan.basisRepeat',    color: '#00D4AA' },
  deload:      { label: 'plan.basisBackOff',   color: '#FACC15' },
  return:      { label: 'plan.basisEasingIn',  color: '#A78BFA' },
  estimate:    { label: 'plan.basisEstimate',  color: '#888888' },
  default:     { label: 'plan.basisNew',       color: '#888888' },
}

// ── small stepper button ──────────────────────────────────────────────────
function Step({ children, onClick, disabled }: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-[30px] h-[30px] flex-shrink-0 rounded-[9px] border border-dark-600 bg-dark-700
                 text-white text-lg font-bold flex items-center justify-center
                 active:scale-90 transition-transform disabled:opacity-30"
    >
      {children}
    </button>
  )
}

export default function PlanSets() {
  const navigate = useNavigate()
  const { t, tn } = useT()
  const {
    selectedExercises, suggestionsLoading, loadSuggestions,
    updateSet, addSet, removeSet, setExerciseRest, removeExerciseAt, setQuickLog,
  } = useWorkoutStore()

  // Fetch history-based suggestions; modality defaults show until they land
  useEffect(() => {
    loadSuggestions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Aggregate stats
  const totalSets = selectedExercises.reduce(
    (sum, se) => sum + (se.skipped ? 0 : se.sets.length), 0
  )
  const estimatedMinutes = Math.max(1, Math.round(
    selectedExercises.reduce((sum, se) =>
      se.skipped ? sum
        : sum + se.sets.reduce((s, set) => s + 35 + set.restSeconds, 0), 0
    ) / 60
  ))

  const handleStart = () => navigate('/workout/active')

  // Quick log (no timer) — strength only, since its card floors load at 0 kg
  const live = selectedExercises.filter(se => !se.skipped)
  const canQuickLog = live.length > 0 && live.every(se => se.exercise.modality === 'Strength')

  // Set on the way out; while on, the browse tray adds exercises to the log instead
  const handleQuickLog = () => {
    setQuickLog(true)
    navigate('/workout/log')
  }

  if (selectedExercises.length === 0) {
    return (
      <div className="flex-1 bg-dark-900 flex items-center justify-center px-5">
        <div className="text-center">
          <p className="text-white text-lg mb-4">{t('live.noExercises')}</p>
          <button
            onClick={() => navigate('/workout/browse')}
            className="bg-brand-teal text-black px-6 py-3 rounded-btn font-bold">
            {t('live.browseExercises')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-dark-900 text-white">
      <div className="px-5 pt-4 pb-2">

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-4">
          <button
            onClick={() => navigate('/workout/browse')}
            className="w-10 h-10 rounded-full border border-dark-600 bg-dark-800
                       text-white text-lg flex items-center justify-center
                       flex-shrink-0 active:scale-90 transition-transform"
          >
            ←
          </button>
          <div>
            <h1 className="text-2xl font-extrabold leading-tight">{t('plan.title')}</h1>
            <p className="text-dark-300 text-[13px] mt-0.5">
              {t('plan.subtitle', { count: selectedExercises.length })}
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {[
            { value: String(totalSets), label: t('plan.statTotalSets') },
            { value: String(selectedExercises.length), label: t('plan.statExercises') },
            { value: `~${t('unit.minutes', { n: estimatedMinutes })}`, label: t('plan.statDuration') },
          ].map(s => (
            <div key={s.label}
              className="bg-dark-800 border border-dark-600 rounded-card
                         py-4 px-2 text-center">
              <p className="text-[22px] font-extrabold">{s.value}</p>
              <p className="text-dark-300 text-[11px] mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tip */}
        <div className="flex gap-2.5 bg-[#0a2a22] border border-brand-teal/25
                        rounded-card p-3.5 mb-4">
          <LightbulbIcon className="w-4 h-4 flex-shrink-0" />
          <p className="text-dark-200 text-[12.5px] leading-relaxed">
            {suggestionsLoading
              ? t('plan.checkingLast')
              : <>{t('plan.tipBefore')}{' '}
                  <span className="text-brand-teal">{t('plan.tipLink')}</span>{' '}
                  {t('plan.tipAfter')}</>}
          </p>
        </div>

        {/* Exercise cards */}
        <div className="flex flex-col gap-4">
          {selectedExercises.map((se, ei) => {
            const ex = se.exercise
            const rest = se.sets[0]?.restSeconds ?? 90
            return (
              <div key={ex.id}
                className="bg-dark-800 border border-dark-600 rounded-card overflow-hidden"
                style={{ opacity: se.skipped ? 0.55 : 1 }}>

                {/* Exercise header */}
                <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                  <div className="w-10 h-10 rounded-[10px] bg-dark-700 flex items-center
                                  justify-center text-xl flex-shrink-0">
                    <ModalityIcon modality={ex.modality ?? ''} className="w-5 h-5 text-dark-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold leading-tight truncate">{ex.name}</p>
                    <p className="text-dark-300 text-xs mt-0.5">{ex.modality}</p>
                  </div>
                  <span className="text-dark-300 text-xs flex-shrink-0">
                    {tn('calendar.sets', se.sets.length)}
                  </span>
                </div>

                {/* Why these numbers */}
                {se.suggestion && !se.skipped && (
                  <div className="px-4 pb-3 -mt-1">
                    <div className="flex items-start gap-2">
                      <span className="text-[9.5px] font-bold tracking-wider px-1.5 py-0.5
                                       rounded-badge flex-shrink-0 mt-[1px]"
                        style={{
                          color: BASIS_STYLE[se.suggestion.basis]?.color ?? '#888888',
                          background: `${BASIS_STYLE[se.suggestion.basis]?.color ?? '#888888'}1f`,
                        }}>
                        {t(BASIS_STYLE[se.suggestion.basis]?.label ?? 'plan.basisFallback')}
                      </span>
                      <p className="text-dark-300 text-[11.5px] leading-snug">
                        {se.suggestion.note}
                        {se.edited && (
                          <span className="text-dark-400">{t('plan.edited')}</span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Column headers — `minmax(0,1fr)` lets the columns shrink below their content */}
                <div className="grid grid-cols-[22px_minmax(0,1fr)_minmax(0,1fr)_38px_24px] gap-1 px-4 py-1 items-center">
                  <div />
                  <p className="text-[10px] tracking-wider text-dark-400 text-center">{t('plan.colReps')}</p>
                  <p className="text-[10px] tracking-wider text-dark-400 text-center">
                    {t(ex.modality === 'Calisthenics' ? 'plan.colLoad' : 'plan.colWeight')}
                  </p>
                  <p className="text-[10px] tracking-wider text-dark-400 text-center">RPE</p>
                  <div />
                </div>

                {/* Set rows */}
                {se.sets.map((s, si) => (
                  <div key={si}>
                    <div className="grid grid-cols-[22px_minmax(0,1fr)_minmax(0,1fr)_38px_24px] gap-1 px-4 py-1.5 items-center">
                      <div className="w-[22px] h-[22px] rounded-badge bg-dark-700 border border-dark-600
                                      flex items-center justify-center text-[11px] font-bold text-dark-200">
                        {si + 1}
                      </div>
                      {/* reps */}
                      <div className="flex items-center justify-center gap-1">
                        <Step onClick={() => updateSet(ei, si, { reps: Math.max(1, s.reps - 1) })}>−</Step>
                        <div className="flex-1 min-w-0">
                          <NumberField kind="reps" label={`Set ${si + 1} reps`} value={s.reps}
                            onChange={reps => updateSet(ei, si, { reps })}
                            className="text-[15px] font-bold" />
                        </div>
                        <Step onClick={() => updateSet(ei, si, { reps: s.reps + 1 })}>+</Step>
                      </div>
                      {/* weight */}
                      <div className="flex items-center justify-center gap-1">
                        {/* Calisthenics load may go negative (assistance); others floor at 0 */}
                        <Step onClick={() => updateSet(ei, si, {
                          weight: (v => ex.modality === 'Calisthenics' ? v : Math.max(0, v))(
                            nextLoad(s.weight, -1)),
                        })}>−</Step>
                        <div className="flex-1 min-w-0">
                          <NumberField kind="weight" label={`Set ${si + 1} weight`} value={s.weight}
                            signed={ex.modality === 'Calisthenics'}
                            onChange={weight => updateSet(ei, si, { weight })}
                            className="text-[15px] font-bold" />
                        </div>
                        <Step onClick={() => updateSet(ei, si, { weight: nextLoad(s.weight, 1) })}>+</Step>
                      </div>
                      {/* rpe */}
                      <NumberField kind="rpe" label={`Set ${si + 1} RPE`} value={s.rpe}
                        onChange={rpe => updateSet(ei, si, { rpe })}
                        className="text-[15px] font-extrabold"
                        style={{ color: rpeColor(s.rpe) }} />
                      {/* remove */}
                      <button
                        onClick={() => removeSet(ei, si)}
                        disabled={se.sets.length <= 1}
                        className="w-[24px] h-[24px] rounded-badge text-dark-400 text-base
                                   flex items-center justify-center disabled:opacity-30"
                      >
                        ×
                      </button>
                    </div>
                    {si < se.sets.length - 1 && (
                      <div className="text-center pb-1">
                        <button
                          onClick={() => se.sets.forEach((_, j) => {
                            if (j > si) updateSet(ei, j, {
                              reps: s.reps, weight: s.weight, rpe: s.rpe,
                            })
                          })}
                          className="text-dark-400 hover:text-brand-teal text-[11px] transition-colors"
                        >
                          {t('plan.copyToRemaining')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* Rest row */}
                <div className="flex items-center justify-between gap-2 py-3 mx-4 mt-2
                                border-t border-dark-600">
                  <div className="flex items-center gap-2 min-w-0 text-dark-200 text-[13.5px]">
                    <span>⏱️</span> {t('plan.restBetween')}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Step onClick={() => setExerciseRest(ei, rest - 15)}>−</Step>
                    <span className="min-w-[42px] text-center text-[15px] font-bold">{t('unit.seconds', { n: rest })}</span>
                    <Step onClick={() => setExerciseRest(ei, rest + 15)}>+</Step>
                  </div>
                </div>

                {/* Add / remove exercise */}
                <div className="px-4 pb-4 flex gap-2">
                  <button
                    onClick={() => addSet(ei)}
                    className="flex-1 py-3 rounded-btn border border-dashed border-dark-500
                               text-dark-300 text-[13px] font-semibold
                               active:scale-95 transition-transform hover:text-brand-teal
                               hover:border-brand-teal/40"
                  >
                    {t('plan.addSet')}
                  </button>
                  <button
                    onClick={() => removeExerciseAt(ei)}
                    className="px-4 py-3 rounded-btn border border-brand-red/40 bg-[#2a1a1a]
                               text-brand-red text-[13px] font-semibold
                               active:scale-95 transition-transform"
                  >
                    {t('plan.removeExercise')}
                  </button>
                </div>
              </div>
            )
          })}

          <button
            onClick={() => navigate('/workout/browse')}
            className="w-full py-4 rounded-card border border-dashed border-dark-500
                       bg-dark-800 text-dark-200 text-sm font-semibold
                       active:scale-95 transition-transform"
          >
            {t('plan.addExercise')}
          </button>

          {/* Save this plan for later */}
          <SavePlanPanel />
        </div>

        {/* Sticky start */}
        <div className="sticky bottom-0 pt-4 pb-1 mt-5"
          style={{ background: 'linear-gradient(to top, #111 70%, transparent)' }}>
          <button
            onClick={handleStart}
            disabled={totalSets === 0}
            className="w-full py-[18px] rounded-card bg-brand-teal text-black
                       text-[17px] font-extrabold active:scale-95 transition-transform
                       disabled:opacity-40"
            style={{ boxShadow: '0 8px 24px -6px rgba(0,212,170,0.4)' }}
          >
            {t('plan.start', { sets: totalSets })}
          </button>
          {canQuickLog && (
            <button
              onClick={handleQuickLog}
              className="w-full mt-2 py-3 rounded-btn border border-dark-600 bg-dark-800
                         text-dark-200 text-[13.5px] font-semibold
                         active:scale-95 transition-transform"
            >
              {t('plan.startNoTimer')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Save the current plan, optionally on a date. Collapsed by default. */
function SavePlanPanel() {
  const navigate = useNavigate()
  const { t } = useT()
  const { selectedExercises, saveAsTemplate, sourceTemplateId } = useWorkoutStore()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [when, setWhen] = useState('')
  const [remind, setRemind] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const liveCount = selectedExercises.filter(se => !se.skipped).length

  const save = async () => {
    if (!name.trim()) {
      setError(t('plan.nameRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const template = await saveAsTemplate(name.trim())

      if (when) {
        // datetime-local is local wall-clock time; toISOString converts it
        const scheduledFor = new Date(when)
        // Reminder an hour before
        const reminderAt = remind
          ? new Date(scheduledFor.getTime() - 60 * 60 * 1000).toISOString()
          : null
        await templateService.schedule(template.id, scheduledFor.toISOString(), reminderAt)
      }

      setSaved(true)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('plan.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (liveCount === 0) return null

  if (saved) {
    return (
      <div className="rounded-card border border-brand-teal/40 bg-[#0a2a22] px-4 py-3.5">
        <p className="text-[13px] font-bold text-brand-teal">{t('plan.savedTitle')}</p>
        <p className="text-dark-200 text-[12px] mt-1 leading-snug">
          {t(when ? 'plan.savedScheduled' : 'plan.savedAnytime')}
        </p>
        <button
          onClick={() => navigate('/plans')}
          className="mt-3 px-4 py-2 rounded-btn border border-dark-600 bg-dark-800
                     text-white text-[12.5px] font-bold active:scale-95 transition-transform"
        >
          {t('plan.viewPlans')}
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3.5 rounded-card border border-dark-600 bg-dark-800
                   text-left px-4 active:scale-[0.99] transition-transform"
      >
        <p className="text-[10px] tracking-wide text-dark-400">{t('plan.keepHeading')}</p>
        <p className="text-[13px] font-semibold mt-0.5">
          {t(sourceTemplateId ? 'plan.saveAsNew' : 'plan.saveAndSchedule')}
        </p>
      </button>
    )
  }

  return (
    <div className="rounded-card border border-dark-600 bg-dark-800 px-4 py-4">
      <p className="text-[10px] tracking-wide text-dark-400">{t('plan.saveHeading')}</p>

      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={t('plan.namePlaceholder')}
        className="w-full mt-2.5 bg-dark-700 border border-dark-600 rounded-btn px-3.5 py-2.5
                   text-white text-sm placeholder-dark-400 outline-none
                   focus:border-brand-teal/60 transition-colors"
      />

      <label className="block mt-3 text-[11.5px] text-dark-300">
        {t('plan.onADate')}
        <input
          type="datetime-local"
          value={when}
          onChange={e => setWhen(e.target.value)}
          className="w-full mt-1.5 bg-dark-700 border border-dark-600 rounded-btn px-3.5 py-2.5
                     text-white text-sm outline-none focus:border-brand-teal/60 transition-colors"
        />
      </label>

      {when && (
        <label className="flex items-center gap-2.5 mt-3 text-[12.5px] text-dark-200">
          <input
            type="checkbox"
            checked={remind}
            onChange={e => setRemind(e.target.checked)}
            className="w-4 h-4 accent-[#00D4AA]"
          />
          {t('plan.remindHour')}
        </label>
      )}

      {error && <p className="mt-2.5 text-[12px] text-brand-red font-semibold">{error}</p>}

      <div className="flex gap-2 mt-3.5">
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 py-3 rounded-btn bg-brand-teal text-black text-[13px] font-extrabold
                     active:scale-95 transition-transform disabled:opacity-40"
        >
          {busy ? t('common.saving') : t(when ? 'plan.saveSchedule' : 'plan.savePlan')}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-4 py-3 rounded-btn border border-dark-600 bg-dark-700
                     text-white text-[13px] font-bold active:scale-95 transition-transform"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

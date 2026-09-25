import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SelectedExercise, useWorkoutStore } from '../../store/useWorkoutStore'
import SaveToCalendar from '../../components/workout/SaveToCalendar'
import { rpeColor, rpeTint, rpeWord, summariseSession, nextLoad } from './helpers'
import { ModalityIcon } from '../../components/icons'

const IcCheck = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

/**
 * A strength session with no set card, rest timer or clock: one card per
 * exercise, ticked off as it is finished, all of it logged at Finish.
 *
 * It is still a real session, opened the moment this screen mounts. The finish
 * sends elapsed time, and the fatigue model scores whole-body load as minutes ×
 * RPE — so the clock runs even though it is never shown, and this screen is
 * meant to be open during the workout rather than filled in afterwards.
 */
export default function QuickLog() {
  const navigate = useNavigate()
  const {
    selectedExercises, sessionId, completedSets, suggestionsLoading,
    startSession, loadSuggestions, updateSet, addSet, removeSet, toggleDone, completeSet,
    startError, clearErrors,
  } = useWorkoutStore()

  const [saving, setSaving] = useState(false)
  // Held here rather than read from the store's logError: every successful
  // completeSet clears that, so with exercises saving in parallel one
  // exercise's success can erase another's failure before it is ever shown.
  const [finishError, setFinishError] = useState<string | null>(null)
  // Ref, not state: two taps in one tick would both read `saving` as false
  const finishingRef = useRef(false)

  const beginSession = () => {
    const s = useWorkoutStore.getState()
    if (s.sessionId || s.selectedExercises.length === 0) return
    // Nothing attached yet — see `startSession` for why only ticked exercises
    // ever are.
    startSession({ registerExercises: false })
      .catch(() => { /* startError is surfaced from the store */ })
  }

  useEffect(() => {
    beginSession()
    loadSuggestions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const ticked = selectedExercises.filter(se => se.done && !se.skipped)
  const tickedSets = ticked.reduce((n, se) => n + se.sets.length, 0)

  const handleFinish = async () => {
    if (finishingRef.current || !sessionId) return
    finishingRef.current = true
    setSaving(true)
    setFinishError(null)
    clearErrors()

    const targets = useWorkoutStore.getState().selectedExercises
      .map((se, exIdx) => ({ se, exIdx }))
      .filter(({ se }) => se.done && !se.skipped)

    // Exercises in parallel, sets within one in order. The first set is what
    // attaches the exercise to the session; firing its siblings alongside it
    // would attach it once per set.
    // `as`, not an annotation: TypeScript would narrow an annotated `= null` to
    // null for good, not seeing the callbacks below assign it.
    let failure = null as string | null
    await Promise.all(targets.map(async ({ exIdx }) => {
      const { sets } = useWorkoutStore.getState().selectedExercises[exIdx]
      for (let setIdx = 0; setIdx < sets.length; setIdx++) {
        const { reps, weight, rpe } = sets[setIdx]
        // No restSeconds: nobody timed the rest, and a planned figure written
        // into the log would read as a measured one.
        if (!(await completeSet({ reps, weight, rpe }, { exIdx, setIdx }))) {
          failure ??= useWorkoutStore.getState().logError ?? 'Some sets could not be saved.'
          return
        }
      }
    }))

    if (failure) {
      // Whatever did land is keyed by set number on the server, so pressing
      // Finish again overwrites rather than duplicates.
      setFinishError(failure)
      finishingRef.current = false
      setSaving(false)
      return
    }

    const state = useWorkoutStore.getState()
    const elapsed = state.sessionStartTime
      ? Math.max(0, Math.floor((Date.now() - state.sessionStartTime.getTime()) / 1000))
      : 0
    navigate('/workout/finish', {
      state: { snapshot: summariseSession(state.selectedExercises, state.completedSets, elapsed) },
      replace: true,   // back must not return to a session that is over
    })
  }

  // Held until the Finish screen takes over, which renders this same card —
  // the two read as one moment rather than a swap.
  if (saving) {
    return <SaveToCalendar pending onSettled={() => {}} headline="Saving your sets" />
  }

  if (selectedExercises.length === 0) {
    return (
      <div className="flex-1 bg-dark-900 flex items-center justify-center px-5">
        <div className="text-center">
          <p className="text-white text-lg mb-4">No exercises selected</p>
          <button
            onClick={() => navigate('/workout/browse', { state: { modality: 'Strength' } })}
            className="bg-brand-teal text-black px-6 py-3 rounded-btn font-bold">
            Browse Exercises
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
            onClick={() => navigate('/workout/browse', { state: { modality: 'Strength' } })}
            className="w-10 h-10 rounded-full border border-dark-600 bg-dark-800
                       text-white text-lg flex items-center justify-center
                       flex-shrink-0 active:scale-90 transition-transform"
          >
            ←
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-tight">Quick Log</h1>
            <p className="text-dark-300 text-[13px] mt-0.5">
              {suggestionsLoading
                ? 'Filling in your last numbers…'
                : `${ticked.length} of ${selectedExercises.length} done · tick each one as you finish it`}
            </p>
          </div>
        </div>

        {startError && (
          <div className="mb-4 rounded-card border border-brand-red/40 bg-[#2a1a1a] px-4 py-3.5">
            <p className="text-[13px] text-white leading-snug">{startError}</p>
            <button
              onClick={() => { clearErrors(); beginSession() }}
              className="w-full mt-2.5 py-2.5 rounded-btn bg-brand-teal text-black text-[13px]
                         font-bold active:scale-95 transition-transform">
              Retry
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3.5">
          {selectedExercises.map((se, exIdx) => se.skipped ? null : (
            <ExerciseCard
              key={se.exercise.id}
              se={se}
              // Once any of its sets are on the server the card is frozen. Only
              // reachable after a Finish that failed part-way, and editing then
              // would leave the server holding sets the card no longer shows.
              locked={completedSets.some(cs => cs.exerciseId === se.exercise.id)}
              onUpdate={(setIdx, patch) => updateSet(exIdx, setIdx, patch)}
              onAdd={() => addSet(exIdx)}
              onRemove={setIdx => removeSet(exIdx, setIdx)}
              onToggle={() => toggleDone(exIdx)}
            />
          ))}

          <button
            onClick={() => navigate('/workout/browse', { state: { modality: 'Strength' } })}
            className="w-full py-4 rounded-card border border-dashed border-dark-500
                       bg-dark-800 text-dark-200 text-sm font-semibold
                       active:scale-95 transition-transform"
          >
            + Add Exercise
          </button>
        </div>

        {/* Sticky finish */}
        <div className="sticky bottom-0 pt-4 pb-1 mt-5"
          style={{ background: 'linear-gradient(to top, #111 70%, transparent)' }}>
          {finishError && (
            <p className="mb-2.5 text-center text-[12.5px] text-brand-red font-semibold leading-snug">
              {finishError}
            </p>
          )}
          <button
            onClick={handleFinish}
            disabled={saving || !sessionId || ticked.length === 0}
            className="w-full py-[18px] rounded-card bg-brand-teal text-black
                       text-[17px] font-extrabold active:scale-95 transition-transform
                       disabled:opacity-40"
            style={{ boxShadow: '0 8px 24px -6px rgba(0,212,170,0.4)' }}
          >
            {ticked.length === 0
              ? 'Tick an exercise to finish'
              : `✓ Finish & Log — ${tickedSets} set${tickedSets === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

type SetPatch = { reps?: number; weight?: number; rpe?: number }

// ── one exercise: a row per set, one row open for editing, and the tick ───
function ExerciseCard({ se, locked, onUpdate, onAdd, onRemove, onToggle }: {
  se: SelectedExercise
  locked: boolean
  onUpdate: (setIdx: number, patch: SetPatch) => void
  onAdd: () => void
  onRemove: (setIdx: number) => void
  onToggle: () => void
}) {
  const ex = se.exercise
  const done = Boolean(se.done)

  // One row open at a time: two open editors on a phone is a screen of
  // steppers with no way to tell which set they belong to. Guarded rather than
  // reset in an effect — a suggestion landing can shorten the list under it.
  const [open, setOpen] = useState<number | null>(null)
  const openIdx = !locked && open !== null && open < se.sets.length ? open : null

  const handleToggle = () => {
    // Ticking says "these numbers are what I did" — an editor left open under
    // that reads as a set still being changed.
    setOpen(null)
    onToggle()
  }

  const handleAdd = () => {
    // Open the new row. It starts as a copy of the last set, and the reason to
    // add one is nearly always to change it — a back-off set, a drop.
    setOpen(se.sets.length)
    onAdd()
  }

  return (
    <div className={`rounded-card border overflow-hidden transition-colors
                     ${done ? 'border-brand-teal/60 bg-[#0a2a22]' : 'border-dark-600 bg-dark-800'}`}>

      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="w-10 h-10 rounded-[10px] bg-dark-700 flex items-center
                        justify-center text-xl flex-shrink-0">
          <ModalityIcon modality={ex.modality ?? ''} className="w-5 h-5 text-dark-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold leading-tight truncate">{ex.name}</p>
          <p className="text-dark-300 text-xs mt-0.5 truncate">
            {locked ? 'Saved' : ex.muscles.map(m => m.name).slice(0, 3).join(' · ')}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={locked}
          aria-pressed={done}
          aria-label={done ? `Mark ${ex.name} as not done` : `Mark ${ex.name} as done`}
          className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0
                      border-2 active:scale-90 transition-all disabled:opacity-60
                      ${done
                        ? 'bg-brand-teal border-brand-teal text-black'
                        : 'bg-transparent border-dark-500 text-dark-500'}`}
        >
          <IcCheck />
        </button>
      </div>

      {/* Where the pre-filled numbers came from. They were not typed by the
          athlete, so the reason has to be on the card they are vouching for. */}
      {se.suggestion && !done && !locked && (
        <p className="px-4 -mt-1 pb-3 text-dark-300 text-[11.5px] leading-snug">
          {se.suggestion.note}
        </p>
      )}

      <div className={`flex flex-col gap-1.5 px-3 ${locked ? 'pb-3' : ''}`}>
        {se.sets.map((s, si) => (
          <SetRow
            // Index keys are right here: sets have no identity of their own,
            // and "set 2" is whatever currently sits second.
            key={si}
            n={si + 1}
            set={s}
            open={openIdx === si}
            locked={locked}
            canRemove={se.sets.length > 1}
            hasBelow={si < se.sets.length - 1}
            onOpen={() => setOpen(openIdx === si ? null : si)}
            onChange={patch => onUpdate(si, patch)}
            onCopyDown={() => se.sets.forEach((_, j) => {
              if (j > si) onUpdate(j, { reps: s.reps, weight: s.weight, rpe: s.rpe })
            })}
            onRemove={() => { setOpen(null); onRemove(si) }}
          />
        ))}
      </div>

      {!locked && (
        <div className="px-3 pt-2 pb-3">
          <button
            onClick={handleAdd}
            className="w-full py-2.5 rounded-btn border border-dashed border-dark-500
                       text-dark-300 text-[13px] font-semibold
                       active:scale-95 transition-transform hover:text-brand-teal
                       hover:border-brand-teal/40"
          >
            + Add set
          </button>
        </div>
      )}
    </div>
  )
}

const IcChevron = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
    className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

// ── one set: a summary line that opens into its editor ────────────────────
function SetRow({ n, set, open, locked, canRemove, hasBelow, onOpen, onChange, onCopyDown, onRemove }: {
  n: number
  set: { reps: number; weight: number; rpe: number }
  open: boolean
  locked: boolean
  canRemove: boolean
  hasBelow: boolean
  onOpen: () => void
  onChange: (patch: SetPatch) => void
  onCopyDown: () => void
  onRemove: () => void
}) {
  return (
    <div className={`rounded-btn border transition-colors
                     ${open ? 'border-brand-teal/40 bg-dark-900' : 'border-dark-600 bg-dark-900/40'}`}>

      <button
        onClick={onOpen}
        disabled={locked}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-btn
                   active:bg-dark-700/40 transition-colors disabled:cursor-default"
      >
        <span className="w-6 h-6 rounded-badge bg-dark-700 border border-dark-600
                         flex items-center justify-center text-[11px] font-bold text-dark-200
                         flex-shrink-0">
          {n}
        </span>
        <span className="flex-1 min-w-0 truncate text-[15px] font-bold tabular-nums">
          {set.reps}<span className="text-dark-300 text-[12px] font-semibold"> reps</span>
          <span className="text-dark-400 mx-1.5">×</span>
          {set.weight}<span className="text-dark-300 text-[12px] font-semibold"> kg</span>
        </span>
        <span className="px-2 py-1 rounded-badge text-[11px] font-extrabold tabular-nums flex-shrink-0"
          style={{ color: rpeColor(set.rpe), background: rpeTint(set.rpe) }}>
          RPE {set.rpe}
        </span>
        {!locked && (
          <span className={`flex-shrink-0 ${open ? 'text-brand-teal' : 'text-dark-300'}`}>
            <IcChevron open={open} />
          </span>
        )}
      </button>

      {/* 0fr → 1fr animates to the editor's real height, which a max-height
          guess cannot. `visibility` flips late on the way closed so the
          collapse is still seen, and it takes a closed editor's inputs out of
          the tab order — clipping alone would leave them focusable. */}
      <div
        className="grid"
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          visibility: open ? 'visible' : 'hidden',
          transition: open
            ? 'grid-template-rows 200ms ease'
            : 'grid-template-rows 200ms ease, visibility 0s linear 200ms',
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-3 pb-3 pt-0.5">
            <div className="grid grid-cols-2 gap-2">
              <Stepper label="REPS" value={set.reps} step={1} min={1} max={1000}
                onChange={reps => onChange({ reps })} />
              <Stepper label="KG" value={set.weight} step={2.5} next={nextLoad} min={0} max={1000} decimal
                onChange={weight => onChange({ weight })} />
            </div>

            <div className="flex items-center justify-between mt-3 mb-1.5">
              <span className="text-[10px] tracking-widest text-dark-300">RPE</span>
              <span className="text-[12.5px] font-bold" style={{ color: rpeColor(set.rpe) }}>
                {set.rpe} — {rpeWord(set.rpe)}
              </span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(r => {
                const on = r === set.rpe
                return (
                  <button key={r}
                    onClick={() => onChange({ rpe: r })}
                    aria-pressed={on}
                    className="flex-1 min-w-0 py-2 rounded-[8px] text-[13px] font-extrabold border
                               transition-all active:scale-90"
                    style={{
                      borderColor: on ? rpeColor(r) : 'transparent',
                      background: on ? rpeColor(r) : rpeTint(r),
                      color: on ? '#000' : rpeColor(r),
                    }}>{r}</button>
                )
              })}
            </div>

            <div className="flex gap-2 mt-3">
              {hasBelow && (
                <button
                  onClick={onCopyDown}
                  className="flex-1 py-2.5 rounded-btn border border-dark-600 bg-dark-800
                             text-dark-200 text-[12.5px] font-semibold
                             active:scale-95 transition-transform"
                >
                  ↓ Copy to sets below
                </button>
              )}
              <button
                onClick={onRemove}
                // The last set stays: an exercise with nothing in it is not
                // "done with zero sets", it is untick-and-move-on.
                disabled={!canRemove}
                className="flex-1 py-2.5 rounded-btn border border-brand-red/40 bg-[#2a1a1a]
                           text-brand-red text-[12.5px] font-semibold
                           active:scale-95 transition-transform disabled:opacity-30"
              >
                Remove set
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * −/+ around a number that can also be typed into.
 *
 * Typing matters more here than on Plan Sets: this screen is the whole log,
 * and 2.5 kg steps from an estimate to a real working weight can be twenty
 * taps. The field holds a string while focused and commits on blur — an
 * emptied field reverts instead, because `Number('')` is 0 and a stray zero
 * would be logged as a set done at nothing.
 */
function Stepper({ label, value, step, next, min, max, decimal, onChange }: {
  label: string
  value: number
  step: number
  /** Replaces the flat `step` for the buttons — weight steps on the plate grid. */
  next?: (value: number, dir: 1 | -1) => number
  min: number
  max: number
  decimal?: boolean
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = (n: number) =>
    Math.min(max, Math.max(min, decimal ? Math.round(n * 10) / 10 : Math.round(n)))

  const commit = () => {
    if (draft === null) return
    const n = Number(draft.replace(',', '.'))
    if (draft.trim() !== '' && Number.isFinite(n)) onChange(clamp(n))
    setDraft(null)
  }

  // 36px: pressed between sets, often with chalk or a shaking hand
  const btn = `w-9 h-9 flex-shrink-0 rounded-[10px] border border-dark-600 bg-dark-700
               text-white text-lg font-bold flex items-center justify-center
               active:scale-90 transition-transform disabled:opacity-30`

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-btn px-2 py-2.5 min-w-0">
      <p className="text-center text-[10px] tracking-widest text-dark-300 mb-1.5">{label}</p>
      <div className="flex items-center gap-1">
        <button className={btn} disabled={value <= min}
          onClick={() => onChange(clamp(next ? next(value, -1) : value - step))}>−</button>
        <input
          value={draft ?? String(value)}
          inputMode={decimal ? 'decimal' : 'numeric'}
          aria-label={label}
          onFocus={e => { setDraft(String(value)); e.currentTarget.select() }}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          // 17px, not smaller: iOS zooms the page into any input under 16px
          className="flex-1 min-w-0 w-full bg-transparent text-center text-[17px] font-extrabold
                     tabular-nums outline-none focus:text-brand-teal"
        />
        <button className={btn} disabled={value >= max}
          onClick={() => onChange(clamp(next ? next(value, 1) : value + step))}>+</button>
      </div>
    </div>
  )
}

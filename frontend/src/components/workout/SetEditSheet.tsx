import { useState } from 'react'
import { INPUT_BASE } from '../forms/Fields'
import { workoutService } from '../../services/workout.service'

/**
 * Correct a single logged set.
 *
 * The narrow fix for what actually goes wrong: a weight typed with an extra
 * zero, or reps counted wrong. Deleting the whole session to fix one number
 * throws away everything else that was right about it.
 *
 * The warning is not decoration. A recorded set is not just a row in a list —
 * fatigue, readiness, training load and every future weight suggestion are
 * computed from it, so the server re-scores the session and rebuilds the
 * athlete's fatigue on save. Saying so is the difference between "the number
 * changed" and "the app now believes something different about my recovery".
 *
 * Fields are strings, not numbers, for the reason `forms/Fields.tsx` gives:
 * `Number('')` is 0, which stamps a stray zero into a field somebody cleared.
 */

/** z-60, not z-50: BottomNav is fixed at z-50 and paints over anything equal. */
const SHEET_Z = 'z-[60]'

interface Props {
  set: any
  exerciseName: string
  onSaved: () => void
  onClose: () => void
}

export default function SetEditSheet({ set, exerciseName, onSaved, onClose }: Props) {
  const strength = set.strength
  const calisthenics = set.calisthenics
  const cardio = set.cardio

  const [reps, setReps] = useState(
    String(strength?.reps ?? calisthenics?.reps ?? '')
  )
  const [weight, setWeight] = useState(
    String(strength?.weight ?? calisthenics?.addedWeight ?? '')
  )
  const [distance, setDistance] = useState(String(cardio?.distance ?? ''))
  const [time, setTime] = useState(String(cardio?.time ?? ''))
  const [rpe, setRpe] = useState(String(set.rpe ?? ''))

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only send what was actually filled in. An empty string means "leave it",
  // not "set it to zero".
  const num = (raw: string): number | undefined => {
    const trimmed = raw.trim()
    if (trimmed === '') return undefined
    const value = Number(trimmed)
    return Number.isFinite(value) ? value : undefined
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await workoutService.updateSet(set.id, {
        ...(strength ? { reps: num(reps), weight: num(weight) } : {}),
        ...(calisthenics ? { reps: num(reps), addedWeight: num(weight) } : {}),
        ...(cardio ? { distance: num(distance), time: num(time) } : {}),
        rpe: num(rpe) ?? null,
      })
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not save that change.')
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await workoutService.deleteSet(set.id)
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not remove that set.')
      setBusy(false)
    }
  }

  return (
    <div className={`fixed inset-0 ${SHEET_Z} flex items-end`}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="relative w-full max-w-[430px] mx-auto bg-dark-800 border-t border-dark-600
                      rounded-t-card p-5 pb-[calc(1.25rem+var(--safe-bottom))]">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-white text-lg font-bold">Set {set.setNumber}</h2>
          <span className="text-dark-400 text-xs truncate ml-3">{exerciseName}</span>
        </div>
        <p className="text-dark-400 text-xs mb-4">
          Changing a recorded set re-scores the workout and rebuilds your
          fatigue and readiness.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {(strength || calisthenics) && (
            <>
              <label className="block">
                <span className="text-dark-300 text-xs">Reps</span>
                <input
                  value={reps}
                  onChange={e => setReps(e.target.value)}
                  inputMode="numeric"
                  className={`${INPUT_BASE} mt-1`}
                />
              </label>
              <label className="block">
                <span className="text-dark-300 text-xs">
                  {calisthenics ? 'Added weight (kg)' : 'Weight (kg)'}
                </span>
                <input
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  inputMode="decimal"
                  className={`${INPUT_BASE} mt-1`}
                />
              </label>
            </>
          )}

          {cardio && (
            <>
              <label className="block">
                <span className="text-dark-300 text-xs">Distance (km)</span>
                <input
                  value={distance}
                  onChange={e => setDistance(e.target.value)}
                  inputMode="decimal"
                  className={`${INPUT_BASE} mt-1`}
                />
              </label>
              <label className="block">
                <span className="text-dark-300 text-xs">Time (seconds)</span>
                <input
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  inputMode="numeric"
                  className={`${INPUT_BASE} mt-1`}
                />
              </label>
            </>
          )}

          <label className="block">
            <span className="text-dark-300 text-xs">RPE</span>
            <input
              value={rpe}
              onChange={e => setRpe(e.target.value)}
              inputMode="decimal"
              placeholder="1–10"
              className={`${INPUT_BASE} mt-1`}
            />
          </label>
        </div>

        {error && <p className="text-brand-red text-xs mt-3">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button
            onClick={remove}
            disabled={busy}
            className="px-4 py-3 rounded-btn border border-brand-red/50 text-brand-red
                       text-sm font-bold active:scale-95 transition-transform disabled:opacity-40"
          >
            Delete
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-3 rounded-btn bg-dark-700 border border-dark-600
                       text-dark-200 text-sm font-bold disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 py-3 rounded-btn bg-brand-teal text-black text-sm font-bold
                       active:scale-95 transition-transform disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

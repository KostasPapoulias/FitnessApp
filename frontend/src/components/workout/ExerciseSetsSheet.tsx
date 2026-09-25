import BottomSheet from '../BottomSheet'
import SwipeActions from '../SwipeActions'
import ExerciseNotes from './ExerciseNotes'
import { fmtTime } from '../../pages/Workout/helpers'
import { PencilIcon, TrashIcon } from '../icons'

/**
 * One exercise from a recorded session, in a bottom sheet: a set table, or
 * run stats for cardio, plus the exercise note. Set rows swipe left for Edit,
 * right for Delete (the mirror of Calendar's session rows).
 */

interface Props {
  exercise: any
  /** Set rows are only tappable while the session is in edit mode. */
  editable: boolean
  onPickSet: (set: any) => void
  onDeleteSet: (set: any) => void
  onOpenRun: (setId: string) => void
  /** Resolves false if the write failed. Absent → the note is read-only. */
  onSaveNotes?: (notes: string) => Promise<boolean>
  onClose: () => void
}

export default function ExerciseSetsSheet({
  exercise, editable, onPickSet, onDeleteSet, onOpenRun, onSaveNotes, onClose,
}: Props) {
  const sets = exercise.sets ?? []
  const cardioSets = sets.filter((s: any) => s.cardio)
  const isCardio = cardioSets.length > 0

  const totalVol = sets.reduce(
    (sum: number, s: any) => sum + (s.strength ? s.strength.reps * s.strength.weight : 0), 0)
  const cardioKm = cardioSets.reduce(
    (sum: number, s: any) => sum + (s.cardio?.distance ?? 0), 0)
  const cardioSec = cardioSets.reduce(
    (sum: number, s: any) => sum + (s.cardio?.time ?? 0), 0)

  const subtitle = isCardio
    ? `${cardioKm.toFixed(2)} km · ${fmtTime(cardioSec)}${
        cardioKm > 0 && cardioSec > 0 ? ` · ${fmtTime(cardioSec / cardioKm)} /km` : ''}`
    : `${sets.length} set${sets.length === 1 ? '' : 's'}${
        totalVol > 0 ? ` · ${Math.round(totalVol).toLocaleString()} kg` : ''}`

  return (
    <BottomSheet title={exercise.name} subtitle={subtitle} onClose={onClose}>

      {!isCardio && (
        <p className="text-dark-400 text-[11px] mb-3">
          {editable
            ? 'Tap a set to correct it, or swipe it. '
            : 'Swipe a set to edit or remove it. '}
          Fatigue and readiness are rebuilt from what you change.
        </p>
      )}

      {isCardio && (
        <div className="flex flex-col gap-2">
          {cardioSets.map((s: any) => {
            // Stored pace (from unrounded metres) when available
            const paceSec = s.run?.avgPaceSec
              ?? (s.cardio?.distance > 0 && s.cardio?.time > 0
                  ? s.cardio.time / s.cardio.distance
                  : 0)

            return (
              <div key={s.id}
                className="bg-dark-700/60 border border-dark-600 rounded-btn px-3.5 py-3">
                <div className="flex items-center gap-3">
                  {[
                    { v: `${(s.cardio?.distance ?? 0).toFixed(2)}`, u: 'km' },
                    { v: fmtTime(s.cardio?.time ?? 0), u: 'time' },
                    { v: fmtTime(paceSec), u: 'avg / km' },
                    ...(s.run?.elevationGainM
                      ? [{ v: `${s.run.elevationGainM}`, u: 'm climb' }]
                      : []),
                  ].map(stat => (
                    <div key={stat.u} className="flex-1 min-w-0 text-center">
                      <p className="text-white text-[15px] font-extrabold tabular-nums">
                        {stat.v}
                      </p>
                      <p className="text-dark-400 text-[9.5px] mt-0.5">{stat.u}</p>
                    </div>
                  ))}
                </div>

                {/* Route button only when a route was recorded */}
                {s.run ? (
                  <button
                    onClick={() => onOpenRun(s.id)}
                    className="w-full mt-2.5 py-2.5 rounded-btn border border-brand-teal/40
                               bg-[#0d2218] text-brand-teal text-xs font-bold
                               active:scale-[0.99] transition-transform"
                  >
                    {s.run.source === 'manual' ? 'Splits →' : 'Route & splits →'}
                  </button>
                ) : (
                  <p className="text-dark-500 text-[11px] text-center mt-2">
                    No route recorded for this one
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!isCardio && (
        <>
          <div className="grid grid-cols-4 gap-1 pb-2">
            {['Set', 'Reps', 'Weight', 'RPE'].map(h => (
              <p key={h} className="text-dark-500 text-xs uppercase text-center">{h}</p>
            ))}
          </div>

          {sets.map((s: any, si: number) => (
            <div key={s.id ?? si} className="mb-1">
            <SwipeActions
              compact
              left={{
                label: 'Delete', icon: <TrashIcon className="w-4 h-4" />, tone: 'danger',
                onSelect: () => onDeleteSet(s),
              }}
              right={{
                label: 'Edit', icon: <PencilIcon className="w-4 h-4" />,
                onSelect: () => onPickSet(s),
              }}
            >
            <div
              onClick={() => { if (editable) onPickSet(s) }}
              className={`grid grid-cols-4 gap-1 ${
                editable ? 'cursor-pointer ring-1 ring-brand-teal/30 rounded-lg' : ''
              }`}>
              <div className="bg-dark-700 rounded-lg py-2 text-center">
                <span className="text-dark-300 text-xs font-semibold">{s.setNumber}</span>
              </div>
              <div className="bg-dark-700 rounded-lg py-2 text-center">
                <span className="text-white text-xs">
                  {s.strength?.reps ?? s.calisthenics?.reps ?? '—'}
                </span>
              </div>
              <div className="bg-dark-700 rounded-lg py-2 text-center">
                <span className="text-white text-xs">
                  {s.strength?.weight
                    ? `${s.strength.weight}kg`
                    : s.cardio?.distance
                    ? `${s.cardio.distance}km`
                    : '—'}
                </span>
              </div>
              <div className="bg-dark-700 rounded-lg py-2 text-center">
                <span className="text-xs font-semibold"
                  style={{
                    color: s.rpe >= 9 ? '#EF4444' : s.rpe >= 7 ? '#FACC15' : '#4ADE80',
                  }}>
                  {s.rpe ?? '—'}
                </span>
              </div>
            </div>
            </SwipeActions>
            </div>
          ))}

          {totalVol > 0 && (
            <div className="mt-3 flex justify-between bg-[#0d2218] rounded-lg px-3 py-2
                            border border-brand-teal/20">
              <span className="text-dark-400 text-xs">Total volume</span>
              <span className="text-brand-teal text-xs font-bold">
                {Math.round(totalVol).toLocaleString()} kg
              </span>
            </div>
          )}
        </>
      )}

      {/* The note, below the sets; editable any time since notes are not a fatigue input */}
      {onSaveNotes && exercise.workoutExerciseId ? (
        <ExerciseNotes
          key={exercise.workoutExerciseId}
          value={exercise.notes ?? ''}
          onSave={onSaveNotes}
        />
      ) : exercise.notes ? (
        <p className="mt-3 text-dark-200 text-[13px] leading-5 whitespace-pre-wrap break-words">
          {exercise.notes}
        </p>
      ) : null}
    </BottomSheet>
  )
}

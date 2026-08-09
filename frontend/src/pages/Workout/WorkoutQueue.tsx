import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { rpeColor, exerciseEmoji, cycleRpe } from './helpers'

const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  done:     { label: 'Done',        color: '#4ADE80', dot: '#4ADE80' },
  current:  { label: 'In progress', color: '#00D4AA', dot: '#00D4AA' },
  upcoming: { label: 'Up next',     color: '#888888', dot: '#333333' },
  skipped:  { label: 'Skipped',     color: '#555555', dot: '#333333' },
}

function MiniStep({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-7 h-7 flex-shrink-0 rounded-[9px] border border-dark-600 bg-dark-700
                 text-white text-lg font-bold flex items-center justify-center
                 active:scale-90 transition-transform">
      {children}
    </button>
  )
}

export default function WorkoutQueue() {
  const navigate = useNavigate()
  const {
    selectedExercises, currentExerciseIndex, completedSets,
    reorderExercises, updateSet, addSet, removeSet,
    removeExerciseAt, toggleSkip, setCurrent, sessionId,
  } = useWorkoutStore()

  const [expandIdx, setExpandIdx] = useState<number | null>(null)
  const dragIdx = useRef<number | null>(null)

  const backToActive = () =>
    navigate(sessionId ? '/workout/active' : '/workout/plan')

  const exStatus = (e: typeof selectedExercises[number], i: number) => {
    const doneCount = completedSets.filter(cs => cs.exerciseId === e.exercise.id).length
    if (e.skipped) return 'skipped'
    if (e.sets.length > 0 && doneCount >= e.sets.length) return 'done'
    if (i === currentExerciseIndex) return 'current'
    return 'upcoming'
  }

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-5 pt-4 pb-24">

      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-dark-600">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight">Exercises</h1>
          <p className="text-dark-300 text-[12.5px] mt-0.5">Drag to reorder · edit live</p>
        </div>
        <button onClick={backToActive}
          className="px-4 py-2.5 rounded-[10px] bg-brand-teal text-black text-sm font-bold
                     active:scale-95 transition-transform">
          Done
        </button>
      </div>

      <div className="flex flex-col gap-3 mt-4">
        {selectedExercises.map((e, i) => {
          const status = exStatus(e, i)
          const meta = STATUS_META[status]
          const doneCount = completedSets.filter(cs => cs.exerciseId === e.exercise.id).length
          const ws = e.sets.map(s => s.weight)
          const lo = ws.length ? Math.min(...ws) : 0
          const hi = ws.length ? Math.max(...ws) : 0
          const rest = e.sets[0]?.restSeconds ?? 90
          const expanded = expandIdx === i

          return (
            <div key={e.exercise.id}
              draggable
              onDragStart={() => { dragIdx.current = i }}
              onDragEnter={() => {
                const from = dragIdx.current
                if (from != null && from !== i) { reorderExercises(from, i); dragIdx.current = i }
              }}
              onDragOver={ev => ev.preventDefault()}
              onDragEnd={() => { dragIdx.current = null }}
              className="rounded-card overflow-hidden border"
              style={{
                background: '#1A1A1A',
                borderColor: status === 'current' ? '#00D4AA' : '#2A2A2A',
                opacity: status === 'skipped' ? 0.55 : 1,
              }}>

              {/* Row */}
              <div className="flex items-center gap-2.5 p-3.5">
                <span className="text-dark-400 cursor-grab flex-shrink-0 leading-none">⋮⋮</span>
                <div className="w-10 h-10 rounded-[10px] bg-dark-700 flex items-center
                                justify-center text-xl flex-shrink-0">
                  {exerciseEmoji(e.exercise)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15.5px] font-bold leading-tight truncate"
                    style={{ textDecoration: status === 'skipped' ? 'line-through' : 'none' }}>
                    {e.exercise.name}
                  </p>
                  <p className="text-xs text-dark-300 mt-0.5 truncate">
                    {e.sets.length} sets · {lo === hi ? lo : `${lo}–${hi}`}kg · rest {rest}s
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: meta.dot }} />
                    <span className="text-[11px] font-bold" style={{ color: meta.color }}>{meta.label}</span>
                  </div>
                  <span className="text-[11px] text-dark-400">{doneCount}/{e.sets.length}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex gap-1.5 px-3.5 pb-3 items-center">
                <button onClick={() => reorderExercises(i, i - 1)} disabled={i === 0}
                  className="w-[30px] h-[30px] rounded-badge border border-dark-600 bg-dark-700
                             flex items-center justify-center disabled:opacity-30
                             active:scale-90 transition-transform">↑</button>
                <button onClick={() => reorderExercises(i, i + 1)} disabled={i === selectedExercises.length - 1}
                  className="w-[30px] h-[30px] rounded-badge border border-dark-600 bg-dark-700
                             flex items-center justify-center disabled:opacity-30
                             active:scale-90 transition-transform">↓</button>
                <div className="flex-1" />
                <button onClick={() => { setCurrent(i, 0); navigate('/workout/active') }}
                  disabled={!sessionId}
                  className="px-3 py-1.5 rounded-badge border border-brand-teal bg-brand-teal/10
                             text-brand-teal text-xs font-bold active:scale-95 transition-transform
                             disabled:opacity-40">▶ Go</button>
                <button onClick={() => setExpandIdx(expanded ? null : i)}
                  className="px-3 py-1.5 rounded-badge border border-dark-600 bg-dark-700
                             text-white text-xs font-semibold active:scale-95 transition-transform">
                  {expanded ? 'Close' : 'Edit sets'}
                </button>
              </div>

              {/* Expanded editor */}
              {expanded && (
                <div className="mx-2.5 mb-3.5 p-2.5 rounded-btn bg-dark-900 border border-dark-600">
                  <div className="grid grid-cols-[16px_minmax(0,1fr)_minmax(0,1fr)_28px_20px] gap-1 pb-1.5">
                    <div />
                    <p className="text-[9px] tracking-wide text-dark-400 text-center">REPS</p>
                    <p className="text-[9px] tracking-wide text-dark-400 text-center">WEIGHT</p>
                    <p className="text-[9px] tracking-wide text-dark-400 text-center">RPE</p>
                    <div />
                  </div>
                  {e.sets.map((s, si) => {
                    const done = completedSets.some(cs => cs.exerciseId === e.exercise.id && cs.setIndex === si)
                    return (
                      <div key={si}
                        className="grid grid-cols-[16px_minmax(0,1fr)_minmax(0,1fr)_28px_20px] gap-1 py-1.5 items-center"
                        style={{ opacity: done ? 0.5 : 1 }}>
                        <div className="text-xs font-bold text-dark-300 text-center">{si + 1}</div>
                        <div className="flex items-center justify-center gap-0.5">
                          <MiniStep onClick={() => updateSet(i, si, { reps: Math.max(1, s.reps - 1) })}>−</MiniStep>
                          <span className="flex-1 min-w-0 truncate text-center text-[13px] font-bold tabular-nums">{s.reps}</span>
                          <MiniStep onClick={() => updateSet(i, si, { reps: s.reps + 1 })}>+</MiniStep>
                        </div>
                        <div className="flex items-center justify-center gap-0.5">
                          <MiniStep onClick={() => updateSet(i, si, { weight: Math.max(0, Math.round((s.weight - 2.5) * 10) / 10) })}>−</MiniStep>
                          <span className="flex-1 min-w-0 truncate text-center text-[13px] font-bold tabular-nums">{s.weight}</span>
                          <MiniStep onClick={() => updateSet(i, si, { weight: Math.round((s.weight + 2.5) * 10) / 10 })}>+</MiniStep>
                        </div>
                        <button onClick={() => updateSet(i, si, { rpe: cycleRpe(s.rpe) })}
                          className="text-sm font-extrabold" style={{ color: rpeColor(s.rpe) }}>
                          {s.rpe}
                        </button>
                        <button onClick={() => removeSet(i, si)}
                          className="w-5 h-6 rounded-[7px] text-dark-400 text-[15px]
                                     flex items-center justify-center">×</button>
                      </div>
                    )
                  })}
                  <button onClick={() => addSet(i)}
                    className="w-full mt-2 py-2 rounded-[10px] border border-dashed border-dark-500
                               text-dark-300 text-xs font-semibold active:scale-95 transition-transform">
                    + Add Set
                  </button>
                  <div className="flex gap-2 mt-2.5">
                    <button onClick={() => navigate('/workout/browse')}
                      className="flex-1 py-2 rounded-[10px] border border-dark-600 bg-dark-700
                                 text-white text-xs font-semibold active:scale-95 transition-transform">
                      ⇆ Swap
                    </button>
                    <button onClick={() => toggleSkip(i)}
                      className="flex-1 py-2 rounded-[10px] border border-dark-600 bg-dark-700
                                 text-dark-200 text-xs font-semibold active:scale-95 transition-transform">
                      {e.skipped ? 'Unskip' : 'Skip'}
                    </button>
                    <button onClick={() => { removeExerciseAt(i); setExpandIdx(null) }}
                      className="flex-1 py-2 rounded-[10px] border border-brand-red/40 bg-[#2a1a1a]
                                 text-brand-red text-xs font-bold active:scale-95 transition-transform">
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        <button onClick={() => navigate('/workout/browse')}
          className="w-full py-4 rounded-card border border-dashed border-dark-500
                     bg-dark-800 text-dark-200 text-sm font-bold
                     active:scale-95 transition-transform">
          + Add Exercise
        </button>
      </div>
    </div>
  )
}

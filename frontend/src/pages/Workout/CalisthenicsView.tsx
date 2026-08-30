import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { rpeColor, rpeWord, exerciseEmoji, fmtTime } from './helpers'
import {
  ModalityViewProps, LiveHeader, SegmentBar, RpeRow, UpNext,
} from './LiveShared'

// Heuristic: does this movement read as an isometric hold?
function isHold(name: string) {
  return /hold|plank|l-?sit|lever|flag|hang|wall sit|bridge/i.test(name)
}

/**
 * How a calisthenics set is loaded, as one signed number.
 *
 * Assistance and added weight are the same axis, not two settings. This screen
 * used to carry both: a three-way Assisted/Bodyweight/Weighted picker that was
 * read nowhere, and a separate ± stepper. They could disagree — "Weighted" with
 * −20 kg on the band was reachable — and neither survived the screen, because
 * both lived in a component ref rather than on the set.
 *
 * Now the number IS `set.weight` and the label is derived from its sign, so the
 * two cannot contradict each other and the value is the same one the planner,
 * the queue and the rest timer edit.
 */
const loadMode = (load: number) => load < 0 ? 0 : load > 0 ? 2 : 1
const MODES = ['Assisted', 'Bodyweight', 'Weighted']

/** Text for a signed load, in the athlete's terms rather than a signed number. */
const loadLabel = (load: number) =>
  load > 0 ? `+${load} kg` : load < 0 ? `${Math.abs(load)} kg assist` : 'Bodyweight'

const loadColor = (load: number) =>
  load > 0 ? '#F97316' : load < 0 ? '#4ADE80' : '#FFFFFF'

const stepBtn =
  'w-[30px] h-[30px] rounded-[9px] border border-dark-600 bg-dark-700 text-white ' +
  'text-lg font-bold flex items-center justify-center active:scale-90 transition-transform flex-shrink-0'
const bigStep =
  'w-12 h-12 rounded-btn border border-dark-600 bg-dark-700 text-white text-2xl font-bold ' +
  'flex items-center justify-center active:scale-90 transition-transform flex-shrink-0'

/** The signed-load stepper. Shared by the rep and hold branches — a band-assisted
 *  front lever and a weighted plank are both ordinary. */
function LoadBox({ load, onChange }: { load: number; onChange: (next: number) => void }) {
  const step = (delta: number) => onChange(Math.round((load + delta) * 10) / 10)
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-btn px-2 py-3 text-center">
      <p className="text-[10px] tracking-wide text-dark-400 mb-1.5">LOAD / ASSIST</p>
      {/* The value sits above the buttons rather than between them:
          "Bodyweight" needs ~74px, which no half-width column has left
          once two 30px steppers are in the same row. */}
      <p className="text-sm font-extrabold truncate mb-2" style={{ color: loadColor(load) }}>
        {loadLabel(load)}
      </p>
      <div className="flex items-center justify-center gap-3">
        <button className={stepBtn} onClick={() => step(-2.5)}>−</button>
        <button className={stepBtn} onClick={() => step(2.5)}>+</button>
      </div>
    </div>
  )
}

export default function CalisthenicsView({ elapsed, onRest, onFinish }: ModalityViewProps) {
  const navigate = useNavigate()
  const { selectedExercises, currentExerciseIndex, currentSetIndex, completedSets, updateSet, setCurrent } =
    useWorkoutStore()

  const ex = selectedExercises[currentExerciseIndex]
  const set = ex?.sets[currentSetIndex]

  // hold timer
  const [holdSec, setHoldSec] = useState(0)
  const [holdRunning, setHoldRunning] = useState(false)
  const runningRef = useRef(false)
  useEffect(() => { runningRef.current = holdRunning }, [holdRunning])
  useEffect(() => {
    const id = setInterval(() => { if (runningRef.current) setHoldSec(s => s + 1) }, 1000)
    return () => clearInterval(id)
  }, [])
  // reset hold when the set/exercise changes
  useEffect(() => { setHoldSec(0); setHoldRunning(false) }, [currentExerciseIndex, currentSetIndex])

  if (!ex || !set) return null

  const hold = isHold(ex.exercise.name)
  const muscle = ex.exercise.muscles.map(m => m.name).join(' · ')
  const isDone = (i: number) =>
    completedSets.some(cs => cs.exerciseId === ex.exercise.id && cs.setIndex === i)

  const load = set.weight
  const mode = loadMode(load)
  const setLoad = (next: number) => updateSet(currentExerciseIndex, currentSetIndex, { weight: next })

  // Picking a mode moves the load across zero, keeping whatever magnitude was
  // already dialled in. Starting from bodyweight it opens at one plate-ish step
  // so the chip does something visible rather than selecting a silent zero.
  const pickMode = (m: number) => {
    const mag = Math.abs(load) || 5
    setLoad(m === 0 ? -mag : m === 2 ? mag : 0)
  }

  // up next
  let un: { t: string; d: string }
  if (currentSetIndex + 1 < ex.sets.length) {
    const nextSet = ex.sets[currentSetIndex + 1]
    un = {
      t: `Set ${currentSetIndex + 2}`,
      d: hold
        ? `Hold · target ${nextSet.reps}s · ${loadLabel(nextSet.weight)}`
        : `${nextSet.reps} reps · ${loadLabel(nextSet.weight)}`,
    }
  } else if (currentExerciseIndex + 1 < selectedExercises.length) {
    const nx = selectedExercises[currentExerciseIndex + 1]
    un = { t: nx.exercise.name, d: `Next · ${nx.sets.length} sets` }
  } else {
    un = { t: 'Last set', d: 'Own the full range of motion' }
  }

  const restSeconds = set.restSeconds ?? 90
  // The load goes out signed. `completeSet` maps it to `addedWeight`, which the
  // backend schema allows below zero precisely so assistance can be recorded —
  // this used to clamp at zero and throw every band and machine away.
  const logReps = () => onRest({ reps: set.reps, weight: load, rpe: set.rpe, restSeconds })
  // A hold has no reps — send seconds under tension as `duration` so it isn't
  // recorded (and scored for volume) as if it were that many repetitions.
  const logHold = () => {
    if (holdSec <= 0) return
    onRest({ reps: 0, duration: holdSec, weight: load, rpe: set.rpe, restSeconds })
  }

  return (
    <div className="flex-1 bg-dark-900 text-white px-5 pt-4 pb-4">
      <LiveHeader label="LIVE · CALISTHENICS" time={fmtTime(elapsed)}
        counter={`${currentExerciseIndex + 1}/${selectedExercises.length}`} />

      {/* name + queue */}
      <div className="flex items-center justify-between gap-3 mt-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl">{exerciseEmoji(ex.exercise)}</span>
          <div className="min-w-0">
            <div className="text-[22px] font-extrabold leading-tight truncate">{ex.exercise.name}</div>
            <div className="text-[12.5px] text-dark-300 mt-0.5 truncate">{muscle}</div>
          </div>
        </div>
        {/* The same queue the strength screen opens: reorder, add an exercise,
            add or drop sets, skip. It was reachable from strength only. */}
        <button
          onClick={() => navigate('/workout/queue')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border border-dark-600
                     bg-dark-800 text-white text-[13px] font-semibold flex-shrink-0
                     active:scale-95 transition-transform"
        >
          ☰ All
        </button>
      </div>

      {/* progression — a real control now, and always agreeing with the load */}
      <div className="mt-3.5">
        <p className="text-[10px] tracking-widest text-dark-400 mb-2">PROGRESSION</p>
        <div className="flex gap-1.5 overflow-x-auto">
          {MODES.map((l, i) => {
            const on = i === mode
            return (
              <button key={l} onClick={() => pickMode(i)}
                className="whitespace-nowrap flex-shrink-0 text-[12.5px] font-bold px-3.5 py-2 rounded-full border"
                style={{
                  borderColor: on ? '#00D4AA' : '#2A2A2A',
                  background: on ? 'rgba(0,212,170,0.14)' : '#1A1A1A',
                  color: on ? '#00D4AA' : '#AAAAAA',
                }}>{l}</button>
            )
          })}
        </div>
      </div>

      <SegmentBar count={ex.sets.length} current={currentSetIndex} isDone={isDone}
        onGo={i => setCurrent(currentExerciseIndex, i)} />

      {/* card */}
      <div className="mt-4 rounded-card border border-brand-teal/30 overflow-hidden" style={{ background: '#0a2a22' }}>
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: 'rgba(0,212,170,0.08)' }}>
          <div className="w-[34px] h-[34px] rounded-[9px] bg-brand-teal text-black
                          flex items-center justify-center text-base font-extrabold">{currentSetIndex + 1}</div>
          <div className="flex-1 text-base font-bold">Set {currentSetIndex + 1} of {ex.sets.length}</div>
          <div className="text-xs text-dark-300">{hold ? `Target ${set.reps}s` : `Target ${set.reps} reps`}</div>
        </div>

        {hold ? (
          <>
            {/* HOLD */}
            <div className="px-4 pt-6 pb-2 text-center">
              <p className="text-[10px] tracking-widest text-dark-300 mb-1.5">HOLD TIME</p>
              <div className="text-[66px] font-extrabold leading-none"
                style={{ color: holdRunning ? '#00D4AA' : '#FFFFFF' }}>{fmtTime(holdSec)}</div>
              <p className="text-[13px] text-dark-300 mt-1.5">
                {holdRunning ? 'Timer running — stay tight' : holdSec > 0 ? 'Paused' : 'Press Start when you break the floor'}
              </p>
            </div>
            <div className="px-4 pt-3 pb-1">
              <LoadBox load={load} onChange={setLoad} />
            </div>
            <div className="px-4 pt-3.5 pb-1.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] tracking-wide text-dark-300">RPE · EFFORT</span>
                <span className="text-[13px] font-bold" style={{ color: rpeColor(set.rpe) }}>{set.rpe} — {rpeWord(set.rpe)}</span>
              </div>
              <RpeRow value={set.rpe} onPick={n => updateSet(currentExerciseIndex, currentSetIndex, { rpe: n })} />
            </div>
            <div className="px-4 pt-3 pb-4 grid grid-cols-[1fr_1.3fr] gap-2.5">
              <button onClick={() => setHoldRunning(r => !r)}
                className="py-4 rounded-btn border text-base font-bold active:scale-95 transition-transform"
                style={{
                  borderColor: holdRunning ? 'rgba(239,68,68,0.4)' : '#2A2A2A',
                  background: holdRunning ? '#2a1a1a' : '#1E1E1E',
                  color: holdRunning ? '#EF4444' : '#FFFFFF',
                }}>
                {holdRunning ? '‖ Stop' : holdSec > 0 ? '▶ Resume' : '▶ Start'}
              </button>
              <button onClick={logHold} disabled={holdSec <= 0}
                className="py-4 rounded-btn bg-brand-teal text-black text-base font-extrabold
                           active:scale-95 transition-transform disabled:opacity-40">
                ✓ Log Hold
              </button>
            </div>
          </>
        ) : (
          <>
            {/* REPS */}
            <div className="px-4 pt-4 pb-1.5 text-center">
              <p className="text-[10px] tracking-widest text-dark-300 mb-3">REPS THIS SET</p>
              <div className="flex items-center justify-center gap-4">
                <button className={bigStep} onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { reps: Math.max(0, set.reps - 1) })}>−</button>
                <span className="flex-1 min-w-0 text-center text-[58px] font-extrabold leading-none tabular-nums">{set.reps}</span>
                <button className={bigStep} onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { reps: set.reps + 1 })}>+</button>
              </div>
            </div>
            <div className="px-4 pt-2 pb-1">
              <LoadBox load={load} onChange={setLoad} />
            </div>
            <div className="px-4 pt-3 pb-1.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] tracking-wide text-dark-300">RPE · EFFORT</span>
                <span className="text-[13px] font-bold" style={{ color: rpeColor(set.rpe) }}>{set.rpe} — {rpeWord(set.rpe)}</span>
              </div>
              <RpeRow value={set.rpe} onPick={n => updateSet(currentExerciseIndex, currentSetIndex, { rpe: n })} />
            </div>
            <div className="px-4 pt-3 pb-4">
              <button onClick={logReps}
                className="w-full py-[17px] rounded-btn bg-brand-teal text-black text-[17px] font-extrabold active:scale-95 transition-transform">
                ✓ Set Done — Log Set
              </button>
            </div>
          </>
        )}
      </div>

      <UpNext title={un.t} detail={un.d} />

      <button onClick={onFinish}
        className="w-full mt-3 py-3.5 rounded-btn border border-brand-red/40 bg-[#2a1a1a]
                   text-brand-red text-sm font-bold active:scale-95 transition-transform">
        ■ End Workout
      </button>
    </div>
  )
}

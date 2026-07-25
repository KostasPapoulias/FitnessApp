import { useEffect, useRef, useState } from 'react'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { rpeColor, rpeWord, exerciseEmoji, fmtTime } from './helpers'
import {
  ModalityViewProps, LiveHeader, SegmentBar, RpeRow, CoachTip, UpNext,
} from './LiveShared'

const TEMPOS = ['2-0-1', '3-1-1', '2-1-2', '1-0-X', 'Slow neg']
const LEVELS = ['Assisted', 'Bodyweight', 'Weighted']

// Heuristic: does this movement read as an isometric hold?
function isHold(name: string) {
  return /hold|plank|l-?sit|lever|flag|hang|wall sit|bridge/i.test(name)
}

const stepBtn =
  'w-[34px] h-[34px] rounded-[9px] border border-dark-600 bg-dark-700 text-white ' +
  'text-lg font-bold flex items-center justify-center active:scale-90 transition-transform flex-shrink-0'
const bigStep =
  'w-12 h-12 rounded-btn border border-dark-600 bg-dark-700 text-white text-2xl font-bold ' +
  'flex items-center justify-center active:scale-90 transition-transform flex-shrink-0'

// per-exercise extras the backend model doesn't hold (live-only)
interface Extra { level: number; tempo: string; load: number }

export default function CalisthenicsView({ elapsed, onRest, onFinish, coachEnabled }: ModalityViewProps) {
  const { selectedExercises, currentExerciseIndex, currentSetIndex, completedSets, updateSet, setCurrent } =
    useWorkoutStore()

  const ex = selectedExercises[currentExerciseIndex]
  const set = ex?.sets[currentSetIndex]

  // live-only metadata, keyed by exercise id
  const extrasRef = useRef<Record<string, Extra>>({})
  const [, force] = useState(0)
  const rerender = () => force(n => n + 1)
  if (ex && !extrasRef.current[ex.exercise.id]) {
    extrasRef.current[ex.exercise.id] = { level: 1, tempo: '2-0-1', load: 0 }
  }
  const extra = ex ? extrasRef.current[ex.exercise.id] : { level: 1, tempo: '2-0-1', load: 0 }

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
  const levels = LEVELS
  const isDone = (i: number) =>
    completedSets.some(cs => cs.exerciseId === ex.exercise.id && cs.setIndex === i)

  const loadLabel = extra.load > 0 ? `+${extra.load} kg` : extra.load < 0 ? `${Math.abs(extra.load)} assist` : 'Bodyweight'
  const loadColor = extra.load > 0 ? '#F97316' : extra.load < 0 ? '#4ADE80' : '#FFFFFF'

  // up next
  let un: { t: string; d: string }
  if (currentSetIndex + 1 < ex.sets.length) {
    un = { t: `Set ${currentSetIndex + 2}`, d: hold ? `Hold · target ${set.reps}s` : `${ex.sets[currentSetIndex + 1].reps} reps · ${levels[extra.level]}` }
  } else if (currentExerciseIndex + 1 < selectedExercises.length) {
    const nx = selectedExercises[currentExerciseIndex + 1]
    un = { t: nx.exercise.name, d: `Next · ${nx.sets.length} sets` }
  } else {
    un = { t: 'Last set', d: 'Own the full range of motion' }
  }

  const coachTip = hold
    ? `Beat your last ${set.reps}s hold at the ${levels[extra.level]} level. Clear it clean twice, then progress the variation.`
    : extra.level === 0
    ? 'You’re on an assisted variation. Reduce the assistance a notch once you can clear all sets at RPE 8.'
    : 'Strong bodyweight work. Add a little load next session before adding reps to keep building strength.'

  const restSeconds = set.restSeconds ?? 90
  const logReps = () => onRest({ reps: set.reps, weight: Math.max(0, extra.load), rpe: set.rpe, restSeconds })
  // A hold has no reps — send seconds under tension as `duration` so it isn't
  // recorded (and scored for volume) as if it were that many repetitions.
  const logHold = () => {
    if (holdSec <= 0) return
    onRest({ reps: 0, duration: holdSec, weight: Math.max(0, extra.load), rpe: set.rpe, restSeconds })
  }

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-5 pt-4 pb-4">
      <LiveHeader label="LIVE · CALISTHENICS" time={fmtTime(elapsed)}
        counter={`${currentExerciseIndex + 1}/${selectedExercises.length}`} />

      {/* name */}
      <div className="flex items-center gap-2.5 mt-4">
        <span className="text-2xl">{exerciseEmoji(ex.exercise)}</span>
        <div className="min-w-0">
          <div className="text-[22px] font-extrabold leading-tight truncate">{ex.exercise.name}</div>
          <div className="text-[12.5px] text-dark-300 mt-0.5 truncate">{muscle}</div>
        </div>
      </div>

      {/* progression */}
      <div className="mt-3.5">
        <p className="text-[10px] tracking-widest text-dark-400 mb-2">PROGRESSION</p>
        <div className="flex gap-1.5 overflow-x-auto">
          {levels.map((l, i) => {
            const on = i === extra.level
            return (
              <button key={l} onClick={() => { extra.level = i; rerender() }}
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
          <div className="text-xs text-dark-300">{hold ? `Target ${set.reps}s` : `Tempo ${extra.tempo}`}</div>
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
              <div className="flex items-center justify-center gap-5">
                <button className={bigStep} onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { reps: Math.max(0, set.reps - 1) })}>−</button>
                <span className="min-w-[84px] text-center text-[58px] font-extrabold leading-none">{set.reps}</span>
                <button className={bigStep} onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { reps: set.reps + 1 })}>+</button>
              </div>
            </div>
            <div className="px-4 pt-2 pb-1 grid grid-cols-2 gap-3">
              <div className="bg-dark-800 border border-dark-600 rounded-btn px-2 py-3 text-center">
                <p className="text-[10px] tracking-wide text-dark-400 mb-2">LOAD / ASSIST</p>
                <div className="flex items-center justify-center gap-2">
                  <button className={stepBtn} onClick={() => { extra.load = Math.round((extra.load - 2.5) * 10) / 10; rerender() }}>−</button>
                  <span className="min-w-[74px] text-center text-sm font-extrabold" style={{ color: loadColor }}>{loadLabel}</span>
                  <button className={stepBtn} onClick={() => { extra.load = Math.round((extra.load + 2.5) * 10) / 10; rerender() }}>+</button>
                </div>
              </div>
              <div className="bg-dark-800 border border-dark-600 rounded-btn px-2 py-3 text-center">
                <p className="text-[10px] tracking-wide text-dark-400 mb-2">TEMPO</p>
                <button onClick={() => { extra.tempo = TEMPOS[(TEMPOS.indexOf(extra.tempo) + 1) % TEMPOS.length]; rerender() }}
                  className="bg-dark-700 border border-dark-600 rounded-[9px] text-base font-extrabold px-3.5 py-2 active:scale-90 transition-transform">
                  {extra.tempo}
                </button>
              </div>
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

      {coachEnabled !== false && <CoachTip text={coachTip} />}
      <UpNext title={un.t} detail={un.d} />

      <button onClick={onFinish}
        className="w-full mt-3 py-3.5 rounded-btn border border-brand-red/40 bg-[#2a1a1a]
                   text-brand-red text-sm font-bold active:scale-95 transition-transform">
        ■ End Workout
      </button>
    </div>
  )
}

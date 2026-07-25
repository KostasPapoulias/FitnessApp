import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { useNotifications } from '../../hooks/useNotifcations'
import RestTimer from './RestTimer'
import CalisthenicsView from './CalisthenicsView'
import MobilityView from './MobilityView'
import CardioView from './CardioView'
import WodView from './WodView'
import type { LogPayload } from './LiveShared'
import {
  rpeColor, rpeTint, rpeLabel, exerciseEmoji, fmtTime, RpeMode,
} from './helpers'

export default function ActiveWorkout() {
  const navigate = useNavigate()
  const {
    selectedExercises, sessionId, sessionStartTime,
    currentExerciseIndex, currentSetIndex, completedSets,
    startSession, completeSet, updateSet, setCurrent,
    startError, logError, clearErrors,
  } = useWorkoutStore()

  // The finish request, fatigue refresh and reminder reschedule all live on the
  // Finish screen now — see handleFinish below.
  const { notifyRestComplete } = useNotifications()

  const [isStarting, setIsStarting] = useState(false)
  const [showRest, setShowRest] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [rpeMode, setRpeMode] = useState<RpeMode>('standard')
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishingRef = useRef(false)

  const currentExercise = selectedExercises[currentExerciseIndex]
  const currentSetPlan = currentExercise?.sets[currentSetIndex]

  // ── start session on mount ──
  // Reads fresh store state rather than the render closure, and startSession()
  // itself de-dupes concurrent calls, so a StrictMode double-mount or a
  // remount can't create a second session.
  const beginSession = () => {
    const s = useWorkoutStore.getState()
    if (s.sessionId || s.selectedExercises.length === 0) return
    setIsStarting(true)
    startSession()
      .catch(() => { /* startError is surfaced from the store */ })
      .finally(() => setIsStarting(false))
  }

  useEffect(() => { beginSession() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── elapsed timer ──
  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (sessionStartTime) {
        setElapsed(Math.floor((Date.now() - sessionStartTime.getTime()) / 1000))
      }
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [sessionStartTime])

  const isSetDone = (exIdx: number, setIdx: number) =>
    completedSets.some(cs =>
      cs.exerciseId === selectedExercises[exIdx]?.exercise.id && cs.setIndex === setIdx)

  // Last set of the last exercise we'll actually work through (skipped ones
  // don't count) — after it there is nothing to rest for.
  const isFinalSet = (exIdx: number, setIdx: number) => {
    const ex = selectedExercises[exIdx]
    if (!ex || setIdx + 1 < ex.sets.length) return false
    let ni = exIdx + 1
    while (ni < selectedExercises.length && selectedExercises[ni].skipped) ni++
    return ni >= selectedExercises.length
  }

  // ── set / rest flow ──
  // Log a set to the backend, then show the rest timer (strength / calisthenics).
  // Only move on when the set actually persisted — advancing on a failed write
  // is what silently dropped sets while the UI reported success.
  const logAndRest = async (payload: LogPayload) => {
    // Decide before awaiting: the indices can move while the request is out
    const final = isFinalSet(currentExerciseIndex, currentSetIndex)
    if (!(await completeSet(payload))) return
    // "Set Done" on the very last set ends the workout instead of starting a
    // rest the user will never use
    if (final) handleFinish()
    else setShowRest(true)
  }
  // Log a set, then move straight to the next set/exercise, no rest (mobility)
  const logAndAdvance = async (payload: LogPayload) => {
    if (await completeSet(payload)) advance()
  }

  const handleSetDone = () => logAndRest({
    reps: currentSetPlan?.reps ?? 10,
    weight: currentSetPlan?.weight ?? 0,
    rpe: currentSetPlan?.rpe ?? 7,
    restSeconds: currentSetPlan?.restSeconds ?? 90,
  })

  const advance = () => {
    setShowRest(false)
    const ex = selectedExercises[currentExerciseIndex]
    if (!ex) return
    if (currentSetIndex + 1 < ex.sets.length) {
      setCurrent(currentExerciseIndex, currentSetIndex + 1)
      return
    }
    let ni = currentExerciseIndex + 1
    while (ni < selectedExercises.length && selectedExercises[ni].skipped) ni++
    if (ni < selectedExercises.length) {
      setCurrent(ni, 0)
      return
    }
    handleFinish()
  }

  const buildSnapshot = () => {
    // read fresh — a modality view may have just logged a set before finishing
    const { selectedExercises, completedSets } = useWorkoutStore.getState()
    const exercises = selectedExercises
      .filter(se => completedSets.some(cs => cs.exerciseId === se.exercise.id))
      .map(se => {
        const doneIdx = completedSets
          .filter(cs => cs.exerciseId === se.exercise.id)
          .map(cs => cs.setIndex)
        const doneSets = doneIdx.map(i => se.sets[i]).filter(Boolean)
        const best = doneSets.reduce(
          (a, b) => (b.weight > a.weight ? b : a), doneSets[0] ?? { weight: 0, reps: 0 })
        return {
          name: se.exercise.name,
          emoji: exerciseEmoji(se.exercise),
          count: doneSets.length,
          topWeight: best?.weight ?? 0,
          topReps: best?.reps ?? 0,
        }
      })
    const muscles = new Set<string>()
    selectedExercises.forEach(se => {
      if (completedSets.some(cs => cs.exerciseId === se.exercise.id))
        se.exercise.muscles.forEach(m => muscles.add(m.name))
    })
    return {
      exercises,
      muscles: [...muscles],
      setsLogged: completedSets.length,
      elapsed,
    }
  }

  // Ending the workout does NOT call the API here. We capture the summary and
  // leave immediately; the Finish screen owns the request and waits for it.
  // Awaiting on this page would keep the End button on screen during a slow
  // response, letting the user fire a second finish.
  const handleFinish = () => {
    // Ref, not state: two taps in the same tick would both read a `false`
    // state value and both get through.
    if (finishingRef.current) return
    finishingRef.current = true
    setIsFinishing(true)
    navigate('/workout/finish', {
      state: { snapshot: buildSnapshot() },
      replace: true,   // back must not return to a live workout that is over
    })
  }

  // ── REST ──
  if (showRest && currentExercise) {
    const logged = currentSetPlan
    return (
      <RestTimer
        seconds={currentSetPlan?.restSeconds ?? 90}
        workoutTime={fmtTime(elapsed)}
        setInfo={{
          exercise: currentExercise.exercise.name,
          setNumber: currentSetIndex + 1,
          reps: logged?.reps ?? 0,
          weight: logged?.weight ?? 0,
          rpe: logged?.rpe ?? 7,
        }}
        onDone={() => {
          notifyRestComplete(`Set ${currentSetIndex + 2}`)
          advance()
        }}
        onSkip={advance}
      />
    )
  }

  // ── SAVING (finish in flight) ──
  // Rendered before the "no exercises" branch: finishSession clears the
  // selection, so without this the screen flashes an empty state on the way out.
  if (isFinishing) {
    return (
      <div className="min-h-dvh bg-dark-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">💾</div>
          <p className="text-white font-semibold">Saving your workout...</p>
        </div>
      </div>
    )
  }

  // ── START FAILED ──
  if (startError) {
    return (
      <div className="min-h-dvh bg-dark-900 flex items-center justify-center px-5">
        <div className="text-center max-w-[320px]">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-white font-semibold mb-2">Couldn't start the workout</p>
          <p className="text-dark-300 text-[13px] mb-6">{startError}</p>
          <button
            onClick={() => { clearErrors(); beginSession() }}
            className="w-full bg-brand-teal text-black py-3.5 rounded-btn font-bold
                       active:scale-95 transition-transform">
            Retry
          </button>
          <button onClick={() => navigate('/workout/plan')}
            className="mt-3 text-dark-400 text-sm">← Back to plan</button>
        </div>
      </div>
    )
  }

  // ── LOADING ──
  if (isStarting || (!sessionId && selectedExercises.length > 0)) {
    return (
      <div className="min-h-dvh bg-dark-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">💪</div>
          <p className="text-white font-semibold">Starting workout...</p>
        </div>
      </div>
    )
  }

  // ── NO EXERCISES ──
  if (!currentExercise) {
    return (
      <div className="min-h-dvh bg-dark-900 flex items-center justify-center px-5">
        <div className="text-center">
          <p className="text-white text-lg mb-4">No exercises selected</p>
          <button onClick={() => navigate('/workout/browse')}
            className="bg-brand-teal text-black px-6 py-3 rounded-btn font-bold">
            Browse Exercises
          </button>
        </div>
      </div>
    )
  }

  // Toast shown when a set failed to persist, so a dropped set is never silent
  const errorToast = logError ? (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex items-start gap-3 px-4 py-3.5
                    rounded-card border border-brand-red/50 bg-[#2a1a1a] shadow-lg">
      <span className="text-base">⚠️</span>
      <p className="flex-1 text-[13px] text-white leading-snug">{logError}</p>
      <button onClick={clearErrors} className="text-dark-300 text-lg leading-none px-1">×</button>
    </div>
  ) : null

  // ── modality branch: render the matching live view ──
  const modalityProps = {
    elapsed,
    onRest: logAndRest,
    onAdvance: logAndAdvance,
    onFinish: handleFinish,
  }
  const modalityView = (() => {
    switch (currentExercise.exercise.modality) {
      case 'Calisthenics': return <CalisthenicsView {...modalityProps} />
      case 'Mobility':     return <MobilityView {...modalityProps} />
      case 'Cardio':       return <CardioView {...modalityProps} />
      case 'WOD':          return <WodView {...modalityProps} />
      // 'Strength' and anything else fall through to the strength UI below
      default:             return null
    }
  })()
  if (modalityView) return <>{modalityView}{errorToast}</>


  const ex = currentExercise.exercise
  const cur = currentSetPlan ?? { reps: 0, weight: 0, rpe: 7, restSeconds: 90 }
  const muscle = ex.muscles.map(m => m.name).join(' · ')
  const totalSets = currentExercise.sets.length

  // Quick chips
  const wBase = cur.weight
  const weightChips = Array.from(new Set(
    [wBase, wBase + 2.5, wBase + 5, Math.max(0, wBase - 2.5)]
      .map(w => Math.round(w * 10) / 10)))
  const repChips = Array.from(new Set(
    [Math.max(1, cur.reps - 2), cur.reps, cur.reps + 2, cur.reps + 4]))

  // Up next
  let upNext: { title: string; detail: string }
  if (currentSetIndex + 1 < totalSets) {
    const n = currentExercise.sets[currentSetIndex + 1]
    upNext = { title: `Set ${currentSetIndex + 2}`, detail: `${n.weight}kg · ${n.reps} reps · RPE ${n.rpe}` }
  } else {
    let ni = currentExerciseIndex + 1
    while (ni < selectedExercises.length && selectedExercises[ni].skipped) ni++
    upNext = ni < selectedExercises.length
      ? { title: selectedExercises[ni].exercise.name, detail: `Next exercise · ${selectedExercises[ni].sets.length} sets` }
      : { title: 'Last set', detail: 'Finish line — give it everything' }
  }

  const rpeModeLabel = rpeMode === 'standard' ? 'Standard' : rpeMode === 'beginner' ? 'Beginner' : 'Pro'
  const cycleMode = () => setRpeMode(m => m === 'standard' ? 'beginner' : m === 'beginner' ? 'pro' : 'standard')

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-5 pt-4 pb-4">

      {/* Top bar */}
      <div className="flex justify-between items-start pb-3.5 border-b border-dark-600">
        <div>
          <div className="flex items-center gap-1.5 text-brand-red text-xs font-bold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" /> LIVE
          </div>
          <p className="text-dark-300 text-xs mt-2">Workout time</p>
          <p className="text-[30px] font-extrabold leading-none mt-0.5">{fmtTime(elapsed)}</p>
        </div>
        <div className="text-right">
          <p className="text-dark-300 text-xs">Exercise</p>
          <p className="text-[26px] font-extrabold mt-1">
            {currentExerciseIndex + 1}
            <span className="text-dark-500 text-base">/{selectedExercises.length}</span>
          </p>
        </div>
      </div>

      {/* Exercise name + all */}
      <div className="flex items-center justify-between mt-4">
        <div className="min-w-0">
          <h2 className="text-[22px] font-extrabold leading-tight truncate">{ex.name}</h2>
          <p className="text-dark-300 text-[12.5px] mt-0.5 truncate">{muscle}</p>
        </div>
        <button
          onClick={() => navigate('/workout/queue')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border border-dark-600
                     bg-dark-800 text-white text-[13px] font-semibold flex-shrink-0 ml-3
                     active:scale-95 transition-transform"
        >
          ☰ All exercises
        </button>
      </div>

      {/* Segment bar */}
      <div className="flex gap-2 mt-4">
        {currentExercise.sets.map((_s, i) => {
          const done = isSetDone(currentExerciseIndex, i)
          const active = i === currentSetIndex
          return (
            <button key={i} onClick={() => setCurrent(currentExerciseIndex, i)}
              className="flex-1 text-left">
              <div className="h-1 rounded-full"
                style={{ background: done || active ? '#00D4AA' : '#2A2A2A' }} />
              <div className="mt-1.5 text-xs"
                style={{
                  fontWeight: active ? 700 : 500,
                  color: active ? '#00D4AA' : done ? '#AAAAAA' : '#555555',
                }}>
                Set {i + 1} {done ? '✓' : active ? '←' : ''}
              </div>
            </button>
          )
        })}
      </div>

      {/* Current set card */}
      <div className="mt-4 rounded-card border border-brand-teal/30 overflow-hidden"
        style={{ background: '#0a2a22' }}>
        <div className="flex items-center gap-3 px-4 py-3.5"
          style={{ background: 'rgba(0,212,170,0.08)' }}>
          <div className="w-[34px] h-[34px] rounded-[9px] bg-brand-teal text-black
                          flex items-center justify-center text-base font-extrabold">
            {cur.reps}
          </div>
          <span className="text-base font-bold">Current Set</span>
        </div>

        {/* Weight + Reps */}
        <div className="p-4 grid grid-cols-2 gap-3">
          {/* Weight */}
          <div className="bg-dark-800 border border-dark-600 rounded-btn px-2.5 py-3.5">
            <p className="text-center text-[10px] tracking-widest text-dark-300 mb-2.5">WEIGHT (KG)</p>
            <div className="flex items-center justify-center gap-2.5">
              <button
                onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { weight: Math.max(0, Math.round((cur.weight - 2.5) * 10) / 10) })}
                className="w-[46px] h-[46px] rounded-btn border border-dark-600 bg-dark-700
                           text-2xl font-bold active:scale-90 transition-transform">−</button>
              <span className="min-w-[52px] text-center text-[26px] font-extrabold">{cur.weight}</span>
              <button
                onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { weight: Math.round((cur.weight + 2.5) * 10) / 10 })}
                className="w-[46px] h-[46px] rounded-btn border border-dark-600 bg-dark-700
                           text-2xl font-bold active:scale-90 transition-transform">+</button>
            </div>
            <div className="flex gap-1.5 justify-center mt-3">
              {weightChips.map(w => (
                <button key={w}
                  onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { weight: w })}
                  className="min-w-[44px] px-2.5 py-1.5 rounded-badge text-xs font-bold border"
                  style={{
                    borderColor: w === cur.weight ? '#00D4AA' : '#2A2A2A',
                    background: w === cur.weight ? '#00D4AA' : '#1E1E1E',
                    color: w === cur.weight ? '#000' : '#AAAAAA',
                  }}>{w}</button>
              ))}
            </div>
          </div>
          {/* Reps */}
          <div className="bg-dark-800 border border-dark-600 rounded-btn px-2.5 py-3.5">
            <p className="text-center text-[10px] tracking-widest text-dark-300 mb-2.5">REPS</p>
            <div className="flex items-center justify-center gap-2.5">
              <button
                onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { reps: Math.max(1, cur.reps - 1) })}
                className="w-[46px] h-[46px] rounded-btn border border-dark-600 bg-dark-700
                           text-2xl font-bold active:scale-90 transition-transform">−</button>
              <span className="min-w-[52px] text-center text-[26px] font-extrabold">{cur.reps}</span>
              <button
                onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { reps: cur.reps + 1 })}
                className="w-[46px] h-[46px] rounded-btn border border-dark-600 bg-dark-700
                           text-2xl font-bold active:scale-90 transition-transform">+</button>
            </div>
            <div className="flex gap-1.5 justify-center mt-3">
              {repChips.map(r => (
                <button key={r}
                  onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { reps: r })}
                  className="min-w-[44px] px-2.5 py-1.5 rounded-badge text-xs font-bold border"
                  style={{
                    borderColor: r === cur.reps ? '#00D4AA' : '#2A2A2A',
                    background: r === cur.reps ? '#00D4AA' : '#1E1E1E',
                    color: r === cur.reps ? '#000' : '#AAAAAA',
                  }}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        {/* RPE grid */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] tracking-wide text-dark-300">
              RPE ·{' '}
              <button onClick={cycleMode}
                className="text-dark-400 text-[11px] underline underline-offset-2">
                {rpeModeLabel}
              </button>
            </span>
            <span className="text-[13px] font-bold" style={{ color: rpeColor(cur.rpe) }}>
              {rpeLabel(cur.rpe, rpeMode)}
            </span>
          </div>
          <div className="flex gap-[5px]">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
              const on = n === cur.rpe
              return (
                <button key={n}
                  onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { rpe: n })}
                  className="flex-1 py-2.5 rounded-[9px] text-sm font-extrabold border transition-all active:scale-90"
                  style={{
                    borderColor: on ? rpeColor(n) : 'transparent',
                    background: on ? rpeColor(n) : rpeTint(n),
                    color: on ? '#000' : rpeColor(n),
                  }}>{n}</button>
              )
            })}
          </div>
        </div>

        {/* Voice hint + Set Done */}
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-center gap-2.5 px-3.5 py-3 mb-3 rounded-btn
                          border border-dark-600 bg-dark-800">
            <span className="text-base">🎤</span>
            <span className="flex-1 text-[13.5px] text-dark-300">Say "Set done" to log this set</span>
            <span className="w-2 h-2 rounded-full bg-dark-500" />
          </div>
          <button
            onClick={handleSetDone}
            className="w-full py-[17px] rounded-btn bg-brand-teal text-black
                       text-[17px] font-extrabold active:scale-95 transition-transform">
            ✓ Set Done — Start Rest
          </button>
        </div>
      </div>

      {/* Up next */}
      <div className="mt-4 bg-dark-800 border border-dark-600 rounded-card px-4 py-3.5">
        <p className="text-[10px] tracking-widest text-dark-400 mb-1">UP NEXT</p>
        <p className="text-[15px] font-bold">{upNext.title}</p>
        <p className="text-[12.5px] text-dark-300 mt-0.5">{upNext.detail}</p>
      </div>

      {/* Note + End */}
      <div className="grid grid-cols-2 gap-2.5 mt-3.5">
        <button className="py-3.5 rounded-btn border border-dark-600 bg-dark-800
                           text-sm font-semibold active:scale-95 transition-transform">
          📝 Note
        </button>
        <button
          onClick={handleFinish}
          disabled={isFinishing}
          className="py-3.5 rounded-btn border border-brand-red/40 bg-[#2a1a1a]
                     text-brand-red text-sm font-bold active:scale-95 transition-transform
                     disabled:opacity-50">
          {isFinishing ? 'Ending…' : '■ End'}
        </button>
      </div>

      {errorToast}
    </div>
  )
}

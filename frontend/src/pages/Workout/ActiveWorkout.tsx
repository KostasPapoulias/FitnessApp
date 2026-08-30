import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { useSessionPrefsStore } from '../../store/useSessionPrefsStore'
import { useNotifications } from '../../hooks/useNotifcations'
import { useVoiceCommands } from '../../hooks/useVoiceCommands'
import { hapticRestComplete, hapticSetLogged } from '../../lib/haptics'
import { announce, alert as speakAlert, cues } from '../../lib/speech'
import type { VoiceCommand } from '../../lib/voiceGrammar'
import { ROTATING_EXAMPLES } from '../../constants/voiceCommands'
import VoiceCommandSheet from '../../components/workout/VoiceCommandSheet'
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
    startError, logError, clearErrors, queuedSetCount,
  } = useWorkoutStore()

  // The finish request, fatigue refresh and reminder reschedule all live on the
  // Finish screen now — see handleFinish below.
  const { notifyRestComplete } = useNotifications()

  const [isStarting, setIsStarting] = useState(false)
  const [showRest, setShowRest] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [rpeMode, setRpeMode] = useState<RpeMode>('standard')
  const [elapsed, setElapsed] = useState(0)
  const [restPaused, setRestPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishingRef = useRef(false)

  const { voice, haptic, audio } = useSessionPrefsStore()

  // "End workout" is the one command that throws away the rest of the session,
  // so it is armed by the first utterance and only acted on by the second.
  // Everything else is a tap away from being undone; this isn't.
  const [endArmed, setEndArmed] = useState(false)
  const endArmedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  /** Confirmation that a set actually persisted, on whichever channels are on. */
  const confirmLogged = (payload: LogPayload) => {
    if (haptic) void hapticSetLogged()
    if (audio) void announce(cues.setLogged(currentSetIndex + 1, payload.reps, payload.weight))
  }

  const logAndRest = async (payload: LogPayload) => {
    // Decide before awaiting: the indices can move while the request is out
    const final = isFinalSet(currentExerciseIndex, currentSetIndex)
    if (!(await completeSet(payload))) return
    confirmLogged(payload)
    // "Set Done" on the very last set ends the workout instead of starting a
    // rest the user will never use
    if (final) handleFinish()
    else {
      setRestPaused(false)
      setShowRest(true)
      if (audio) void announce(cues.restStarting(payload.restSeconds))
    }
  }
  // Log a set, then move straight to the next set/exercise, no rest (mobility)
  const logAndAdvance = async (payload: LogPayload) => {
    if (await completeSet(payload)) { confirmLogged(payload); advance() }
  }

  /**
   * Log the current set.
   *
   * `overrides` carries spoken values ("log eight at sixty"). They are written
   * to the store first so the set card and the log agree — a voice-logged set
   * that differs from what the screen showed is indistinguishable from a bug.
   */
  const handleSetDone = (overrides?: { reps?: number; weight?: number; rpe?: number }) => {
    if (overrides && Object.keys(overrides).length > 0) {
      updateSet(currentExerciseIndex, currentSetIndex, overrides)
    }
    const plan = { ...currentSetPlan, ...overrides }
    return logAndRest({
      reps: plan?.reps ?? 10,
      weight: plan?.weight ?? 0,
      rpe: plan?.rpe ?? 7,
      restSeconds: currentSetPlan?.restSeconds ?? 90,
    })
  }

  /** What comes after the set at (exIdx, setIdx), for the spoken cue. */
  const describeNext = (exIdx: number, setIdx: number): string | null => {
    const ex = selectedExercises[exIdx]
    if (!ex) return null
    if (setIdx + 1 < ex.sets.length) {
      const n = ex.sets[setIdx + 1]
      return isFinalSet(exIdx, setIdx + 1)
        ? `${cues.nextSet(setIdx + 2, n.reps, n.weight)} ${cues.finalSet()}`
        : cues.nextSet(setIdx + 2, n.reps, n.weight)
    }
    let ni = exIdx + 1
    while (ni < selectedExercises.length && selectedExercises[ni].skipped) ni++
    const next = selectedExercises[ni]
    return next ? cues.nextExercise(next.exercise.name, next.sets.length) : null
  }

  const advance = () => {
    setShowRest(false)
    setRestPaused(false)
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

  // ── voice (requirement 6.1) ──
  // One session for the whole workout, routed by which screen is up: the rest
  // timer answers to "skip"/"pause", the set card to values and "set done".
  const handleVoiceCommand = useCallback((command: VoiceCommand) => {
    const resting = showRest

    // Calisthenics holds, runs and metcons log fields the strength set card has
    // no idea about — seconds under tension, distance, rounds. Routing a spoken
    // "set done" through the strength path there would write a hold as zero
    // seconds, so value and log commands stay off until each modality view
    // exposes its own handler. Navigation and ending still work everywhere.
    const modality = selectedExercises[currentExerciseIndex]?.exercise.modality
    const strengthFlow = modality !== 'Calisthenics' && modality !== 'Mobility'
      && modality !== 'Cardio' && modality !== 'WOD'

    switch (command.kind) {
      case 'endWorkout':
        if (endArmed) {
          if (endArmedTimer.current) clearTimeout(endArmedTimer.current)
          setEndArmed(false)
          handleFinish()
        } else {
          setEndArmed(true)
          if (audio) void speakAlert('Say end workout again to confirm.')
          if (endArmedTimer.current) clearTimeout(endArmedTimer.current)
          endArmedTimer.current = setTimeout(() => setEndArmed(false), 8000)
        }
        return

      case 'skipRest':
        if (resting) advance()
        return

      case 'pauseRest':
        if (resting) setRestPaused(true)
        return

      case 'resumeRest':
        if (resting) setRestPaused(false)
        return

      case 'advance':
        // During rest this is the same intent as "skip"; on the set card it
        // moves on without logging, which is what "next exercise" means.
        advance()
        return

      case 'setValues': {
        if (!strengthFlow) return
        // Adjusting the next set mid-rest is exactly what the rest screen's
        // steppers are for, so route there rather than editing the set that
        // has already been logged.
        const { reps, weight, rpe } = command
        const patch = {
          ...(reps !== undefined && { reps }),
          ...(weight !== undefined && { weight }),
          ...(rpe !== undefined && { rpe }),
        }
        if (Object.keys(patch).length === 0) return
        if (resting) {
          const [exIdx, setIdx] = nextSetLocation()
          if (exIdx !== null && setIdx !== null) updateSet(exIdx, setIdx, patch)
        } else {
          updateSet(currentExerciseIndex, currentSetIndex, patch)
        }
        return
      }

      case 'logSet': {
        if (resting || !strengthFlow) return   // nothing to log; the set is already in
        const { reps, weight, rpe } = command
        void handleSetDone({
          ...(reps !== undefined && { reps }),
          ...(weight !== undefined && { weight }),
          ...(rpe !== undefined && { rpe }),
        })
        return
      }
    }
  // `elapsed` is here because "end workout" reaches buildSnapshot through
  // handleFinish, and a memoised callback would otherwise report the session
  // length as it stood when the callback was last built. Rebuilding once a
  // second costs nothing — useVoiceCommands holds handlers in a ref precisely
  // so a new function identity never restarts the microphone.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRest, endArmed, audio, elapsed, currentExerciseIndex, currentSetIndex, selectedExercises])

  /** Where the next unlogged set lives, so spoken adjustments during rest land
   *  on the set the athlete is about to do rather than the one just finished. */
  const nextSetLocation = (): [number | null, number | null] => {
    const ex = selectedExercises[currentExerciseIndex]
    if (!ex) return [null, null]
    if (currentSetIndex + 1 < ex.sets.length) return [currentExerciseIndex, currentSetIndex + 1]
    let ni = currentExerciseIndex + 1
    while (ni < selectedExercises.length && selectedExercises[ni].skipped) ni++
    return ni < selectedExercises.length ? [ni, 0] : [null, null]
  }

  const [showVoiceHelp, setShowVoiceHelp] = useState(false)

  const { state: voiceState, lastHeard, lastMiss } = useVoiceCommands(
    // Only while a session is genuinely live. Holding the microphone through
    // the loading, error and saving screens would keep it hot for no reason.
    voice && Boolean(sessionId) && !isFinishing && !startError,
    { onCommand: handleVoiceCommand }
  )

  useEffect(() => () => {
    if (endArmedTimer.current) clearTimeout(endArmedTimer.current)
  }, [])

  // Shown on every screen a voice session can reach, because the first "end
  // workout" is only useful if the athlete can see that it registered.
  const endArmedBanner = endArmed ? (
    <div className="fixed top-3 left-4 right-4 z-[60] flex items-center gap-3 px-4 py-3.5
                    rounded-card border border-brand-yellow/50 bg-[#2a2410] shadow-lg">
      <span className="text-base">🎤</span>
      <p className="flex-1 text-[13px] text-white leading-snug">
        Say <span className="font-bold">"end workout"</span> again to finish, or ignore this to keep going.
      </p>
      <button onClick={() => setEndArmed(false)} className="text-dark-300 text-lg leading-none px-1">×</button>
    </div>
  ) : null

  // ── REST ──
  if (showRest && currentExercise) {
    const logged = currentSetPlan
    return (
      <>
      {endArmedBanner}
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
        paused={restPaused}
        onPausedChange={setRestPaused}
        onDone={() => {
          notifyRestComplete(`Set ${currentSetIndex + 2}`)
          // Requirement 4.2 — the buzz the Smart Features card has always
          // promised. Fired here rather than in RestTimer so it happens once,
          // at the moment the timer actually completes.
          if (haptic) void hapticRestComplete()
          // Requirement 6.2 — and say what's coming, so the phone can stay in
          // a pocket between sets.
          if (audio) {
            const next = describeNext(currentExerciseIndex, currentSetIndex)
            void speakAlert(cues.restComplete(next ?? ''))
          }
          advance()
        }}
        onSkip={advance}
      />
      </>
    )
  }

  // ── SAVING (finish in flight) ──
  // Rendered before the "no exercises" branch: finishSession clears the
  // selection, so without this the screen flashes an empty state on the way out.
  if (isFinishing) {
    return (
      <div className="flex-1 bg-dark-900 flex items-center justify-center">
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
      <div className="flex-1 bg-dark-900 flex items-center justify-center px-5">
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
      <div className="flex-1 bg-dark-900 flex items-center justify-center">
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
      <div className="flex-1 bg-dark-900 flex items-center justify-center px-5">
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

  // Toast shown when a set failed to persist, so a dropped set is never silent.
  //
  // Two states now, and they must not look the same. A red toast means the set
  // is GONE and the athlete has to act. The amber one means it is saved on this
  // phone and will send itself — no action needed, but not hidden either,
  // because a set that reads as saved while living only in IndexedDB is exactly
  // the kind of quiet difference that becomes "the app lost my workout".
  const errorToast = logError ? (
    <div className="fixed bottom-[calc(var(--bottom-nav-h)+0.75rem)] left-4 right-4 z-50 flex items-start gap-3 px-4 py-3.5
                    rounded-card border border-brand-red/50 bg-[#2a1a1a] shadow-lg">
      <span className="text-base">⚠️</span>
      <p className="flex-1 text-[13px] text-white leading-snug">{logError}</p>
      <button onClick={clearErrors} className="text-dark-300 text-lg leading-none px-1">×</button>
    </div>
  ) : queuedSetCount > 0 ? (
    <div className="fixed bottom-[calc(var(--bottom-nav-h)+0.75rem)] left-4 right-4 z-50 flex items-start gap-3 px-4 py-3.5
                    rounded-card border border-brand-orange/40 bg-[#2a2118] shadow-lg">
      <span className="text-base">📶</span>
      <p className="flex-1 text-[13px] text-white leading-snug">
        {queuedSetCount === 1 ? '1 set is' : `${queuedSetCount} sets are`} saved on this phone.
        {' '}They will upload when you have a signal.
      </p>
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
  if (modalityView) return <>{modalityView}{endArmedBanner}{errorToast}</>


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
    <div className="flex-1 bg-dark-900 text-white px-5 pt-4 pb-4">

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
        <div className="p-3.5 grid grid-cols-2 gap-2.5">
          {/* Weight */}
          <div className="bg-dark-800 border border-dark-600 rounded-btn px-2 py-3.5 min-w-0">
            <p className="text-center text-[10px] tracking-widest text-dark-300 mb-2.5">WEIGHT (KG)</p>
            <div className="flex items-center justify-center gap-1.5">
              <button
                onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { weight: Math.max(0, Math.round((cur.weight - 2.5) * 10) / 10) })}
                className="w-10 h-10 sm:w-[46px] sm:h-[46px] flex-shrink-0 rounded-btn border border-dark-600
                           bg-dark-700 text-xl sm:text-2xl font-bold active:scale-90 transition-transform">−</button>
              <span className="flex-1 min-w-0 text-center text-[22px] sm:text-[26px] font-extrabold tabular-nums">{cur.weight}</span>
              <button
                onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { weight: Math.round((cur.weight + 2.5) * 10) / 10 })}
                className="w-10 h-10 sm:w-[46px] sm:h-[46px] flex-shrink-0 rounded-btn border border-dark-600
                           bg-dark-700 text-xl sm:text-2xl font-bold active:scale-90 transition-transform">+</button>
            </div>
            <div className="flex gap-1 mt-3">
              {weightChips.map(w => (
                <button key={w}
                  onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { weight: w })}
                  className="flex-1 basis-0 min-w-0 px-0.5 py-1.5 rounded-badge text-[11px] sm:text-xs font-bold border tabular-nums"
                  style={{
                    borderColor: w === cur.weight ? '#00D4AA' : '#2A2A2A',
                    background: w === cur.weight ? '#00D4AA' : '#1E1E1E',
                    color: w === cur.weight ? '#000' : '#AAAAAA',
                  }}>{w}</button>
              ))}
            </div>
          </div>
          {/* Reps */}
          <div className="bg-dark-800 border border-dark-600 rounded-btn px-2 py-3.5 min-w-0">
            <p className="text-center text-[10px] tracking-widest text-dark-300 mb-2.5">REPS</p>
            <div className="flex items-center justify-center gap-1.5">
              <button
                onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { reps: Math.max(1, cur.reps - 1) })}
                className="w-10 h-10 sm:w-[46px] sm:h-[46px] flex-shrink-0 rounded-btn border border-dark-600
                           bg-dark-700 text-xl sm:text-2xl font-bold active:scale-90 transition-transform">−</button>
              <span className="flex-1 min-w-0 text-center text-[22px] sm:text-[26px] font-extrabold tabular-nums">{cur.reps}</span>
              <button
                onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { reps: cur.reps + 1 })}
                className="w-10 h-10 sm:w-[46px] sm:h-[46px] flex-shrink-0 rounded-btn border border-dark-600
                           bg-dark-700 text-xl sm:text-2xl font-bold active:scale-90 transition-transform">+</button>
            </div>
            <div className="flex gap-1 mt-3">
              {repChips.map(r => (
                <button key={r}
                  onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { reps: r })}
                  className="flex-1 basis-0 min-w-0 px-0.5 py-1.5 rounded-badge text-[11px] sm:text-xs font-bold border tabular-nums"
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

        {/* Voice strip + Set Done */}
        <div className="px-4 pt-3 pb-4">
          {/* The strip itself says the microphone is live and opens the full
              command list on tap, so the tip that used to sit under it was
              covering the set you were mid-way through logging to explain
              something already on screen. */}
          <VoiceStrip
            state={voiceState}
            lastHeard={lastHeard}
            lastMiss={lastMiss}
            enabled={voice}
            onOpenHelp={() => setShowVoiceHelp(true)}
          />
          <button
            onClick={() => handleSetDone()}
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

      {endArmedBanner}
      {errorToast}
      {showVoiceHelp && <VoiceCommandSheet onClose={() => setShowVoiceHelp(false)} />}
    </div>
  )
}

/**
 * Live state of the microphone, in the strip that used to be a static hint.
 *
 * It has to do three jobs at once, which is why it is not just a label:
 *
 *  - **Report.** The dot only pulses when the engine is genuinely running, and
 *    a blocked microphone says so rather than leaving cheerful copy sitting
 *    there doing nothing.
 *  - **Teach.** While idle it cycles through the vocabulary a phrase at a time,
 *    so someone who uses the app for a month meets all of it without ever
 *    opening a help screen. One static example would only ever teach one.
 *  - **Recover.** A phrase aimed at the app that didn't parse is answered, not
 *    swallowed. Silence after a real attempt is what convinces people the
 *    feature is broken.
 *
 * The whole strip is a button — the full list is one tap away, always.
 */
function VoiceStrip({
  state, lastHeard, lastMiss, enabled, onOpenHelp,
}: {
  state: VoiceStateLike
  lastHeard: string | null
  lastMiss: string | null
  enabled: boolean
  onOpenHelp: () => void
}) {
  const [exampleIndex, setExampleIndex] = useState(0)
  const listening = state === 'listening'
  const busy = Boolean(lastHeard || lastMiss)

  // Rotate slowly, and only while there is nothing more important to show. Any
  // faster reads as an animation to watch rather than a hint to glance at.
  useEffect(() => {
    if (!listening || busy) return
    const id = setInterval(
      () => setExampleIndex(i => (i + 1) % ROTATING_EXAMPLES.length),
      7000
    )
    return () => clearInterval(id)
  }, [listening, busy])

  if (!enabled) return null
  // Nothing useful to say about a device that never had the capability — the
  // Start screen has already explained it there.
  if (state === 'unsupported') return null

  const blocked = state === 'denied'
  const broken = state === 'failed'

  const tone = lastMiss ? 'miss' : lastHeard ? 'good' : blocked || broken ? 'bad' : 'calm'
  const color = { good: '#00D4AA', miss: '#FACC15', bad: '#EF4444', calm: '#888888' }[tone]
  const border = { good: 'rgba(0,212,170,0.4)', miss: 'rgba(250,204,21,0.4)', bad: 'rgba(239,68,68,0.35)', calm: '#2A2A2A' }[tone]

  const message = lastMiss
    ? `Didn’t catch “${lastMiss}”`
    : lastHeard
    ? `Heard “${lastHeard}”`
    : blocked
    ? 'Microphone blocked — allow it to use voice'
    : broken
    ? 'Voice stopped. Use the buttons to log.'
    : listening
    ? `Say “${ROTATING_EXAMPLES[exampleIndex]}”`
    : 'Starting microphone…'

  return (
    <button
      onClick={onOpenHelp}
      className="w-full flex items-center gap-2.5 px-3.5 py-3 mb-3 rounded-btn
                 border bg-dark-800 text-left transition-colors active:scale-[0.99]"
      style={{ borderColor: border }}
    >
      <span className="text-base">{blocked || broken ? '🚫' : '🎤'}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] truncate" style={{ color }}>{message}</span>
        {/* The recovery line. Only after a miss, and it names a phrase that
            definitely works rather than telling them to try again. */}
        {lastMiss && (
          <span className="block text-[11.5px] text-dark-400 mt-0.5">
            Try “set done” · tap for all commands
          </span>
        )}
      </span>
      <span className="flex-shrink-0 w-[18px] h-[18px] rounded-full border border-dark-500
                       text-dark-400 text-[11px] font-bold flex items-center justify-center">
        ?
      </span>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${listening && !busy ? 'animate-pulse' : ''}`}
        style={{ background: tone === 'calm' ? '#555555' : color }} />
    </button>
  )
}

/** Kept local to avoid re-exporting the recogniser's union through this file. */
type VoiceStateLike = 'idle' | 'listening' | 'unsupported' | 'denied' | 'failed'

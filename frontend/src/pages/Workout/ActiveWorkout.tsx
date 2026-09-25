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
import ExerciseNotes, { ExerciseNotesHandle } from '../../components/workout/ExerciseNotes'
import PreviousNote from '../../components/workout/PreviousNote'
import NumberField from '../../components/workout/NumberField'
import SaveToCalendar from '../../components/workout/SaveToCalendar'
import SessionStatus from '../../components/workout/SessionCard'
import RestTimer from './RestTimer'
import CalisthenicsView from './CalisthenicsView'
import MobilityView from './MobilityView'
import CardioView from './CardioView'
import WodView from './WodView'
import type { LogPayload, ModalityVoiceHandler } from './LiveShared'
import {
  rpeColor, rpeTint, rpeLabel, fmtTime, RpeMode, summariseSession, nextLoad,
} from './helpers'
import { AlertTriangleIcon, ListIcon, MicIcon, MicOffIcon, NoteIcon, WifiOffIcon } from '../../components/icons'

export default function ActiveWorkout() {
  const navigate = useNavigate()
  // Lets the bottom Note button open the note field at the top
  const notesRef = useRef<ExerciseNotesHandle>(null)
  // Anchor for the quick chips (see where they are built)
  const chipAnchor = useRef<{ key: string; weight: number; reps: number } | null>(null)
  const {
    selectedExercises, sessionId, sessionStartTime,
    currentExerciseIndex, currentSetIndex, completedSets,
    startSession, completeSet, updateSet, setCurrent, setExerciseNotes,
    startError, logError, clearErrors, queuedSetCount,
  } = useWorkoutStore()

  // The finish request itself lives on the Finish screen
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

  // "End workout" by voice needs saying twice: the first arms it, the second acts
  const [endArmed, setEndArmed] = useState(false)
  const endArmedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The mounted modality view's voice handler, if any
  const modalityVoice = useRef<ModalityVoiceHandler | null>(null)
  const registerVoice = useCallback((handler: ModalityVoiceHandler | null) => {
    modalityVoice.current = handler
  }, [])

  const currentExercise = selectedExercises[currentExerciseIndex]
  const currentSetPlan = currentExercise?.sets[currentSetIndex]

  // ── start session on mount ──
  // Reads fresh store state, and startSession() de-dupes, so a StrictMode remount can't start two
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

  // The last set of the last non-skipped exercise — nothing to rest for after it
  const isFinalSet = (exIdx: number, setIdx: number) => {
    const ex = selectedExercises[exIdx]
    if (!ex || setIdx + 1 < ex.sets.length) return false
    let ni = exIdx + 1
    while (ni < selectedExercises.length && selectedExercises[ni].skipped) ni++
    return ni >= selectedExercises.length
  }

  // ── set / rest flow ──
  /** Confirms a set that actually persisted, on the enabled channels. */
  const confirmLogged = (payload: LogPayload) => {
    if (haptic) void hapticSetLogged()
    if (audio) void announce(cues.setLogged(currentSetIndex + 1, payload.reps, payload.weight))
  }

  const logAndRest = async (payload: LogPayload) => {
    // Decide before awaiting — the indices can move meanwhile
    const final = isFinalSet(currentExerciseIndex, currentSetIndex)
    if (!(await completeSet(payload))) return
    confirmLogged(payload)
    // The last set ends the workout instead of starting a rest
    if (final) handleFinish()
    else {
      setRestPaused(false)
      setShowRest(true)
      if (audio) void announce(cues.restStarting(payload.restSeconds))
    }
  }
  // Log a set and move on without rest (mobility)
  const logAndAdvance = async (payload: LogPayload) => {
    if (await completeSet(payload)) { confirmLogged(payload); advance() }
  }

  /**
   * Log the current set. Spoken values ("log eight at sixty") are written to
   * the store first, so the card and the log agree.
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

  /** What comes after this set, for the spoken cue. */
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
    // Read fresh — a modality view may have just logged a set
    const { selectedExercises, completedSets } = useWorkoutStore.getState()
    return summariseSession(selectedExercises, completedSets, elapsed)
  }

  // Finishing only captures the summary and navigates; the Finish screen owns
  // the request, so there is no End button left to press twice
  const handleFinish = () => {
    // Ref guard against two taps in one tick
    if (finishingRef.current) return
    finishingRef.current = true
    setIsFinishing(true)
    navigate('/workout/finish', {
      state: { snapshot: buildSnapshot() },
      replace: true,   // back must not return to a live workout that is over
    })
  }

  // ── voice ──
  // One session for the workout: the rest timer answers "skip"/"pause", the set card values and "set done".
  const handleVoiceCommand = useCallback((command: VoiceCommand) => {
    const resting = showRest

    // Value and log commands only on the strength card (other modalities log different fields)
    const modality = selectedExercises[currentExerciseIndex]?.exercise.modality
    const strengthFlow = modality !== 'Calisthenics' && modality !== 'Mobility'
      && modality !== 'Cardio' && modality !== 'WOD'

    // "End workout" is handled here first, identically on every screen
    if (command.kind === 'endWorkout') {
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
    }

    // Everything else goes to the mounted modality view first (except during rest)
    if (!resting && modalityVoice.current?.(command)) return

    // `endWorkout` returned above, so TypeScript has narrowed it out
    switch (command.kind) {
      case 'mark':
        // Laps and rounds are claimed by the modality views
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
        // During rest: skip; on the set card: move on without logging
        advance()
        return

      case 'setValues': {
        if (!strengthFlow) return
        // During rest, adjust the upcoming set rather than the logged one
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
        if (resting || !strengthFlow) return   // nothing to log
        const { reps, weight, rpe } = command
        void handleSetDone({
          ...(reps !== undefined && { reps }),
          ...(weight !== undefined && { weight }),
          ...(rpe !== undefined && { rpe }),
        })
        return
      }
    }
  // `elapsed` is a dep so a voice "end workout" snapshots the current duration
  // (handlers sit in a ref, so a new identity never restarts the mic)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRest, endArmed, audio, elapsed, currentExerciseIndex, currentSetIndex, selectedExercises])

  /** The next unlogged set, so spoken adjustments during rest land on it. */
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
    // Only while the session is live
    voice && Boolean(sessionId) && !isFinishing && !startError,
    { onCommand: handleVoiceCommand }
  )

  useEffect(() => () => {
    if (endArmedTimer.current) clearTimeout(endArmedTimer.current)
  }, [])

  // Shown on every screen voice can reach, so the first "end workout" is visibly armed
  const endArmedBanner = endArmed ? (
    <div className="fixed top-3 left-4 right-4 z-[60] flex items-center gap-3 px-4 py-3.5
                    rounded-card border border-brand-yellow/50 bg-[#2a2410] shadow-lg">
      <MicIcon className="w-4 h-4" />
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
          // Rest-complete haptic, fired once here
          if (haptic) void hapticRestComplete()
          // Say what's next, so the phone can stay in a pocket
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
  // Before the "no exercises" branch: finishing clears the selection
  if (isFinishing) {
    // One frame of hand-off to the Finish screen, which renders the same card
    return (
      <SaveToCalendar
        pending
        onSettled={() => {}}
        headline="Ending session"
      />
    )
  }

  // ── START FAILED ──
  if (startError) {
    return (
      <div className="flex-1 bg-dark-900 flex items-center justify-center px-5">
        <div className="text-center max-w-[320px]">
          <AlertTriangleIcon className="w-9 h-9 mb-4 mx-auto text-brand-yellow" />
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
  // The same card as the Finish screen, with a spinning arc
  if (isStarting || (!sessionId && selectedExercises.length > 0)) {
    return (
      <SessionStatus
        headline="Starting workout…"
        detail={`${selectedExercises.length} ${selectedExercises.length === 1 ? 'exercise' : 'exercises'}`}
        spin
      />
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

  // Set-failure toast: red means the set was lost (act now); amber means it is
  // queued on the phone and will send itself
  const errorToast = logError ? (
    <div className="fixed bottom-[calc(var(--bottom-nav-h)+0.75rem)] left-4 right-4 z-50 flex items-start gap-3 px-4 py-3.5
                    rounded-card border border-brand-red/50 bg-[#2a1a1a] shadow-lg">
      <AlertTriangleIcon className="w-4 h-4" />
      <p className="flex-1 text-[13px] text-white leading-snug">{logError}</p>
      <button onClick={clearErrors} className="text-dark-300 text-lg leading-none px-1">×</button>
    </div>
  ) : queuedSetCount > 0 ? (
    <div className="fixed bottom-[calc(var(--bottom-nav-h)+0.75rem)] left-4 right-4 z-50 flex items-start gap-3 px-4 py-3.5
                    rounded-card border border-brand-orange/40 bg-[#2a2118] shadow-lg">
      <WifiOffIcon className="w-4 h-4" />
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
    registerVoice,
  }
  const modalityView = (() => {
    switch (currentExercise.exercise.modality) {
      case 'Calisthenics': return <CalisthenicsView {...modalityProps} />
      case 'Mobility':     return <MobilityView {...modalityProps} />
      case 'Cardio':       return <CardioView {...modalityProps} />
      case 'WOD':          return <WodView {...modalityProps} />
      // 'Strength' and anything else use the strength UI below
      default:             return null
    }
  })()
  if (modalityView) return <>{modalityView}{endArmedBanner}{errorToast}</>


  const ex = currentExercise.exercise
  const cur = currentSetPlan ?? { reps: 0, weight: 0, rpe: 7, restSeconds: 90 }
  const muscle = ex.muscles.map(m => m.name).join(' · ')
  const totalSets = currentExercise.sets.length

  // Quick chips: one step down, the value, two up, in ascending order. Anchored
  // to the set's starting value, re-centring only when the value leaves them or
  // the set changes. (The ref is written during render with render-derived
  // values, so StrictMode's double render is harmless.)
  const chipKey = `${currentExerciseIndex}:${currentSetIndex}`
  const anchor = chipAnchor.current
  const chipsFor = (base: { weight: number; reps: number }) => ({
    weight: Array.from(new Set([
      Math.max(0, nextLoad(base.weight, -1)),
      base.weight,
      nextLoad(base.weight, 1),
      nextLoad(nextLoad(base.weight, 1), 1),
    ])),
    reps: Array.from(new Set([
      Math.max(1, base.reps - 2), base.reps, base.reps + 2, base.reps + 4,
    ])),
  })
  if (!anchor || anchor.key !== chipKey) {
    chipAnchor.current = { key: chipKey, weight: cur.weight, reps: cur.reps }
  } else {
    const held = chipsFor(anchor)
    chipAnchor.current = {
      key: chipKey,
      weight: held.weight.includes(cur.weight) ? anchor.weight : cur.weight,
      reps: held.reps.includes(cur.reps) ? anchor.reps : cur.reps,
    }
  }
  const { weight: weightChips, reps: repChips } = chipsFor(chipAnchor.current!)

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
          <ListIcon className="w-4 h-4" /> All exercises
        </button>
      </div>

      {/* Last time's note, then today's — about the exercise, so above the set card */}
      <PreviousNote key={`prev-${ex.id}`} exerciseId={ex.id} />
      <ExerciseNotes
        ref={notesRef}
        // Remounts per exercise, so a draft never carries over
        key={currentExercise.workoutExerciseId ?? ex.id}
        value={currentExercise.notes ?? ''}
        onSave={notes => setExerciseNotes(currentExerciseIndex, notes)}
      />

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
                onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { weight: Math.max(0, nextLoad(cur.weight, -1)) })}
                className="w-10 h-10 sm:w-[46px] sm:h-[46px] flex-shrink-0 rounded-btn border border-dark-600
                           bg-dark-700 text-xl sm:text-2xl font-bold active:scale-90 transition-transform">−</button>
              <div className="flex-1 min-w-0">
                <NumberField kind="weight" label="Weight" value={cur.weight}
                  onChange={weight => updateSet(currentExerciseIndex, currentSetIndex, { weight })}
                  className="text-[22px] sm:text-[26px] font-extrabold" />
              </div>
              <button
                onClick={() => updateSet(currentExerciseIndex, currentSetIndex, { weight: nextLoad(cur.weight, 1) })}
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
              <div className="flex-1 min-w-0">
                <NumberField kind="reps" label="Reps" value={cur.reps}
                  onChange={reps => updateSet(currentExerciseIndex, currentSetIndex, { reps })}
                  className="text-[22px] sm:text-[26px] font-extrabold" />
              </div>
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
          {/* The strip shows mic state and opens the command list */}
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
        {/* Opens the note field above */}
        <button
          onClick={() => notesRef.current?.open()}
          className="py-3.5 rounded-btn border border-dark-600 bg-dark-800
                     text-sm font-semibold active:scale-95 transition-transform
                     flex items-center justify-center gap-1.5">
          <NoteIcon className="w-4 h-4" /> Note
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
 * The live voice strip: reports the mic state, rotates example phrases while
 * idle, and answers a missed command with one that works. Tapping it opens
 * the full command list.
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

  // Rotate slowly, only while idle
  useEffect(() => {
    if (!listening || busy) return
    const id = setInterval(
      () => setExampleIndex(i => (i + 1) % ROTATING_EXAMPLES.length),
      7000
    )
    return () => clearInterval(id)
  }, [listening, busy])

  if (!enabled) return null
  // Unsupported devices were already told on the Start screen
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
      {blocked || broken
        ? <MicOffIcon className="w-4 h-4" />
        : <MicIcon className="w-4 h-4" />}
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] truncate" style={{ color }}>{message}</span>
        {/* After a miss: suggest a phrase that works */}
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

/** Local copy, to avoid re-exporting the recogniser's union. */
type VoiceStateLike = 'idle' | 'listening' | 'unsupported' | 'denied' | 'failed'

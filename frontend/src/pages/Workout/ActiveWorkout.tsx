import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { useFatigueStore } from '../../store/useFatigueStore'
import RestTimer from './RestTimer'

export default function ActiveWorkout() {
  const navigate = useNavigate()
  const {
    selectedExercises, sessionId, sessionStartTime,
    currentExerciseIndex, currentSetIndex,
    completedSets, startSession, completeSet, finishSession
  } = useWorkoutStore()

  const { fetchFatigue } = useFatigueStore()

  // UI state
  const [isStarting, setIsStarting] = useState(false)
  const [showRest, setShowRest] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [finishData, setFinishData] = useState<any>(null)
  const [showAll, setShowAll] = useState(false)

  // Current set values
  const currentExercise = selectedExercises[currentExerciseIndex]
  const currentSetPlan = currentExercise?.sets[currentSetIndex]

  const [weight, setWeight] = useState(currentSetPlan?.weight ?? 60)
  const [reps, setReps] = useState(currentSetPlan?.reps ?? 10)
  const [rpe, setRpe] = useState(currentSetPlan?.rpe ?? 7)

  // Workout timer
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Start session on mount if not already started
    if (!sessionId && selectedExercises.length > 0) {
      setIsStarting(true)
      startSession().finally(() => setIsStarting(false))
    }
  }, [])

  useEffect(() => {
    // Start elapsed timer
    timerRef.current = setInterval(() => {
      if (sessionStartTime) {
        setElapsed(Math.floor((Date.now() - sessionStartTime.getTime()) / 1000))
      }
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [sessionStartTime])

  // Update weight/reps/rpe when set changes
  useEffect(() => {
    if (currentSetPlan) {
      setWeight(currentSetPlan.weight)
      setReps(currentSetPlan.reps)
      setRpe(currentSetPlan.rpe)
    }
  }, [currentExerciseIndex, currentSetIndex])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const isSetDone = (exIdx: number, setIdx: number) =>
    completedSets.some(
      cs => cs.exerciseId === selectedExercises[exIdx]?.exercise.id
        && cs.setIndex === setIdx
    )

  const handleSetDone = async () => {
    await completeSet({
      reps, weight, rpe,
      restSeconds: currentSetPlan?.restSeconds ?? 90
    })

    // Move to rest timer
    setShowRest(true)
  }

  const handleRestDone = () => {
    setShowRest(false)

    const currentEx = selectedExercises[currentExerciseIndex]
    const totalSets = currentEx.sets.length

    if (currentSetIndex < totalSets - 1) {
      // Next set of same exercise
      useWorkoutStore.setState({ currentSetIndex: currentSetIndex + 1 })
    } else if (currentExerciseIndex < selectedExercises.length - 1) {
      // Next exercise
      useWorkoutStore.setState({
        currentExerciseIndex: currentExerciseIndex + 1,
        currentSetIndex: 0
      })
    }
    // If last set of last exercise, user taps "End"
  }

  const handleFinish = async () => {
    setIsFinishing(true)
    try {
      const result = await finishSession()
      await fetchFatigue() // refresh muscle map
      setFinishData(result)
    } catch (err) {
      console.error('finish error:', err)
    } finally {
      setIsFinishing(false)
    }
  }

  const rpeColors = [
    '', '#4ade80','#4ade80','#86efac','#86efac',
    '#facc15','#facc15','#f97316','#facc15','#ef4444','#ef4444'
  ]
  const rpeLabels = [
    '','Easy','Easy','Light','Light',
    'Moderate','Moderate','Challenging','Hard','Very Hard','Max'
  ]

  //   FINISH SCREEN 
  if (finishData) {
    return (
      <div className="min-h-853 bg-dark-900 flex flex-col px-5">
        <div className="pt-16 text-center mb-6">
          <div className="text-6xl mb-3">🏆</div>
          <h1 className="text-white text-2xl font-bold">Workout Complete!</h1>
          <p className="text-dark-300 text-sm mt-1">
            {formatTime(elapsed)} · {selectedExercises.length} exercises
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#0d2218] border border-brand-teal/30 rounded-card p-4 text-center">
            <p className="text-brand-teal text-2xl font-bold">
              {finishData.totalVolume?.toLocaleString() ?? 0}
            </p>
            <p className="text-dark-400 text-xs mt-1">Total Volume (kg)</p>
          </div>
          <div className="bg-dark-800 rounded-card p-4 text-center">
            <p className="text-brand-yellow text-2xl font-bold">
              {finishData.avgRpe ?? '—'}
            </p>
            <p className="text-dark-400 text-xs mt-1">Avg RPE</p>
          </div>
          <div className="bg-dark-800 rounded-card p-4 text-center">
            <p className="text-white text-2xl font-bold">{completedSets.length}</p>
            <p className="text-dark-400 text-xs mt-1">Sets Completed</p>
          </div>
          <div className="bg-dark-800 rounded-card p-4 text-center">
            <p className="text-white text-2xl font-bold">{formatTime(elapsed)}</p>
            <p className="text-dark-400 text-xs mt-1">Duration</p>
          </div>
        </div>

        {/* Muscles affected */}
        {finishData.musclesAffected?.length > 0 && (
          <div className="bg-[#2a1a0a] border border-brand-orange/30
                          rounded-card p-4 mb-4">
            <p className="text-brand-orange text-sm font-semibold mb-3">
              🔥 Muscle Map Updated
            </p>
            <div className="flex gap-2 flex-wrap">
              {finishData.musclesAffected.map((m: any) => (
                <span key={m.muscleId}
                  className={`border rounded-lg px-2 py-1 text-xs font-semibold
                             ${m.newLevel >= 70
                               ? 'bg-brand-red/20 text-brand-red border-brand-red/50'
                               : m.newLevel >= 35
                               ? 'bg-brand-yellow/20 text-brand-yellow border-brand-yellow/50'
                               : 'bg-brand-green/20 text-brand-green border-brand-green/50'
                             }`}>
                  {m.muscleName} {m.newLevel >= 70 ? '🔴' : m.newLevel >= 35 ? '🟡' : '🟢'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* AI feedback */}
        <div className="bg-[#0a2a22] border border-brand-teal/30 rounded-card p-4 mb-6">
          <p className="text-brand-teal text-sm font-semibold mb-2">🤖 AI Feedback</p>
          <p className="text-dark-200 text-sm leading-relaxed">
            {finishData.avgRpe >= 8
              ? 'Excellent session! High intensity work. Schedule at least 48h recovery before training these muscles again.'
              : finishData.avgRpe >= 6
              ? 'Good session! Moderate intensity. Your muscles should recover within 24-36 hours.'
              : 'Light session completed. Perfect for active recovery. You can train again tomorrow.'}
          </p>
        </div>

        <button
          onClick={() => {
            useWorkoutStore.getState().clearExercises()
            navigate('/')
          }}
          className="w-full bg-brand-teal text-black font-bold py-4
                     rounded-btn active:scale-95 transition-transform"
        >
          Done →
        </button>
      </div>
    )
  }

  //   REST TIMER SCREEN 
  if (showRest) {
    return (
      <RestTimer
        seconds={currentSetPlan?.restSeconds ?? 90}
        nextSet={currentExercise?.sets[currentSetIndex + 1]}
        nextExercise={
          currentSetIndex >= (currentExercise?.sets.length ?? 0) - 1
            ? selectedExercises[currentExerciseIndex + 1]?.exercise.name
            : undefined
        }
        setInfo={{
          exercise: currentExercise?.exercise.name ?? '',
          setNumber: currentSetIndex + 1,
          reps: reps,
          weight: weight,
          rpe: rpe
        }}
        workoutTime={formatTime(elapsed)}
        onDone={handleRestDone}
        onSkip={handleRestDone}
      />
    )
  }

  //   LOADING 
  if (isStarting || !sessionId) {
    return (
      <div className="min-h-dvh bg-dark-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">💪</div>
          <p className="text-white font-semibold">Starting workout...</p>
        </div>
      </div>
    )
  }

  //   NO EXERCISES 
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

  const totalSets = currentExercise.sets.length
  const prevSet = currentExercise.sets[currentSetIndex - 1]
  const isLastSet =
    currentExerciseIndex === selectedExercises.length - 1
    && currentSetIndex === totalSets - 1

  //   ACTIVE WORKOUT SCREEN 
  return (
    <div className="min-h-853 bg-dark-900 flex flex-col">

      {/* Top bar */}
      <div className="px-5 pt-4 pb-3 flex justify-between items-end
                      border-b border-dark-700 bg-dark-900">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-brand-red rounded-full animate-pulse" />
            <span className="text-brand-red text-xs font-semibold uppercase">Live</span>
          </div>
          <p className="text-dark-300 text-xs">Workout time</p>
          <p className="text-white text-3xl font-bold tracking-wider">
            {formatTime(elapsed)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-dark-300 text-xs">Exercise</p>
          <p className="text-white text-2xl font-bold">
            {currentExerciseIndex + 1}
            <span className="text-dark-500 text-base">
              /{selectedExercises.length}
            </span>
          </p>
        </div>
      </div>

      {/* Exercise name + set progress */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white text-2xl font-bold">
            {currentExercise.exercise.name}
          </h2>
          <button
            onClick={() => setShowAll(!showAll)}
            className="bg-dark-800 border border-dark-600 rounded-lg
                       px-3 py-1.5 text-dark-300 text-xs"
          >
            All
          </button>
        </div>

        {/* Set progress pills */}
        <div className="flex gap-2 mb-1">
          {currentExercise.sets.map((_, i) => (
            <div key={i} className="flex-1 relative">
              <div className={`h-1.5 rounded-full transition-all
                ${isSetDone(currentExerciseIndex, i)
                  ? 'bg-brand-teal'
                  : i === currentSetIndex
                  ? 'bg-brand-teal/40'
                  : 'bg-dark-700'
                }`} />
              {i === currentSetIndex && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2
                                -translate-y-1/2 w-2 h-2 bg-brand-teal rounded-full" />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between">
          {currentExercise.sets.map((_, i) => (
            <span key={i} className={`text-[10px] flex-1 text-center
              ${i === currentSetIndex ? 'text-brand-teal font-semibold'
                : isSetDone(currentExerciseIndex, i) ? 'text-brand-teal/60'
                : 'text-dark-500'}`}>
              Set {i + 1}{i === currentSetIndex ? ' ←' : ''}
              {isSetDone(currentExerciseIndex, i) ? ' ✓' : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Main set card */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <div className="bg-dark-800 border border-dark-600 rounded-card overflow-hidden">

          {/* Set header */}
          <div className="bg-brand-teal/10 border-b border-brand-teal/20
                          px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-brand-teal rounded-lg flex items-center
                              justify-center text-black font-bold text-sm">
                {currentSetIndex + 1}
              </div>
              <span className="text-white font-semibold">Current Set</span>
            </div>
            {prevSet && (
              <span className="text-dark-400 text-xs">
                Prev: {prevSet.reps} reps @ {prevSet.weight}kg
              </span>
            )}
          </div>

          <div className="p-4">

            {/* Weight + Reps controls */}
            <div className="flex gap-3 mb-4">

              {/* Weight */}
              <div className="flex-1 bg-dark-700 rounded-xl p-3">
                <p className="text-dark-300 text-xs uppercase tracking-wider
                               text-center mb-2">Weight (kg)</p>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setWeight(w => Math.max(0, Math.round((w - 2.5) * 2) / 2))}
                    className="w-9 h-9 bg-dark-600 border border-dark-500 rounded-xl
                               text-white text-xl active:scale-90 transition-transform
                               flex items-center justify-center"
                  >−</button>
                  <span className="text-white text-2xl font-bold">{weight}</span>
                  <button
                    onClick={() => setWeight(w => Math.round((w + 2.5) * 2) / 2)}
                    className="w-9 h-9 bg-dark-600 border border-dark-500 rounded-xl
                               text-white text-xl active:scale-90 transition-transform
                               flex items-center justify-center"
                  >+</button>
                </div>
                {/* Quick presets */}
                <div className="flex gap-1 mt-2 justify-center">
                  {[currentSetPlan?.weight ?? 60].concat(
                    [5, 2.5, -2.5, -5].map(d => (currentSetPlan?.weight ?? 60) + d)
                  ).slice(0, 4).map(v => (
                    <button key={v}
                      onClick={() => setWeight(Math.max(0, v))}
                      className={`flex-1 py-1 rounded-lg text-[10px] font-semibold
                                 ${weight === v
                                   ? 'bg-brand-teal text-black'
                                   : 'bg-dark-600 text-dark-400'
                                 }`}>
                      {Math.max(0, v)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reps */}
              <div className="flex-1 bg-dark-700 rounded-xl p-3">
                <p className="text-dark-300 text-xs uppercase tracking-wider
                               text-center mb-2">Reps</p>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setReps(r => Math.max(1, r - 1))}
                    className="w-9 h-9 bg-dark-600 border border-dark-500 rounded-xl
                               text-white text-xl active:scale-90 transition-transform
                               flex items-center justify-center"
                  >−</button>
                  <span className="text-white text-2xl font-bold">{reps}</span>
                  <button
                    onClick={() => setReps(r => r + 1)}
                    className="w-9 h-9 bg-dark-600 border border-dark-500 rounded-xl
                               text-white text-xl active:scale-90 transition-transform
                               flex items-center justify-center"
                  >+</button>
                </div>
                {/* Quick presets */}
                <div className="flex gap-1 mt-2 justify-center">
                  {[6, 8, 10, 12].map(v => (
                    <button key={v}
                      onClick={() => setReps(v)}
                      className={`flex-1 py-1 rounded-lg text-[10px] font-semibold
                                 ${reps === v
                                   ? 'bg-brand-teal text-black'
                                   : 'bg-dark-600 text-dark-400'
                                 }`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* RPE selector */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-dark-300 text-xs uppercase tracking-wider">
                  RPE
                </span>
                <span className="text-sm font-bold"
                  style={{ color: rpeColors[rpe] }}>
                  {rpe} — {rpeLabels[rpe]}
                </span>
              </div>
              <div className="flex gap-1">
                {[1,2,3,4,5,6,7,8,9,10].map(v => (
                  <button
                    key={v}
                    onClick={() => setRpe(v)}
                    className="flex-1 h-8 rounded-lg text-xs font-bold
                               transition-all active:scale-90"
                    style={{
                      background: rpe === v
                        ? rpeColors[v]
                        : rpeColors[v] + '33',
                      color: rpe === v ? '#000' : rpeColors[v]
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Volume preview */}
            {/* <div className="bg-[#0d2218] border border-brand-teal/20
                            rounded-xl px-4 py-3 flex justify-between
                            items-center mb-4">
              <span className="text-dark-300 text-sm">Set volume</span>
              <span className="text-brand-teal font-bold">
                {(reps * weight).toLocaleString()} kg
              </span>
              <span className="text-dark-500 text-xs">
                Total: {completedSets.length > 0
                  ? `${completedSets.length} sets done`
                  : 'None yet'}
              </span>
            </div> */}

            {/* Voice hint */}
            <div className="bg-dark-700 border border-dark-600 rounded-xl
                            px-3 py-2.5 flex items-center gap-2 mb-4">
              <span className="text-base">🎤</span>
              <span className="text-dark-400 text-xs flex-1">
                Say "Set done" to log this set
              </span>
              <div className="w-2 h-2 bg-dark-500 rounded-full" />
            </div>

            {/* Complete / End button */}
            <button
              onClick={isLastSet ? handleFinish : handleSetDone}
              disabled={isLastSet && isFinishing}
              className={`w-full font-bold py-4 rounded-btn text-base
                         active:scale-95 transition-transform
                         ${isLastSet
                           ? 'bg-[#2a1a1a] border border-brand-red/40 text-brand-red'
                           : 'bg-brand-teal text-black'
                         }`}
            >
              {isLastSet
                ? (isFinishing ? 'Saving...' : '⏹ End')
                : '✓ Set Done — Start Rest'}
            </button>
          </div>
        </div>

        {!isLastSet && (
          <div className="mt-3 bg-dark-800 rounded-card px-4 py-3
                          flex items-center gap-3 border border-dark-600">
            <div className="flex-1">
              <p className="text-dark-500 text-xs uppercase">Up next</p>
              <p className="text-dark-200 text-sm font-medium">
                {currentSetIndex < totalSets - 1
                  ? `Set ${currentSetIndex + 2} · ${currentExercise.sets[currentSetIndex + 1]?.weight}kg · ${currentExercise.sets[currentSetIndex + 1]?.reps} reps`
                  : selectedExercises[currentExerciseIndex + 1]
                  ? `${selectedExercises[currentExerciseIndex + 1].exercise.name}`
                  : 'Last set — finish after this!'
                }
              </p>
            </div>
            <div className="w-px h-8 bg-dark-600" />
            {currentExerciseIndex < selectedExercises.length - 1 && (
              <div>
                <p className="text-dark-500 text-xs uppercase">Then</p>
                <p className="text-dark-400 text-xs">
                  {selectedExercises[currentExerciseIndex + 1]?.exercise.name}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Note + End row */}
        {isLastSet ? (
          <div className="mt-3">
            <button className="w-full bg-dark-800 border border-dark-600
                               rounded-btn py-3 text-dark-400 text-sm">
              📝 Note
            </button>
          </div>
        ) : (
          <div className="flex gap-3 mt-3">
            <button className="flex-1 bg-dark-800 border border-dark-600
                               rounded-btn py-3 text-dark-400 text-sm">
              📝 Note
            </button>
            <button
              onClick={handleFinish}
              disabled={isFinishing}
              className="flex-1 bg-[#2a1a1a] border border-brand-red/40
                         rounded-btn py-3 text-brand-red text-sm font-semibold
                         active:scale-95 transition-transform disabled:opacity-50"
            >
              {isFinishing ? 'Saving...' : '⏹ End'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
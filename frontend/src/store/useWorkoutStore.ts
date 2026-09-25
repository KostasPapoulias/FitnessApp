import { create } from 'zustand'
import { Exercise, WorkoutSession, WorkoutTemplate } from '../types'
import { PlanSuggestion, workoutService } from '../services/workout.service'
import { TemplateInput, templateService } from '../services/template.service'
import { RunSummary } from '../hooks/useRunTracker'
import { toRunPayload } from '../lib/runPayload'
import {
  dequeueSet, enqueueSet, isRetriableFailure, queuedSets, recordAttempt,
} from '../lib/setQueue'

interface PlannedSet {
  reps: number
  weight: number
  rpe: number
  restSeconds: number
}

export interface SelectedExercise {
  exercise: Exercise
  sets: PlannedSet[]
  workoutExerciseId?: string // set after session starts
  skipped?: boolean
  /** Ticked off in quick log (nothing is sent until Finish). */
  done?: boolean
  /** This session's note on the exercise, kept locally so it survives the PATCH and navigation. */
  notes?: string
  /** True once the athlete edits a number; suggestions only overwrite untouched exercises. */
  edited?: boolean
  /** Why the suggested numbers are what they are (shown on Plan Sets). */
  suggestion?: {
    basis: 'progression' | 'repeat' | 'deload' | 'return' | 'estimate' | 'default'
    note: string
    e1rm: number | null
    lastPerformed: string | null
  }
}

export type CardioTarget = { type: 'distance' | 'time'; value: number }
export type WodFormat = 'amrap' | 'fortime' | 'emom' | 'rounds'
export type WodConfig = { format: WodFormat; capSec: number; targetRounds: number }

// Placeholder sets per modality until the server's suggestion arrives.
// Strength opens at 0 kg — never a guessed weight.
function defaultSetsFor(modality: string): PlannedSet[] {
  switch (modality) {
    case 'Calisthenics':
      return [
        { reps: 10, weight: 0, rpe: 7, restSeconds: 75 },
        { reps: 8,  weight: 0, rpe: 8, restSeconds: 75 },
        { reps: 8,  weight: 0, rpe: 8, restSeconds: 75 },
      ]
    case 'Mobility':
      // reps = hold seconds; no rest between rounds
      return [{ reps: 30, weight: 0, rpe: 5, restSeconds: 0 }]
    case 'Cardio':
      return [{ reps: 0, weight: 0, rpe: 6, restSeconds: 0 }]
    case 'WOD':
      // reps = reps per round
      return [{ reps: 10, weight: 0, rpe: 8, restSeconds: 0 }]
    case 'Strength':
    default:
      return [
        { reps: 12, weight: 0, rpe: 7, restSeconds: 90 },
        { reps: 10, weight: 0, rpe: 8, restSeconds: 90 },
        { reps: 8,  weight: 0, rpe: 9, restSeconds: 90 },
      ]
  }
}

interface WorkoutStore {
  // Selection phase
  activeSession: WorkoutSession | null
  selectedExercises: SelectedExercise[]
  startError: string | null
  logError: string | null
  /** Sets saved on the phone because the network was down; surfaced in the UI. */
  queuedSetCount: number
  /** Send everything in the outbox. Safe any time — the API upserts sets. */
  flushSetQueue: () => Promise<number>
  clearErrors: () => void
  addExercise: (exercise: Exercise) => void
  setSingleExercise: (exercise: Exercise) => void // replace selection with one (cardio)
  removeExercise: (exerciseId: string) => void
  clearExercises: () => void
  updateSets: (exerciseId: string, sets: PlannedSet[]) => void

  // Per-modality plan config
  cardioTarget: CardioTarget | null
  wodConfig: WodConfig | null
  setCardioTarget: (t: CardioTarget | null) => void
  setWodConfig: (c: WodConfig | null) => void

  // Set when the planner was filled from a template, so the session can be attributed to it
  sourceTemplateId: string | null
  sourceScheduledId: string | null
  /** Fill the planner from a saved plan, ready for the athlete to start it. */
  loadTemplate: (template: WorkoutTemplate, scheduledId?: string | null) => void
  /** Save the current plan as a template. */
  saveAsTemplate: (name: string, notes?: string) => Promise<WorkoutTemplate>

  // Set / exercise editing (index-based)
  updateSet: (exIdx: number, setIdx: number, patch: Partial<PlannedSet>) => void
  addSet: (exIdx: number) => void
  removeSet: (exIdx: number, setIdx: number) => void
  setExerciseRest: (exIdx: number, restSeconds: number) => void
  /**
   * Write an exercise note: store first (never rolled back), then the server.
   * Resolves false if the PATCH failed.
   */
  setExerciseNotes: (exIdx: number, notes: string) => Promise<boolean>
  /** Replace untouched defaults with history-based suggestions. */
  loadSuggestions: () => Promise<void>
  suggestionsLoading: boolean
  removeExerciseAt: (exIdx: number) => void
  toggleSkip: (exIdx: number) => void

  /**
   * Quick log: no set card, rest timer or clock; everything is logged at Finish.
   * A store flag so it survives browsing and steers the nav's centre button.
   */
  quickLog: boolean
  setQuickLog: (on: boolean) => void
  toggleDone: (exIdx: number) => void
  swapExercise: (exIdx: number, exercise: Exercise) => void
  reorderExercises: (from: number, to: number) => void
  setCurrent: (exIdx: number, setIdx?: number) => void

  // Active session phase
  sessionId: string | null
  sessionStartTime: Date | null
  currentExerciseIndex: number
  currentSetIndex: number
  completedSets: { exerciseId: string; setIndex: number }[]

  /**
   * `registerExercises: false` opens the session with no exercises attached
   * (quick log registers each one when its sets are logged, so unticked
   * exercises never become empty history rows).
   */
  startSession: (opts?: { registerExercises?: boolean }) => Promise<void>
  registerExercise: (exIdx: number) => Promise<string>
  completeSet: (
    data: {
      rpe?: number
      restSeconds?: number
      reps?: number       // reps; also mobility hold seconds, WOD reps per round, cardio count
      weight?: number     // strength weight; also carries calisthenics added load
      addedWeight?: number
      duration?: number   // mobility hold seconds / calisthenics isometric hold seconds
      distance?: number   // cardio / wod
      time?: number       // cardio / wod
      rounds?: number     // wod rounds completed
      /** The recorded run for a cardio set. */
      run?: RunSummary
    },
    // A metcon logs a set against every movement, not just the current one
    target?: { exIdx: number; setIdx: number }
  ) => Promise<boolean>
  finishSession: () => Promise<any>
  nextExercise: () => void
}

// Guards against concurrent startSession() calls (StrictMode, remounts).
let startInFlight: Promise<void> | null = null

// Same guard for finishing (double taps, remounts); the backend also refuses a
// second finish.
let finishInFlight: Promise<any> | null = null

const DEFAULT_SET: PlannedSet = { reps: 10, weight: 20, rpe: 7, restSeconds: 90 }

// Keep only a suggestion's explanation, without its sets.
const toMeta = (s: PlanSuggestion): SelectedExercise['suggestion'] => ({
  basis: s.basis,
  note: s.note,
  e1rm: s.e1rm,
  lastPerformed: s.lastPerformed,
})

// Exercise modality → backend SetType enum
const MODALITY_SET_TYPE: Record<string, string> = {
  Strength: 'STRENGTH',
  Calisthenics: 'CALISTHENICS',
  Cardio: 'CARDIO',
  WOD: 'WOD',
  Mobility: 'MOBILITY',
}

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  activeSession: null,
  selectedExercises: [],
  suggestionsLoading: false,
  queuedSetCount: 0,
  sessionId: null,
  sessionStartTime: null,
  currentExerciseIndex: 0,
  currentSetIndex: 0,
  completedSets: [],
  cardioTarget: null,
  wodConfig: null,
  startError: null,
  logError: null,
  sourceTemplateId: null,
  sourceScheduledId: null,
  quickLog: false,

  clearErrors: () => set({ startError: null, logError: null }),

  setQuickLog: (quickLog) => set({ quickLog }),

  loadTemplate: (template, scheduledId = null) => {
    const selectedExercises: SelectedExercise[] = template.exercises.map(te => ({
      exercise: te.exercise,
      skipped: false,
      // Edited, so suggestions never overwrite a deliberately saved plan
      edited: true,
      sets: te.sets.map(s => ({
        reps: s.reps ?? 0,
        weight: s.weight ?? 0,
        rpe: s.rpe ?? 7,
        restSeconds: s.restSeconds ?? 90,
      })),
    }))

    // Cardio and WOD targets are stored on the first set; restore them
    const first = template.exercises[0]
    const firstSet = first?.sets[0]
    const modality = first?.exercise.modality

    set({
      selectedExercises,
      sourceTemplateId: template.id,
      sourceScheduledId: scheduledId,
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      completedSets: [],
      cardioTarget:
        modality === 'Cardio' && firstSet
          ? firstSet.distance
            ? { type: 'distance', value: firstSet.distance / 1000 }
            : firstSet.time
              ? { type: 'time', value: firstSet.time }
              : null
          : null,
      wodConfig: null,
      startError: null,
      logError: null,
      // Clear any quick-log flag left from an abandoned session
      quickLog: false,
    })
  },

  saveAsTemplate: async (name, notes) => {
    const { selectedExercises, cardioTarget } = get()

    const input: TemplateInput = {
      name,
      notes: notes ?? null,
      exercises: selectedExercises
        .filter(se => !se.skipped)
        .map(se => ({
          exerciseId: se.exercise.id,
          sets: se.sets.map(s => ({
            reps: s.reps,
            weight: s.weight,
            rpe: s.rpe,
            restSeconds: s.restSeconds,
            // Cardio's target is saved on the first set
            distance: se.exercise.modality === 'Cardio' && cardioTarget?.type === 'distance'
              ? cardioTarget.value * 1000
              : null,
            time: se.exercise.modality === 'Cardio' && cardioTarget?.type === 'time'
              ? cardioTarget.value
              : null,
          })),
        })),
    }

    const template = await templateService.create(input)
    set({ sourceTemplateId: template.id })
    return template
  },

  addExercise: (exercise) => {
    if (get().selectedExercises.find(e => e.exercise.id === exercise.id)) return
    set(state => ({
      selectedExercises: [...state.selectedExercises, {
        exercise,
        skipped: false,
        sets: defaultSetsFor(exercise.modality),
      }]
    }))
  },

  setSingleExercise: (exercise) => set({
    selectedExercises: [{ exercise, skipped: false, sets: defaultSetsFor(exercise.modality) }],
  }),

  setCardioTarget: (cardioTarget) => set({ cardioTarget }),
  setWodConfig: (wodConfig) => set({ wodConfig }),

  removeExercise: (exerciseId) => set(state => ({
    selectedExercises: state.selectedExercises.filter(
      e => e.exercise.id !== exerciseId
    )
  })),

  clearExercises: () => set({
    activeSession: null,
    selectedExercises: [],
    sessionId: null,
    sessionStartTime: null,
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    completedSets: [],
    cardioTarget: null,
    wodConfig: null,
    startError: null,
    logError: null,
    sourceTemplateId: null,
    sourceScheduledId: null,
    quickLog: false,
  }),

  updateSets: (exerciseId, sets) => set(state => ({
    selectedExercises: state.selectedExercises.map(e =>
      e.exercise.id === exerciseId ? { ...e, sets } : e
    )
  })),

  // ── index-based editing helpers ─────────────────────────────────────────
  updateSet: (exIdx, setIdx, patch) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) =>
      i !== exIdx ? e : {
        ...e,
        // Mark as edited so an in-flight suggestion can't overwrite it
        edited: true,
        sets: e.sets.map((s, j) => j !== setIdx ? s : { ...s, ...patch })
      }
    )
  })),

  addSet: (exIdx) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) => {
      if (i !== exIdx) return e
      const last = e.sets[e.sets.length - 1] ?? DEFAULT_SET
      // Adding a set counts as editing (so quick log's reload keeps it)
      return { ...e, edited: true, sets: [...e.sets, { ...last }] }
    })
  })),

  removeSet: (exIdx, setIdx) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) =>
      i !== exIdx ? e : {
        ...e,
        edited: true,
        sets: e.sets.length > 1 ? e.sets.filter((_, j) => j !== setIdx) : e.sets
      }
    )
  })),

  // Fetched when Plan Sets opens, not per exercise tap
  loadSuggestions: async () => {
    const { selectedExercises } = get()
    // Only strength and calisthenics have reps × load to progress
    const eligible = selectedExercises.filter(e =>
      e.exercise.modality === 'Strength' || e.exercise.modality === 'Calisthenics'
    )
    if (eligible.length === 0) return

    set({ suggestionsLoading: true })
    try {
      const suggestions = await workoutService.getPlanSuggestions(
        eligible.map(e => ({ exerciseId: e.exercise.id, fallback: e.sets }))
      )
      const byId = new Map(suggestions.map(s => [s.exerciseId, s]))

      set(state => ({
        selectedExercises: state.selectedExercises.map(e => {
          const suggestion = byId.get(e.exercise.id)
          if (!suggestion) return e
          // Never overwrite numbers the athlete changed
          if (e.edited) return { ...e, suggestion: toMeta(suggestion) }
          return {
            ...e,
            sets: suggestion.sets,
            suggestion: toMeta(suggestion),
          }
        }),
        suggestionsLoading: false,
      }))
    } catch (err) {
      // On failure the modality defaults stay
      console.error('loadSuggestions error:', err)
      set({ suggestionsLoading: false })
    }
  },

  setExerciseNotes: async (exIdx, notes) => {
    // Store first, unconditionally
    set(state => ({
      selectedExercises: state.selectedExercises.map((e, i) =>
        i !== exIdx ? e : { ...e, notes }
      )
    }))

    const { sessionId, selectedExercises } = get()
    const workoutExerciseId = selectedExercises[exIdx]?.workoutExerciseId

    // No server row yet: the note is sent when the exercise is registered
    if (!sessionId || !workoutExerciseId) return true

    try {
      await workoutService.updateExerciseNotes(sessionId, workoutExerciseId, notes)
      return true
    } catch {
      return false
    }
  },

  setExerciseRest: (exIdx, restSeconds) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) =>
      i !== exIdx ? e : {
        ...e,
        sets: e.sets.map(s => ({ ...s, restSeconds: Math.max(0, restSeconds) }))
      }
    )
  })),

  removeExerciseAt: (exIdx) => set(state => {
    const arr = state.selectedExercises.filter((_, j) => j !== exIdx)
    let curEx = state.currentExerciseIndex > exIdx
      ? state.currentExerciseIndex - 1
      : state.currentExerciseIndex
    curEx = Math.min(curEx, Math.max(0, arr.length - 1))
    return { selectedExercises: arr, currentExerciseIndex: curEx }
  }),

  toggleSkip: (exIdx) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) =>
      i !== exIdx ? e : { ...e, skipped: !e.skipped }
    )
  })),

  toggleDone: (exIdx) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) =>
      // Ticking vouches for the numbers, so suggestions can't replace them
      i !== exIdx ? e : { ...e, done: !e.done, edited: true }
    )
  })),

  swapExercise: (exIdx, exercise) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) =>
      i !== exIdx ? e : { ...e, exercise, workoutExerciseId: undefined }
    )
  })),

  reorderExercises: (from, to) => {
    if (from == null || to == null || from === to) return
    set(state => {
      const arr = state.selectedExercises.slice()
      if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return {}
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      let curEx = state.currentExerciseIndex
      if (from === curEx) curEx = to
      else if (from < curEx && to >= curEx) curEx -= 1
      else if (from > curEx && to <= curEx) curEx += 1
      return { selectedExercises: arr, currentExerciseIndex: curEx }
    })
  },

  setCurrent: (exIdx, setIdx = 0) => set({
    currentExerciseIndex: exIdx,
    currentSetIndex: setIdx
  }),

  startSession: async ({ registerExercises = true } = {}) => {
    // Already running or starting: never start twice
    if (get().sessionId) return
    if (startInFlight) return startInFlight

    startInFlight = (async () => {
      try {
        set({ startError: null })
        const session = await workoutService.startSession()

        // Commit the session id before registering exercises, so a partial failure keeps a usable session
        const firstLive = get().selectedExercises.findIndex(se => !se.skipped)
        set({
          activeSession: session,
          sessionId: session.id,
          sessionStartTime: new Date(),
          currentExerciseIndex: firstLive < 0 ? 0 : firstLive,
          currentSetIndex: 0,
          completedSets: [],
        })

        // Only non-skipped exercises (skipped ones would become empty rows)
        const pending = !registerExercises ? [] : get().selectedExercises
          .map((se, i) => ({ se, i }))
          .filter(({ se }) => !se.skipped && !se.workoutExerciseId)

        const registered = await Promise.all(pending.map(async ({ se, i }) => {
          const we = await workoutService.addExercise(session.id, {
            exerciseId: se.exercise.id,
            orderIndex: i + 1,
            // Include any note typed before Start
            notes: se.notes?.trim() || undefined,
          })
          return [se.exercise.id, we.id] as const
        }))

        // Match by exercise id — the queue may have been reordered
        const idMap = new Map(registered)
        set(state => ({
          selectedExercises: state.selectedExercises.map(e => {
            const id = idMap.get(e.exercise.id)
            return id ? { ...e, workoutExerciseId: id } : e
          }),
        }))

        // Bind a standby slot to this session (best-effort; never blocks training)
        const { sourceScheduledId } = get()
        if (sourceScheduledId) {
          try {
            await templateService.start(sourceScheduledId, session.id)
          } catch (err) {
            console.error('could not attach session to scheduled workout:', err)
          }
        }
      } catch (err) {
        console.error('startSession error:', err)
        set({ startError: 'Could not start the workout. Check your connection and retry.' })
        throw err
      } finally {
        startInFlight = null
      }
    })()

    return startInFlight
  },

  // Register an exercise added after the session started, so its sets can be logged
  registerExercise: async (exIdx) => {
    const { sessionId, selectedExercises } = get()
    if (!sessionId) throw new Error('No active session')
    const se = selectedExercises[exIdx]
    if (!se) throw new Error('No such exercise')
    if (se.workoutExerciseId) return se.workoutExerciseId

    const we = await workoutService.addExercise(sessionId, {
      exerciseId: se.exercise.id,
      orderIndex: exIdx + 1,
      // Include any note already typed
      notes: se.notes?.trim() || undefined,
    })
    set(state => ({
      selectedExercises: state.selectedExercises.map(e =>
        e.exercise.id === se.exercise.id ? { ...e, workoutExerciseId: we.id } : e
      ),
    }))
    return we.id
  },

  completeSet: async (data, target) => {
    const {
      sessionId, selectedExercises,
      currentExerciseIndex, currentSetIndex
    } = get()

    // Capture the target up front; the user may navigate during the awaits
    const exIdx = target?.exIdx ?? currentExerciseIndex
    const setIdx = target?.setIdx ?? currentSetIndex

    if (!sessionId) {
      set({ logError: 'The workout hasn’t started yet — that set was not saved.' })
      return false
    }

    const currentExercise = selectedExercises[exIdx]
    if (!currentExercise) {
      set({ logError: 'No exercise selected — that set was not saved.' })
      return false
    }

    let workoutExerciseId = currentExercise.workoutExerciseId
    if (!workoutExerciseId) {
      // Added mid-workout and never registered: register it now
      try {
        workoutExerciseId = await get().registerExercise(exIdx)
      } catch (err) {
        console.error('registerExercise error:', err)
        set({ logError: 'Could not save that set — the exercise is not attached to this workout.' })
        return false
      }
    }

    const setType = MODALITY_SET_TYPE[currentExercise.exercise.modality] ?? 'STRENGTH'

    // The modality-specific payload for this SetType
    const payload: Parameters<typeof workoutService.logSet>[1] = {
      workoutExerciseId,
      setNumber: setIdx + 1,
      setType,
      rpe: data.rpe,
      restSeconds: data.restSeconds,
    }
    switch (setType) {
      case 'CALISTHENICS':
        payload.reps = data.reps ?? 0
        payload.addedWeight = data.addedWeight ?? data.weight ?? 0
        // Isometric holds send seconds instead of reps
        if (data.duration != null) payload.duration = data.duration
        break
      case 'MOBILITY':
        // reps carries hold seconds unless an explicit duration is given
        payload.duration = data.duration ?? data.reps ?? 0
        break
      case 'CARDIO':
        payload.distance = data.distance
        payload.time = data.time
        // The count, only when there is one (a stored 0 would read as "did nothing")
        if (data.reps != null && data.reps > 0) payload.reps = data.reps
        // Route, splits and pace (treadmill runs have splits without a route)
        if (data.run) payload.run = toRunPayload(data.run)
        break
      case 'WOD':
        payload.distance = data.distance
        payload.time = data.time
        // The metcon's score: reps per round and rounds
        payload.reps = data.reps
        payload.rounds = data.rounds
        // The movement's load
        payload.weight = data.weight ?? 0
        break
      case 'STRENGTH':
      default:
        payload.reps = data.reps ?? 0
        payload.weight = data.weight ?? 0
        break
    }

    try {
      await workoutService.logSet(sessionId, payload)
    } catch (err) {
      // No connection: queue it (the set is fine). A server rejection is not
      // queued — it would never succeed.
      if (!isRetriableFailure(err)) {
        console.error('logSet rejected:', err)
        set({ logError: 'That set could not be saved. Check the numbers and log it again.' })
        return false
      }

      const queued = await enqueueSet(sessionId, payload)
      if (!queued) {
        // IndexedDB unavailable: report the failure
        console.error('logSet failed and could not be queued:', err)
        set({ logError: 'That set could not be saved. Check your connection and log it again.' })
        return false
      }

      // Counted as completed, like a sent set
      set(state => ({
        logError: null,
        queuedSetCount: state.queuedSetCount + 1,
      }))
      void get().flushSetQueue()
    }

    // One entry per set, mirroring the backend's upsert
    set(state => {
      const exerciseId = currentExercise.exercise.id
      const already = state.completedSets.some(
        cs => cs.exerciseId === exerciseId && cs.setIndex === setIdx
      )
      return {
        logError: null,
        completedSets: already
          ? state.completedSets
          : [...state.completedSets, { exerciseId, setIndex: setIdx }],
      }
    })
    return true
  },

  flushSetQueue: async () => {
    const pending = await queuedSets()
    if (pending.length === 0) {
      set({ queuedSetCount: 0 })
      return 0
    }

    let sent = 0
    for (const entry of pending) {
      try {
        await workoutService.logSet(entry.sessionId, entry.payload as never)
        await dequeueSet(entry.id)
        sent++
      } catch (err) {
        if (isRetriableFailure(err)) {
          // Still offline: stop; the rest would fail the same way
          await recordAttempt(entry)
          break
        }
        // Rejected: drop it so the queue can drain
        console.error('queued set rejected, dropping:', err)
        await dequeueSet(entry.id)
      }
    }

    const remaining = await queuedSets()
    set({ queuedSetCount: remaining.length })
    return sent
  },

  nextExercise: () => {
    const { currentExerciseIndex, selectedExercises } = get()
    let ni = currentExerciseIndex + 1
    while (ni < selectedExercises.length && selectedExercises[ni].skipped) ni++
    if (ni < selectedExercises.length) {
      set({ currentExerciseIndex: ni, currentSetIndex: 0 })
    }
  },

  finishSession: async () => {
    // A finish already in flight: return the same promise
    if (finishInFlight) return finishInFlight

    const { sessionId, sessionStartTime } = get()
    if (!sessionId || !sessionStartTime) return null

    const startMs = sessionStartTime instanceof Date
      ? sessionStartTime.getTime()
      : Date.parse(String(sessionStartTime))
    const duration = Math.round((Date.now() - startMs) / 1000)
    if (!Number.isFinite(duration) || duration < 0) return null

    const { sourceScheduledId } = get()

    finishInFlight = (async () => {
      try {
        // Drain the outbox first — finishing reads sets from the database, so a
        // set still on the phone would never be counted
        await get().flushSetQueue()
        return await doFinish(sessionId, duration, set, sourceScheduledId)
      } finally {
        // Cleared on failure too, so a retry can run
        finishInFlight = null
      }
    })()

    return finishInFlight
  }
}))

// Sends the finish request and clears the workout from the store.
async function doFinish(
  sessionId: string,
  duration: number,
  set: (partial: Partial<WorkoutStore>) => void,
  scheduledId: string | null
) {
  const result = await workoutService.finishSession(sessionId, duration)

  // Close the standby slot, after the finish (a failure here must not lose the workout)
  if (scheduledId) {
    try {
      await templateService.close(scheduledId, 'completed')
    } catch (err) {
      console.error('could not close scheduled workout:', err)
    }
  }

  // Clear the whole selection, so navigating back can't start a new session on stale rows
  set({
    activeSession: null,
    sessionId: null,
    sessionStartTime: null,
    selectedExercises: [],
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    completedSets: [],
    cardioTarget: null,
    wodConfig: null,
    startError: null,
    logError: null,
    sourceTemplateId: null,
    sourceScheduledId: null,
    quickLog: false,
  })

  return result
}

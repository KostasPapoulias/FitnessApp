import { create } from 'zustand'
import { Exercise, WorkoutSession, WorkoutTemplate } from '../types'
import { PlanSuggestion, workoutService } from '../services/workout.service'
import { TemplateInput, templateService } from '../services/template.service'
import { RunSummary } from '../hooks/useRunTracker'
import { toRunPayload } from '../lib/runPayload'

interface PlannedSet {
  reps: number
  weight: number
  rpe: number
  restSeconds: number
}

interface SelectedExercise {
  exercise: Exercise
  sets: PlannedSet[]
  workoutExerciseId?: string // set after session starts
  skipped?: boolean
  /**
   * False until the athlete changes a number themselves. Server suggestions
   * only overwrite untouched sets — arriving mid-edit and resetting someone's
   * typing would be worse than showing no suggestion at all.
   */
  edited?: boolean
  /** Why the suggested numbers are what they are, shown on the plan screen. */
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

// Placeholder planned sets per modality, shown for the instant before the
// server's suggestion arrives.
//
// Strength deliberately opens at 0 kg rather than a guess. It used to seed
// 60/70/80 kg for EVERY strength movement, which offered a 60 kg lateral raise
// — and because those numbers looked deliberate, they were easy to accept
// without reading. A zero reads as "not filled in yet", which is the truth: the
// real figure comes from /workout/plan/suggestions, computed from the exercise
// and the athlete's own bodyweight, sex, age, level and experience.
function defaultSetsFor(modality: string): PlannedSet[] {
  switch (modality) {
    case 'Calisthenics':
      return [
        { reps: 10, weight: 0, rpe: 7, restSeconds: 75 },
        { reps: 8,  weight: 0, rpe: 8, restSeconds: 75 },
        { reps: 8,  weight: 0, rpe: 8, restSeconds: 75 },
      ]
    case 'Mobility':
      // reps == hold seconds for mobility; no rest between rounds
      return [{ reps: 30, weight: 0, rpe: 5, restSeconds: 0 }]
    case 'Cardio':
      return [{ reps: 0, weight: 0, rpe: 6, restSeconds: 0 }]
    case 'WOD':
      // reps == reps-per-round for a WOD movement
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
  clearErrors: () => void
  addExercise: (exercise: Exercise) => void
  setSingleExercise: (exercise: Exercise) => void // replace selection with one (cardio)
  removeExercise: (exerciseId: string) => void
  clearExercises: () => void
  updateSets: (exerciseId: string, sets: PlannedSet[]) => void

  // per-modality plan config
  cardioTarget: CardioTarget | null
  wodConfig: WodConfig | null
  setCardioTarget: (t: CardioTarget | null) => void
  setWodConfig: (c: WodConfig | null) => void

  // Saved plans. Set when the planner was filled from a template, so the
  // session that follows can be attributed to it and any standby slot closed.
  sourceTemplateId: string | null
  sourceScheduledId: string | null
  /** Fill the planner from a saved plan, ready for the athlete to start it. */
  loadTemplate: (template: WorkoutTemplate, scheduledId?: string | null) => void
  /** Freeze what is currently planned as a reusable plan. */
  saveAsTemplate: (name: string, notes?: string) => Promise<WorkoutTemplate>

  // Set / exercise editing (index-based, used by the redesigned flow)
  updateSet: (exIdx: number, setIdx: number, patch: Partial<PlannedSet>) => void
  addSet: (exIdx: number) => void
  removeSet: (exIdx: number, setIdx: number) => void
  setExerciseRest: (exIdx: number, restSeconds: number) => void
  /** Replace untouched defaults with numbers built from the athlete's history. */
  loadSuggestions: () => Promise<void>
  suggestionsLoading: boolean
  removeExerciseAt: (exIdx: number) => void
  toggleSkip: (exIdx: number) => void
  swapExercise: (exIdx: number, exercise: Exercise) => void
  reorderExercises: (from: number, to: number) => void
  setCurrent: (exIdx: number, setIdx?: number) => void

  // Active session phase
  sessionId: string | null
  sessionStartTime: Date | null
  currentExerciseIndex: number
  currentSetIndex: number
  completedSets: { exerciseId: string; setIndex: number }[]

  startSession: () => Promise<void>
  registerExercise: (exIdx: number) => Promise<string>
  completeSet: (
    data: {
      rpe?: number
      restSeconds?: number
      reps?: number       // strength / calisthenics reps; also carries mobility
                          // hold-seconds and WOD reps-per-round
      weight?: number     // strength weight; also carries calisthenics added load
      addedWeight?: number
      duration?: number   // mobility hold seconds / calisthenics isometric hold seconds
      distance?: number   // cardio / wod
      time?: number       // cardio / wod
      rounds?: number     // wod rounds completed
      /** The recorded run behind a cardio set — route, splits, average pace. */
      run?: RunSummary
    },
    // A metcon is one effort logged against every movement in it, so it needs
    // to write sets for exercises other than the "current" one.
    target?: { exIdx: number; setIdx: number }
  ) => Promise<boolean>
  finishSession: () => Promise<any>
  nextExercise: () => void
}

// Guards against concurrent startSession() calls (React StrictMode double-invokes
// mount effects, and a remount would otherwise create a second orphan session).
let startInFlight: Promise<void> | null = null

// Same guard for finishing: a double-tap, a StrictMode double-mount of the
// Finish screen, or an auto-finish racing a manual End must all resolve to a
// single POST. The backend also refuses to re-apply fatigue to an already
// finished session, so this is the first of two layers.
let finishInFlight: Promise<any> | null = null

const DEFAULT_SET: PlannedSet = { reps: 10, weight: 20, rpe: 7, restSeconds: 90 }

// Strip the sets off a server suggestion, keeping only the explanation
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

  clearErrors: () => set({ startError: null, logError: null }),

  loadTemplate: (template, scheduledId = null) => {
    const selectedExercises: SelectedExercise[] = template.exercises.map(te => ({
      exercise: te.exercise,
      skipped: false,
      // Marked as edited so loadSuggestions() cannot overwrite a plan the
      // athlete deliberately chose with numbers derived from their averages.
      edited: true,
      sets: te.sets.map(s => ({
        reps: s.reps ?? 0,
        weight: s.weight ?? 0,
        rpe: s.rpe ?? 7,
        restSeconds: s.restSeconds ?? 90,
      })),
    }))

    // Cardio and WOD carry their target outside the set rows, so lift it back
    // out of the first set rather than losing it on the round trip.
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
            // Cardio's target lives on the plan screen rather than in the set
            // rows; write it onto the first set so reloading restores it.
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
        // Touching a number marks the exercise as the athlete's, so a
        // suggestion still in flight cannot overwrite what they just typed
        edited: true,
        sets: e.sets.map((s, j) => j !== setIdx ? s : { ...s, ...patch })
      }
    )
  })),

  addSet: (exIdx) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) => {
      if (i !== exIdx) return e
      const last = e.sets[e.sets.length - 1] ?? DEFAULT_SET
      return { ...e, sets: [...e.sets, { ...last }] }
    })
  })),

  removeSet: (exIdx, setIdx) => set(state => ({
    selectedExercises: state.selectedExercises.map((e, i) =>
      i !== exIdx ? e : {
        ...e,
        sets: e.sets.length > 1 ? e.sets.filter((_, j) => j !== setIdx) : e.sets
      }
    )
  })),

  // Fetched when the plan screen opens rather than on each exercise tap: the
  // numbers aren't on screen during selection, and a request per tap would put
  // latency in the middle of browsing.
  loadSuggestions: async () => {
    const { selectedExercises } = get()
    // Strength and calisthenics are the only modalities with reps × load to
    // progress. Cardio targets and metcon formats are planned differently.
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
          // Never overwrite numbers the athlete has already changed
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
      // A failed suggestion just leaves the modality defaults in place — the
      // athlete can still plan and train.
      console.error('loadSuggestions error:', err)
      set({ suggestionsLoading: false })
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

  startSession: async () => {
    // Already running, or another caller is mid-flight → reuse, never start twice.
    if (get().sessionId) return
    if (startInFlight) return startInFlight

    startInFlight = (async () => {
      try {
        set({ startError: null })
        const session = await workoutService.startSession()

        // Commit the session id *before* registering exercises: if registration
        // partially fails we still hold a usable session instead of orphaning it.
        const firstLive = get().selectedExercises.findIndex(se => !se.skipped)
        set({
          activeSession: session,
          sessionId: session.id,
          sessionStartTime: new Date(),
          currentExerciseIndex: firstLive < 0 ? 0 : firstLive,
          currentSetIndex: 0,
          completedSets: [],
        })

        // Only register what we'll actually work through — skipped exercises
        // would otherwise become empty rows in the user's history.
        const pending = get().selectedExercises
          .map((se, i) => ({ se, i }))
          .filter(({ se }) => !se.skipped && !se.workoutExerciseId)

        const registered = await Promise.all(pending.map(async ({ se, i }) => {
          const we = await workoutService.addExercise(session.id, {
            exerciseId: se.exercise.id,
            orderIndex: i + 1,
          })
          return [se.exercise.id, we.id] as const
        }))

        // Match by exercise id, not index — the queue may have reordered meanwhile.
        const idMap = new Map(registered)
        set(state => ({
          selectedExercises: state.selectedExercises.map(e => {
            const id = idMap.get(e.exercise.id)
            return id ? { ...e, workoutExerciseId: id } : e
          }),
        }))

        // Bind a standby slot to the session fulfilling it, which is also what
        // advances the plan's "performed" counters. Best-effort: failing to
        // attribute a session must never stop the athlete training.
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

  // Registers a single exercise against the live session. Used for exercises
  // added *after* the session started — without this their sets are dropped.
  registerExercise: async (exIdx) => {
    const { sessionId, selectedExercises } = get()
    if (!sessionId) throw new Error('No active session')
    const se = selectedExercises[exIdx]
    if (!se) throw new Error('No such exercise')
    if (se.workoutExerciseId) return se.workoutExerciseId

    const we = await workoutService.addExercise(sessionId, {
      exerciseId: se.exercise.id,
      orderIndex: exIdx + 1,
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

    // Capture the target up front — awaits below must not write to a set the
    // user has since navigated away from.
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
      // Added mid-workout and never registered — do it now rather than drop the set.
      try {
        workoutExerciseId = await get().registerExercise(exIdx)
      } catch (err) {
        console.error('registerExercise error:', err)
        set({ logError: 'Could not save that set — the exercise is not attached to this workout.' })
        return false
      }
    }

    const setType = MODALITY_SET_TYPE[currentExercise.exercise.modality] ?? 'STRENGTH'

    // Build the modality-specific payload the backend expects for this SetType
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
        // isometric holds carry seconds-under-tension instead of reps
        if (data.duration != null) payload.duration = data.duration
        break
      case 'MOBILITY':
        // reps carries the hold time in seconds unless an explicit duration is given
        payload.duration = data.duration ?? data.reps ?? 0
        break
      case 'CARDIO':
        payload.distance = data.distance
        payload.time = data.time
        // Only GPS sessions have a route, but a treadmill run still has splits
        // and an average pace worth keeping, so the payload goes either way.
        if (data.run) payload.run = toRunPayload(data.run)
        break
      case 'WOD':
        payload.distance = data.distance
        payload.time = data.time
        // The metcon's score. Without reps-per-round and rounds the backend
        // only sees a clock, and can't tell 3 rounds from 15.
        payload.reps = data.reps
        payload.rounds = data.rounds
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
      console.error('logSet error:', err)
      set({ logError: 'That set could not be saved. Check your connection and log it again.' })
      return false
    }

    // The backend keys a set by (workoutExercise, setNumber) and overwrites on
    // re-log, so mirror that here: one entry per set, never a duplicate.
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

  nextExercise: () => {
    const { currentExerciseIndex, selectedExercises } = get()
    let ni = currentExerciseIndex + 1
    while (ni < selectedExercises.length && selectedExercises[ni].skipped) ni++
    if (ni < selectedExercises.length) {
      set({ currentExerciseIndex: ni, currentSetIndex: 0 })
    }
  },

  finishSession: async () => {
    // A finish already on the wire → hand back the same promise instead of
    // firing a second POST.
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
        return await doFinish(sessionId, duration, set, sourceScheduledId)
      } finally {
        // Cleared on failure too, so a retry from the Finish screen can run
        finishInFlight = null
      }
    })()

    return finishInFlight
  }
}))

// Performs the finish request and clears the workout out of the store.
async function doFinish(
  sessionId: string,
  duration: number,
  set: (partial: Partial<WorkoutStore>) => void,
  scheduledId: string | null
) {
  const result = await workoutService.finishSession(sessionId, duration)

  // Close the standby slot so the plan stops showing as due. After the finish,
  // not before: the session is what makes it completed, and a failure here must
  // not lose the workout that has already been recorded.
  if (scheduledId) {
    try {
      await templateService.close(scheduledId, 'completed')
    } catch (err) {
      console.error('could not close scheduled workout:', err)
    }
  }

  // Wipe the whole selection, not just the session ids: leaving
  // selectedExercises behind lets a back-navigation to /workout/active
  // remount and start a brand-new session against stale exercise rows.
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
  })

  return result
}

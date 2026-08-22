// User
export interface User {
  id: string
  email: string
  profile?: UserProfile
  settings?: Settings
}

export interface UserProfile {
  userId: string
  name: string
  /** Legacy. Prefer birthDate — an age stored once goes stale silently. */
  age?: number
  weight?: number
  height?: number
  gender?: string
  fitnessLevel?: string
  goal?: string
  birthDate?: string | null
  trainingDaysPerWeek?: number | null
  experienceYears?: number | null
  /** Null means the onboarding gate has not been passed. */
  onboardingCompletedAt?: string | null
  optionalStageDoneAt?: string | null
}

export interface Settings {
  preferredUnit: string
  notificationEnabled: boolean
  inactivityDaysThreshold: number
  theme: string
  /**
   * Off degrades the AI coach rather than removing it: the chat still answers,
   * but with no body data and no tools, and coach notifications stop. Enforced
   * server-side in ai.service.ts — never treat this as a client-side hint.
   */
  aiConsentEnabled: boolean
}

// Fatigue
export type FatigueStatus = 'recovered' | 'moderate' | 'high'

export interface MuscleFatigue {
  muscleId: string
  muscleName: string
  fatigueLevel: number
  status: FatigueStatus
  color: string
  recoveryTargetAt: string | null
}

export type ReadinessStatus = 'ready' | 'caution' | 'rest'
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced'

/**
 * What last night's sleep did to the readiness score.
 *
 * `applied: false` is a real, expected state — nothing logged, or the newest
 * log is too old to count — and the UI must say so rather than showing a 0
 * that looks like a measurement. The server owns the wording in `note`.
 */
export interface SleepReadiness {
  /** Signed readiness points. Always 0 when `applied` is false. */
  adjustment: number
  applied: boolean
  reason: 'applied' | 'none' | 'stale'
  durationMin: number | null
  sleepScore: number | null
  sleepDate: string | null
  note: string
}

export interface FatigueData {
  muscles: MuscleFatigue[]
  readinessScore: number
  // Whole-body fatigue — the cardiovascular/central cost of recent training,
  // which no single muscle's level can express. Cardio and metcons load this.
  systemicFatigue: number
  systemicRecoveryTargetAt: string | null
  // Server-computed banding — prefer this over re-thresholding readinessScore
  // on the client, so the cutoffs stay in one place (readiness.service.ts).
  readinessStatus: ReadinessStatus
  fitnessLevel: FitnessLevel
  /** Sleep's share of readinessScore above — already folded into it. */
  sleep: SleepReadiness
}

// Training load — the weeks-long trend, as opposed to today's soreness
export type LoadTrend = 'ramping' | 'building' | 'maintaining' | 'detraining'
export type FormState = 'fresh' | 'neutral' | 'tired' | 'overreaching'

export interface TrainingLoad {
  /** Chronic load: accumulated fitness, sRPE units per day */
  fitness: number
  /** Acute load: recent work not yet absorbed */
  fatigue: number
  /** fitness − fatigue; positive is fresh */
  form: number
  /** Acute:chronic ratio; null until there is enough history */
  ratio: number | null
  trend: LoadTrend
  formState: FormState
  weeklyLoad: number
  previousWeeklyLoad: number
  sessionCount: number
  /** False until enough sessions exist for the numbers to mean anything */
  established: boolean
}

// Exercise
export interface Exercise {
  id: string
  name: string
  description?: string
  modality: string
  muscles: { name: string; impactFactor: number; role: string }[]
  categories: string[]
  equipment: string[]
  isCustom: boolean
  fatigueWarning: boolean
  maxMuscleFatigue: number
  /** Loads a muscle flagged "work around it" in Training Setup. */
  injuryCaution?: boolean
  /** Needs kit not ticked in Training Setup. Still listed, sorted last. */
  needsMissingEquipment?: boolean
}

export interface ExerciseCategory {
  id: string
  name: string
  exerciseCount: number
  fatigueLevel: number
  fatigueStatus: FatigueStatus
}

// Workout
export interface WorkoutSession {
  id: string
  dateTime: string
  duration?: number
  avgRpe?: number
  totalVolume?: number
  workoutExercises: WorkoutExercise[]
}

export interface WorkoutExercise {
  id: string
  exerciseId: string
  exercise: Exercise
  orderIndex: number
  sets: WorkoutSet[]
}

export interface WorkoutSet {
  id: string
  setNumber: number
  setType: string
  rpe?: number
  restSeconds?: number
  strength?: { reps: number; weight: number }
  cardio?: { distance?: number; time?: number }
  // `time` is seconds under tension for isometric holds (reps is 0 then)
  calisthenics?: { reps: number; addedWeight: number; time?: number }
  wod?: { distance?: number; time?: number }
  mobility?: { time?: number }
}

// API response wrapper
export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}

// AI Chat
export interface Message {
  id: string
  sender: 'user' | 'assistant'
  messageText: string
  dateTime: string
}

// Plan sets
export interface PlannedSet {
  reps: number
  weight: number
  rpe: number
  restSeconds: number
}
// Saved plans — a workout the athlete intends to do, as opposed to one they
// did. Sessions stay the factual record; templates are editable intentions.
export interface TemplateSet {
  id: string
  setNumber: number
  reps: number | null
  weight: number | null
  rpe: number | null
  restSeconds: number | null
  distance: number | null
  time: number | null
  rounds: number | null
}

export interface TemplateExercise {
  id: string
  exerciseId: string
  exercise: Exercise
  orderIndex: number
  notes: string | null
  sets: TemplateSet[]
}

export interface WorkoutTemplate {
  id: string
  name: string
  notes: string | null
  /** An AI-drafted plan stays labelled as one for its whole life. */
  source: 'user' | 'ai'
  archivedAt: string | null
  lastPerformedAt: string | null
  timesPerformed: number
  createdAt: string
  exercises: TemplateExercise[]
}

export type ScheduledStatus = 'standby' | 'started' | 'completed' | 'skipped' | 'cancelled'

export interface ScheduledWorkout {
  id: string
  templateId: string
  template: WorkoutTemplate
  scheduledFor: string
  reminderAt: string | null
  status: ScheduledStatus
  sessionId: string | null
  completedAt: string | null
}

// Something the AI has drafted and the athlete has not yet accepted. Nothing
// exists in the app's own tables until one of these is tapped.
export interface AiProposal {
  id: string
  kind: 'create_template' | 'schedule_workout' | 'create_exercise'
  title: string
  lines: string[]
  scheduledFor: string | null
  reminderAt: string | null
  expiresAt: string
  messageId?: string | null
}

// Progress — the read side of datasets the app was computing and never showing.
// Shapes mirror backend/src/services/progress.service.ts and
// workout-history.service.ts; keep them in step.

export interface VolumeWeek {
  /** ISO date of the Monday. */
  weekStart: string
  /** Mechanical tonnage. Near zero for bodyweight- or cardio-only training. */
  volumeKg: number
  /** Whole-body cost in sRPE units — the same units training load uses. */
  load: number
  sessions: number
  sets: number
}

export interface VolumeTrend {
  weeks: VolumeWeek[]
  thisWeek: VolumeWeek | null
  previousWeek: VolumeWeek | null
  activeWeeks: number
}

export interface StrengthEntry {
  exerciseId: string
  exerciseName: string
  modality: string
  /** kg. For calisthenics this includes bodyweight, so it is a total load. */
  e1rm: number
  achievedAt: string
  lastPerformedAt: string | null
  sessionCount: number
}

export interface E1rmPoint {
  sessionId: string
  at: string
  e1rm: number
  bestSet: { reps: number; weight: number; rpe: number | null } | null
  /** Set a new all-time best. The series is not monotonic — it can go down. */
  isPr: boolean
}

export interface MuscleFatigueHistory {
  muscleId: string
  muscleName: string
  /** One sample per day, oldest first, replayed through the decay curve. */
  points: { at: string; level: number }[]
  /** Sessions that loaded this muscle inside the window. */
  hits: { at: string; delta: number; sessionId: string | null }[]
  averageLevel: number
  peakLevel: number
}

export interface ProgressSummary {
  volume: VolumeTrend
  strength: StrengthEntry[]
  muscles: MuscleFatigueHistory[]
}

// History
export interface HistoryRow {
  id: string
  dateTime: string
  duration: number
  totalVolume: number
  avgRpe: number | null
  systemicLoad: number
  templateName: string | null
  exercises: { name: string; modality: string; sets: number }[]
  setCount: number
  distanceKm: number
  modalities: string[]
}

export interface HistoryPage {
  sessions: HistoryRow[]
  /** Null on the last page — distinct from an empty page. */
  nextCursor: string | null
}

export interface ExerciseHistorySet {
  setNumber: number
  rpe: number | null
  reps: number | null
  /** kg. Total load for calisthenics, i.e. bodyweight plus anything added. */
  weight: number | null
  timeSec: number | null
  distanceKm: number | null
  rounds: number | null
}

export interface ExerciseHistoryEntry {
  sessionId: string
  dateTime: string
  sets: ExerciseHistorySet[]
  e1rm: number | null
  topWeight: number | null
  totalVolume: number
}

export interface ExerciseHistory {
  exerciseId: string
  entries: ExerciseHistoryEntry[]
  lastPerformedAt: string | null
  bestE1rm: number | null
  /** Total sessions containing this exercise — may exceed `entries.length`. */
  sessionCount: number
}

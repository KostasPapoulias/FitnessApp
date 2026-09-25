import type { Locale } from '../i18n/locales'

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
  /** Legacy — prefer birthDate. */
  age?: number
  weight?: number
  height?: number
  gender?: string
  fitnessLevel?: string
  goal?: string
  birthDate?: string | null
  trainingDaysPerWeek?: number | null
  experienceYears?: number | null
  /** Null until the onboarding gate is passed. */
  onboardingCompletedAt?: string | null
  optionalStageDoneAt?: string | null
}

export interface Settings {
  preferredUnit: string
  notificationEnabled: boolean
  inactivityDaysThreshold: number
  theme: string
  /** AI data consent. Off: the coach gets no body data or tools (enforced server-side). */
  aiConsentEnabled: boolean
  /** The account's language (the device's lives in useLocaleStore). */
  language: Locale
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

/** What last night's sleep did to readiness. `applied: false` (nothing recent logged) is a normal state. */
export interface SleepReadiness {
  /** Signed readiness points; 0 when not applied. */
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
  // Whole-body fatigue (cardio and metcons load this)
  systemicFatigue: number
  systemicRecoveryTargetAt: string | null
  // Server-computed banding — use this rather than re-thresholding
  readinessStatus: ReadinessStatus
  fitnessLevel: FitnessLevel
  /** Sleep's share of readinessScore, already included. */
  sleep: SleepReadiness
}

// Training load — the weeks-long trend
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
export type CardioTracking = 'gps' | 'machine' | 'reps'

export interface Exercise {
  id: string
  name: string
  description?: string
  modality: string
  /** List thumbnail; null where there is no artwork (and for custom exercises). */
  thumbnailUrl?: string | null
  /** Typical speed (km/h), for distance → work. Not an indicator of pace support — see cardioTracking. */
  referenceSpeedKmh?: number | null
  /**
   * How the movement is measured: 'gps' (map, route, pace), 'machine' (dial,
   * no route) or 'reps' (counter). Absent means 'gps'.
   */
  cardioTracking?: CardioTracking
  /** Counts per minute at typical effort ('reps' movements). */
  referenceCadenceRpm?: number | null
  /** What the count is called — 'skips', 'floors', 'reps'. Wording only. */
  repUnit?: string | null
  muscles: { name: string; impactFactor: number; role: string }[]
  categories: string[]
  equipment: string[]
  isCustom: boolean
  // Catalogue-only fields (absent when reached through a saved plan)
  fatigueWarning?: boolean
  maxMuscleFatigue?: number
  /** Works a muscle marked "caution". */
  injuryCaution?: boolean
  /** Needs equipment the athlete lacks; listed last. */
  needsMissingEquipment?: boolean
  /** Starred; `undefined` means unknown, not "not starred". */
  isFavorite?: boolean
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
  cardio?: { distance?: number; time?: number; reps?: number }
  // `time` is hold seconds (reps is 0 then)
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
// Saved plans (templates) — editable intentions, separate from logged sessions.
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
  /** 'ai' for coach-drafted plans. */
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

// An AI-drafted change awaiting the athlete's tap.
export interface AiProposal {
  id: string
  kind: 'create_template' | 'schedule_workout' | 'create_exercise'
  /** pending (tappable), applied or expired. Absent on a freshly returned card (pending). */
  status?: 'pending' | 'applied' | 'expired'
  title: string
  lines: string[]
  scheduledFor: string | null
  reminderAt: string | null
  expiresAt: string
  messageId?: string | null
}

// Progress — mirrors backend progress.service.ts and workout-history.service.ts.

export interface VolumeWeek {
  /** ISO date of the Monday. */
  weekStart: string
  /** Mechanical tonnage. */
  volumeKg: number
  /** Whole-body load in sRPE units. */
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
  /** kg; for calisthenics includes bodyweight. */
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
  /** A new all-time best (the series is not monotonic). */
  isPr: boolean
}

export interface MuscleFatigueHistory {
  muscleId: string
  muscleName: string
  /** Daily samples, oldest first. */
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
  /** kg; for calisthenics, bodyweight plus added. */
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
  /** The athlete's note on the exercise that day. */
  notes: string | null
}

export interface ExerciseHistory {
  exerciseId: string
  entries: ExerciseHistoryEntry[]
  lastPerformedAt: string | null
  bestE1rm: number | null
  /** Total sessions with this exercise (may exceed entries). */
  sessionCount: number
  /** Most recent note from any session. */
  lastNote: { text: string; dateTime: string } | null
}

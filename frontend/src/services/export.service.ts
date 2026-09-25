import api from './api'

/**
 * The shape `GET /api/profile/export` returns — see the backend's
 * `data-export.service.ts`, which is the source of truth. Only what the report
 * reads is typed closely; the rest travels through untouched into the JSON the
 * report embeds, so a field added on the server reaches the file without a
 * client change.
 */

export interface ExportSet {
  setNumber: number
  type: string
  rpe: number | null
  restSeconds: number | null
  strength: { reps: number; weightKg: number } | null
  calisthenics: { reps: number; addedWeightKg: number; timeSec: number | null } | null
  cardio: { distanceKm: number | null; timeSec: number | null; reps: number | null } | null
  wod: {
    reps: number | null; rounds: number | null; weightKg: number | null
    distanceKm: number | null; timeSec: number | null
  } | null
  mobility: { timeSec: number | null } | null
  run: {
    distanceM: number
    durationSec: number
    avgPaceSecPerKm: number
    elevationGainM: number
    source: string
    splits: { index: number; meters: number; seconds: number }[] | null
  } | null
}

export interface ExportSession {
  id: string
  dateTime: string
  finished: boolean
  durationSec: number | null
  avgRpe: number | null
  totalVolumeKg: number | null
  systemicLoad: number | null
  weatherCondition: string | null
  notes: string | null
  template: string | null
  fatigueSnapshot: { muscle: string; fatigueAfter: number; delta: number; color: string }[]
  exercises: { name: string; modality: string; notes: string | null; sets: ExportSet[] }[]
}

export interface DataExport {
  format: string
  version: number
  exportedAt: string
  account: { email: string; createdAt: string }
  profile: {
    name: string
    birthDate: string | null
    age: number | null
    weightKg: number | null
    heightCm: number | null
    gender: string | null
    fitnessLevel: string | null
    goal: string | null
    trainingDaysPerWeek: number | null
    experienceYears: number | null
  } | null
  equipment: string[]
  injuries: { label: string; muscle: string | null; severity: string; activeFrom: string; resolvedAt: string | null }[]
  settings: {
    preferredUnit: string
    language: string
    aiConsentEnabled: boolean
    pinLockEnabled: boolean
  } | null
  biometrics: { measuredAt: string; type: string; value: number; source: string }[]
  sessions: ExportSession[]
  strengthEstimates: { exercise: string; e1rmKg: number; updatedAt: string }[]
  currentFatigue: {
    muscles: { muscle: string; level: number; updatedAt: string; recoveryTargetAt: string | null }[]
    systemic: { level: number; updatedAt: string; recoveryTargetAt: string | null } | null
  }
  sleep: { date: string; durationMin: number; score: number | null; notes: string | null }[]
  nutrition: { date: string; proteinG: number | null; calories: number | null; notes: string | null }[]
  templates: {
    name: string
    notes: string | null
    archivedAt: string | null
    timesPerformed: number
    exercises: {
      name: string
      sets: { setNumber: number; reps: number | null; weightKg: number | null; rpe: number | null }[]
    }[]
  }[]
  scheduledWorkouts: { template: string; scheduledFor: string; status: string }[]
  favoriteExercises: string[]
  customExercises: { name: string; modality: string; description: string | null }[]
  aiCoach: {
    threads: { startedAt: string; messages: { at: string; from: string; text: string }[] }[]
    proposals: { kind: string; status: string; createdAt: string }[]
  }
  notifications: { type: string; title: string; body: string; status: string; createdAt: string }[]
}

export const exportService = {
  /** The whole account. Can be several MB for a long history with GPS runs. */
  getAll: async (): Promise<DataExport> => {
    const res = await api.get('/profile/export', { timeout: 120_000 })
    return res.data.data
  },
}

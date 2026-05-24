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
  age?: number
  weight?: number
  height?: number
  gender?: string
  fitnessLevel?: string
  goal?: string
}

export interface Settings {
  preferredUnit: string
  notificationEnabled: boolean
  theme: string
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

export interface FatigueData {
  muscles: MuscleFatigue[]
  readinessScore: number
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
  calisthenics?: { reps: number; addedWeight: number }
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
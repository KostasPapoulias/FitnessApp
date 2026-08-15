import api from './api'

export interface EquipmentOption {
  id: string
  name: string
  description?: string | null
}

export interface MuscleOption {
  id: string
  name: string
}

export interface InjuryInput {
  muscleId?: string | null
  label: string
  severity?: 'avoid' | 'caution'
}

export interface Injury extends InjuryInput {
  id: string
  activeFrom: string
  resolvedAt: string | null
}

export interface OnboardingState {
  onboardingCompletedAt: string | null
  optionalStageDoneAt: string | null
  equipmentIds: string[]
  injuries: Injury[]
  seenHints: string[]
}

// Always metric on the wire. The form converts at the edge so that a user on
// imperial units and a user on metric write the same numbers to the database.
export interface OnboardingAnswers {
  name?: string
  sex: 'male' | 'female' | 'other' | 'prefer_not_to_say'
  birthDate: string
  heightCm: number
  weightKg: number
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced'
  goal: 'hypertrophy' | 'strength' | 'endurance' | 'weight_loss'
  trainingDaysPerWeek?: number
  experienceYears?: number
}

export const onboardingService = {
  getOptions: async (): Promise<{ equipment: EquipmentOption[]; muscles: MuscleOption[] }> => {
    const res = await api.get('/profile/onboarding/options')
    return res.data.data
  },

  getState: async (): Promise<OnboardingState> => {
    const res = await api.get('/profile/onboarding/state')
    return res.data.data
  },

  complete: async (answers: OnboardingAnswers) => {
    const res = await api.put('/profile/onboarding', answers)
    return res.data.data
  },

  setEquipment: async (equipmentIds: string[]) => {
    const res = await api.put('/profile/equipment', { equipmentIds })
    return res.data.data
  },

  setInjuries: async (injuries: InjuryInput[]) => {
    const res = await api.put('/profile/injuries', { injuries })
    return res.data.data
  },

  dismissHint: async (hintKey: string) => {
    await api.post(`/profile/hints/${hintKey}`)
  },

  resetHints: async () => {
    await api.delete('/profile/hints')
  },
}

//  Unit conversion
// One direction each, kept here rather than in the form so the rounding is
// consistent everywhere. Round-tripping kg -> lb -> kg will not return the exact
// original, which is why only the metric value is ever persisted.
export const KG_PER_LB = 0.45359237
export const CM_PER_INCH = 2.54

export const lbToKg = (lb: number) => lb * KG_PER_LB
export const kgToLb = (kg: number) => kg / KG_PER_LB
export const inchesToCm = (inches: number) => inches * CM_PER_INCH
export const cmToInches = (cm: number) => cm / CM_PER_INCH

export const feetInchesToCm = (feet: number, inches: number) =>
  inchesToCm(feet * 12 + inches)

export const cmToFeetInches = (cm: number) => {
  const totalInches = Math.round(cmToInches(cm))
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 }
}

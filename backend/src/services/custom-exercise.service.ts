import prisma from '../lib/prisma'

/**
 * Exercises the athlete creates. Their calibration (damageFactor, loadFactor)
 * is derived here, never entered by the user — a wrong value would silently
 * distort fatigue and suggestions. Shared by the Create Exercise form and the
 * coach's `propose_exercise` draft, so both paths validate identically.
 */

export type MuscleRole = 'primary' | 'secondary'

/** `impactFactor` per role — two rungs are all a person can judge about their own movement. */
export const IMPACT_BY_ROLE: Record<MuscleRole, number> = {
  primary: 1.0,
  secondary: 0.5,
}

/**
 * Damage per unit of work by modality. Mirrors `MODALITY_DAMAGE` in
 * `prisma/fatigue-tuning.ts` (not imported: prisma/ is outside the build root).
 */
const MODALITY_DAMAGE: Record<string, number> = {
  Strength: 1.0,
  Calisthenics: 1.0,
  Cardio: 1.0,
  WOD: 1.0,
  Mobility: 0,
}

export const damageForCustom = (modalityName: string): number =>
  MODALITY_DAMAGE[modalityName] ?? 1.0

/**
 * Opening working load (fraction of bodyweight, ~10 reps) by primary muscle.
 * Deliberately conservative; progression takes over after the first session.
 */
const LOAD_FACTOR_BY_PRIMARY_MUSCLE: Record<string, number> = {
  Chest: 0.30,
  Back: 0.35,
  Lats: 0.35,
  Traps: 0.30,
  'Lower Back': 0.45,
  Quadriceps: 0.45,
  Hamstrings: 0.35,
  Glutes: 0.40,
  Calves: 0.50,
  Shoulders: 0.14,
  Biceps: 0.18,
  Triceps: 0.24,
  Forearms: 0.14,
  Abs: 0.10,
  Obliques: 0.10,
}

/** Modalities with external load worth suggesting. */
const LOADED_MODALITIES = new Set(['Strength', 'Calisthenics'])

/**
 * Starting load factor from the primary muscles (the lowest wins — the weakest
 * primary limits the lift), or null when nothing sensible can be said.
 */
export const loadFactorForCustom = (
  modalityName: string,
  primaryMuscleNames: string[]
): number | null => {
  if (!LOADED_MODALITIES.has(modalityName)) return null

  const known = primaryMuscleNames
    .map(name => LOAD_FACTOR_BY_PRIMARY_MUSCLE[name])
    .filter((factor): factor is number => factor != null)

  if (known.length === 0) return null

  return Math.min(...known)
}

// ── validation ────────────────────────────────────────────────────────────

const NAME_MIN = 2
const NAME_MAX = 80
const DESCRIPTION_MAX = 1000
const MAX_MUSCLES = 8
const MAX_CATEGORIES = 6
const MAX_EQUIPMENT = 8

/** Per-athlete cap on custom exercises. */
export const MAX_CUSTOM_PER_USER = 200

export class CustomExerciseError extends Error {
  constructor(message: string, readonly code: 'invalid' | 'duplicate' | 'limit') {
    super(message)
    this.name = 'CustomExerciseError'
  }
}

/** A lookup-table reference: uuid (from the form) or name (from the coach). */
export type LookupRef = string

/** How a custom cardio movement is measured; it gets no reference cadence. */
const CARDIO_TRACKING_VALUES = ['gps', 'machine', 'reps']

export interface CustomExerciseInput {
  name: unknown
  /** Modality id or name. */
  modality: unknown
  description?: unknown
  muscles: unknown
  /** Category ids or names. */
  categories?: unknown
  /** Equipment ids or names. */
  equipment?: unknown
  /** 'gps' | 'machine' | 'reps' — cardio only. Asked because its effect is immediately visible. */
  cardioTracking?: unknown
}

export interface PreparedCustomExercise {
  name: string
  description: string | null
  modalityId: string
  modalityName: string
  muscleLinks: { muscleId: string; muscleName: string; role: MuscleRole; impactFactor: number }[]
  categoryIds: string[]
  equipmentIds: string[]
  damageFactor: number
  loadFactor: number | null
  cardioTracking: string
}

/** Match a ref by exact id or case-insensitive name. */
const matchRef = <T extends { id: string; name: string }>(rows: T[], ref: LookupRef): T | undefined => {
  const needle = ref.trim().toLowerCase()
  return rows.find(row => row.id === ref || row.name.toLowerCase() === needle)
}

/**
 * Validate a proposed custom exercise and resolve every reference, without
 * writing. Run at proposal time and again on accept.
 */
export const prepareCustomExercise = async (
  userId: string,
  input: CustomExerciseInput
): Promise<PreparedCustomExercise> => {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : ''
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw new CustomExerciseError(
      `Name must be between ${NAME_MIN} and ${NAME_MAX} characters.`, 'invalid'
    )
  }

  const description = typeof input.description === 'string' ? input.description.trim() : null
  if (description && description.length > DESCRIPTION_MAX) {
    throw new CustomExerciseError(
      `Description must be ${DESCRIPTION_MAX} characters or fewer.`, 'invalid'
    )
  }

  if (typeof input.modality !== 'string' || !input.modality.trim()) {
    throw new CustomExerciseError('Say what kind of exercise this is.', 'invalid')
  }

  if (!Array.isArray(input.muscles) || input.muscles.length === 0) {
    throw new CustomExerciseError('Name at least one muscle this works.', 'invalid')
  }
  if (input.muscles.length > MAX_MUSCLES) {
    throw new CustomExerciseError(
      `At most ${MAX_MUSCLES} muscles — beyond that the movement is not being described, it is being listed.`,
      'invalid'
    )
  }

  // Deduplicate by reference, keeping the strongest role
  const roleByRef = new Map<LookupRef, MuscleRole>()
  for (const entry of input.muscles) {
    const ref = (entry as { muscle?: unknown })?.muscle
    const role = (entry as { role?: unknown })?.role

    if (typeof ref !== 'string' || !ref.trim()) {
      throw new CustomExerciseError('Every muscle needs a name.', 'invalid')
    }
    if (role !== 'primary' && role !== 'secondary') {
      throw new CustomExerciseError('Each muscle must be primary or secondary.', 'invalid')
    }
    const key = ref.trim()
    if (roleByRef.get(key) !== 'primary') roleByRef.set(key, role)
  }

  if (![...roleByRef.values()].includes('primary')) {
    // Load factor derives from the primaries
    throw new CustomExerciseError(
      'Mark at least one muscle as primary — the one the exercise is really for.', 'invalid'
    )
  }

  const toRefs = (value: unknown, label: string, max: number): LookupRef[] => {
    if (value == null) return []
    if (!Array.isArray(value)) throw new CustomExerciseError(`${label} must be a list.`, 'invalid')
    const refs = [...new Set(
      value.filter((v): v is string => typeof v === 'string' && !!v.trim()).map(v => v.trim())
    )]
    if (refs.length > max) throw new CustomExerciseError(`At most ${max} ${label.toLowerCase()}.`, 'invalid')
    return refs
  }

  const categoryRefs = toRefs(input.categories, 'Categories', MAX_CATEGORIES)
  const equipmentRefs = toRefs(input.equipment, 'Equipment', MAX_EQUIPMENT)

  // Small lookup tables, fetched whole and matched in memory; all reads batched
  const [modalities, muscles, categories, equipment, duplicate, customCount] = await Promise.all([
    prisma.modality.findMany({ select: { id: true, name: true } }),
    prisma.muscle.findMany({ select: { id: true, name: true } }),
    categoryRefs.length
      ? prisma.exerciseCategory.findMany({ select: { id: true, name: true } })
      : Promise.resolve([]),
    equipmentRefs.length
      ? prisma.equipment.findMany({ select: { id: true, name: true } })
      : Promise.resolve([]),
    // Names must be unique across the catalogue and the user's own exercises
    prisma.exercise.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      },
      select: { id: true, createdByUserId: true },
    }),
    prisma.exercise.count({ where: { createdByUserId: userId } }),
  ])

  const modality = matchRef(modalities, input.modality.trim())
  if (!modality) {
    throw new CustomExerciseError(
      `"${input.modality}" is not a kind of exercise. Use one of: ${modalities.map(m => m.name).join(', ')}.`,
      'invalid'
    )
  }

  const muscleLinks: PreparedCustomExercise['muscleLinks'] = []
  for (const [ref, role] of roleByRef) {
    const muscle = matchRef(muscles, ref)
    if (!muscle) {
      throw new CustomExerciseError(
        `"${ref}" is not a muscle this app tracks. Use one of: ${muscles.map(m => m.name).join(', ')}.`,
        'invalid'
      )
    }
    muscleLinks.push({
      muscleId: muscle.id,
      muscleName: muscle.name,
      role,
      impactFactor: IMPACT_BY_ROLE[role],
    })
  }

  const resolveAll = (refs: LookupRef[], rows: { id: string; name: string }[], label: string) =>
    refs.map(ref => {
      const row = matchRef(rows, ref)
      if (!row) throw new CustomExerciseError(`"${ref}" is not a known ${label}.`, 'invalid')
      return row.id
    })

  const categoryIds = resolveAll(categoryRefs, categories, 'category')
  const equipmentIds = resolveAll(equipmentRefs, equipment, 'equipment item')

  if (duplicate) {
    throw new CustomExerciseError(
      duplicate.createdByUserId
        ? `You already have an exercise called "${name}".`
        : `"${name}" is already in the exercise library — search for it instead.`,
      'duplicate'
    )
  }

  if (customCount >= MAX_CUSTOM_PER_USER) {
    throw new CustomExerciseError(
      `You have reached the limit of ${MAX_CUSTOM_PER_USER} custom exercises.`, 'limit'
    )
  }

  const primaryMuscleNames = muscleLinks
    .filter(link => link.role === 'primary')
    .map(link => link.muscleName)

  // Defaults to 'gps'; ignored for non-cardio modalities
  const requested = typeof input.cardioTracking === 'string' ? input.cardioTracking : null
  const cardioTracking =
    modality.name.toLowerCase() === 'cardio' && requested && CARDIO_TRACKING_VALUES.includes(requested)
      ? requested
      : 'gps'

  return {
    name,
    description,
    modalityId: modality.id,
    modalityName: modality.name,
    muscleLinks,
    categoryIds,
    equipmentIds,
    damageFactor: damageForCustom(modality.name),
    loadFactor: loadFactorForCustom(modality.name, primaryMuscleNames),
    cardioTracking,
  }
}

/** Write a prepared exercise; returns the same shape as a `getExercises` row. */
export const createCustomExercise = async (
  userId: string,
  prepared: PreparedCustomExercise
) => {
  // Nested writes: the exercise and its links in one statement
  const created = await prisma.exercise.create({
    data: {
      name: prepared.name,
      description: prepared.description,
      modalityId: prepared.modalityId,
      createdByUserId: userId,
      damageFactor: prepared.damageFactor,
      loadFactor: prepared.loadFactor,
      // No reference speed or cadence can be guessed, so cardio scores on duration
      referenceSpeedKmh: null,
      referenceCadenceRpm: null,
      repUnit: null,
      cardioTracking: prepared.cardioTracking,
      muscleLinks: {
        create: prepared.muscleLinks.map(link => ({
          muscleId: link.muscleId,
          impactFactor: link.impactFactor,
        })),
      },
      categoryLinks: { create: prepared.categoryIds.map(categoryId => ({ categoryId })) },
      equipmentLinks: { create: prepared.equipmentIds.map(equipmentId => ({ equipmentId })) },
    },
    include: {
      modality: true,
      muscleLinks: { include: { muscle: true } },
      categoryLinks: { include: { category: true } },
      equipmentLinks: { include: { equipment: true } },
    },
  })

  return {
    id: created.id,
    name: created.name,
    description: created.description,
    modality: created.modality.name,
    muscles: created.muscleLinks.map(ml => ({
      id: ml.muscleId,
      name: ml.muscle.name,
      impactFactor: ml.impactFactor,
    })),
    categories: created.categoryLinks.map(cl => cl.category.name),
    equipment: created.equipmentLinks.map(el => el.equipment.name),
    isCustom: true,
    // No history yet
    fatigueWarning: false,
    maxMuscleFatigue: 0,
    injuryCaution: false,
    needsMissingEquipment: false,
  }
}

import prisma from '../lib/prisma'

/**
 * Exercises the athlete invents, and the calibration behind them.
 *
 * The seeded catalogue gets its numbers from `prisma/fatigue-tuning.ts`, tuned
 * per movement by hand. A custom exercise has no entry there and never will, so
 * its figures have to be derived — and the derivation is deliberately kept away
 * from the user.
 *
 * The alternative was an "advanced" section exposing damageFactor and
 * loadFactor directly. It was rejected: those numbers feed
 * `MuscleFatigueCurrent`, readiness, and every future progression suggestion,
 * and a wrong one is invisible. Nothing in the app would look broken — the
 * athlete would simply be told to rest on the wrong days, for good, with no way
 * to trace it back to a box they filled in once. Being unable to express an
 * unusual movement perfectly is a much smaller cost.
 *
 * Validation lives here rather than in the controller because there are two
 * ways in — the Create Exercise form and the coach's `propose_exercise` draft —
 * and they must agree. A rule enforced on only one path is not a rule.
 */

/** How much of a muscle's capacity a set of the movement uses. */
export type MuscleRole = 'primary' | 'secondary'

/**
 * `impactFactor` for each role.
 *
 * The seeded catalogue uses a continuous range, but two rungs are all a person
 * can answer honestly about their own movement — "does this mainly work X, or
 * does X just help" is a question with an answer; "is X involved at 0.65 or
 * 0.8" is not.
 */
export const IMPACT_BY_ROLE: Record<MuscleRole, number> = {
  primary: 1.0,
  secondary: 0.5,
}

/**
 * Damage per unit of work, by modality. Mirrors `MODALITY_DAMAGE` in
 * `prisma/fatigue-tuning.ts` — duplicated rather than imported because
 * `tsconfig` roots the build at `src/`, and reaching into `prisma/` would pull
 * a seed-time file into the shipped server build.
 *
 * Custom movements always take the modality baseline. The per-exercise
 * overrides in that file exist because someone reasoned about the eccentric
 * load in a Nordic curl; there is no equivalent judgement available here, and
 * inferring one from a name would be inventing data.
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
 * Opening working load for a set of ~10 reps, as a fraction of bodyweight, by
 * primary muscle — the same unit as `LOAD_FACTORS`, at a coarser grain.
 *
 * Every figure is at the CONSERVATIVE end of the seeded movements for that
 * muscle: the quad entry is nearer a Bulgarian split squat than a leg press,
 * the chest entry nearer a dumbbell press than a barbell bench. That skew is
 * deliberate and asymmetric — a first suggestion that is too light costs one
 * easy set, and one that is too heavy is how people get hurt on a movement the
 * app has never seen them perform.
 *
 * It also only has to survive one session. `workout-progression.service` takes
 * over the moment there is history, so this is an opening bid, not a verdict.
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

/** Modalities that carry external load worth suggesting a number for. */
const LOADED_MODALITIES = new Set(['Strength', 'Calisthenics'])

/**
 * Derive a starting load factor, or null when there is nothing honest to say.
 *
 * Null rather than 0, for the reason `loadFactorFor` gives: 0 reads as "this
 * movement is unloaded", which is a claim, while null is the absence of one and
 * lets `starting-load.service` fall back instead of offering an empty bar.
 *
 * Where a movement has several primaries the LOWEST factor wins. A press that
 * also loads the shoulders is limited by the shoulders, not the chest, and the
 * limiting muscle decides what can actually be lifted.
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

/**
 * Per-athlete ceiling on custom exercises.
 *
 * Generous enough that nobody legitimately building out their own movements
 * will meet it, and low enough that a looping client cannot fill the shared
 * Exercise table — every row here is read by every catalogue query the athlete
 * makes, so runaway creation degrades their own app first.
 */
export const MAX_CUSTOM_PER_USER = 200

export class CustomExerciseError extends Error {
  constructor(message: string, readonly code: 'invalid' | 'duplicate' | 'limit') {
    super(message)
    this.name = 'CustomExerciseError'
  }
}

/**
 * A reference to a row in one of the small lookup tables, as either its uuid or
 * its name.
 *
 * Both are accepted because the two callers know different things. The form
 * holds ids, having rendered the catalogue. The coach holds names — it is
 * writing prose about a movement, and giving it a tool call just to turn
 * "Hamstrings" into a uuid would spend a model round trip to learn something
 * the server can look up for free.
 */
export type LookupRef = string

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
}

/** Match a ref against a lookup row by exact id or case-insensitive name. */
const matchRef = <T extends { id: string; name: string }>(rows: T[], ref: LookupRef): T | undefined => {
  const needle = ref.trim().toLowerCase()
  return rows.find(row => row.id === ref || row.name.toLowerCase() === needle)
}

/**
 * Validate a proposed custom exercise and resolve every reference, without
 * writing anything.
 *
 * Separate from the create so the coach can validate a draft at the moment it
 * is proposed AND again when the athlete taps the card — the two can be half an
 * hour apart, and a name that was free when the card was drawn may not be by
 * the time it is accepted.
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

  // Deduplicated by reference, keeping the strongest role. The same muscle sent
  // twice as primary and secondary would otherwise create two links and count
  // the movement's load against it one and a half times.
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
    // Not pedantry: loadFactorForCustom derives the opening weight from the
    // primaries, and a movement that is all secondaries has nothing to derive
    // from and would barely fatigue anything either.
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

  // The lookup tables are tiny — fifteen muscles, five modalities — so they are
  // fetched whole and matched in memory. Resolving by name in SQL would need a
  // case-insensitive `in` per table and buys nothing at this size.
  //
  // All six trips at once: sequentially this is about two seconds of pure
  // network latency on a form submit, against a remote database.
  const [modalities, muscles, categories, equipment, duplicate, customCount] = await Promise.all([
    prisma.modality.findMany({ select: { id: true, name: true } }),
    prisma.muscle.findMany({ select: { id: true, name: true } }),
    categoryRefs.length
      ? prisma.exerciseCategory.findMany({ select: { id: true, name: true } })
      : Promise.resolve([]),
    equipmentRefs.length
      ? prisma.equipment.findMany({ select: { id: true, name: true } })
      : Promise.resolve([]),
    // Against the catalogue AND their own customs. Two exercises with the same
    // name are indistinguishable in the picker, and the athlete has no way to
    // tell which one their history is attached to.
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
  }
}

/**
 * Write a prepared exercise.
 *
 * Returns the same shape `getExercises` produces, so a client can drop it
 * straight into a list it already holds rather than refetching the catalogue.
 */
export const createCustomExercise = async (
  userId: string,
  prepared: PreparedCustomExercise
) => {
  // Nested writes, so the exercise and its links land in one statement — a
  // half-linked exercise would sit in the catalogue fatiguing nothing.
  const created = await prisma.exercise.create({
    data: {
      name: prepared.name,
      description: prepared.description,
      modalityId: prepared.modalityId,
      createdByUserId: userId,
      damageFactor: prepared.damageFactor,
      loadFactor: prepared.loadFactor,
      // Distance-based scoring needs a per-movement reference speed that cannot
      // be guessed, so a custom cardio movement is scored on duration.
      referenceSpeedKmh: null,
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
    // A brand-new movement has no history, so nothing can be fatigued by it yet.
    fatigueWarning: false,
    maxMuscleFatigue: 0,
    injuryCaution: false,
    needsMissingEquipment: false,
  }
}

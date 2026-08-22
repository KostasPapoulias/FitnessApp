import prisma from '../lib/prisma'
import { NOTIFICATION_TYPES } from './notification-preference.service'

/**
 * Saved plans: creating them, putting them on a date, and turning one into a
 * real session.
 *
 * The boundary this file defends is the one between intention and record. A
 * WorkoutTemplate is editable and repeatable and means nothing physiologically.
 * A WorkoutSession is the log that muscle fatigue, training load and every
 * progression suggestion are computed from. Work flows one way — a template
 * seeds a session, a finished session updates the template's counters — and
 * nothing here ever edits a set that was actually performed.
 */

/** Ceilings on anything that gets written, whoever proposed it. */
export const LIMITS = {
  nameLength: 80,
  notesLength: 500,
  exercises: 20,
  setsPerExercise: 12,
  reps: 200,
  weightKg: 500,
  restSeconds: 900,
  distanceM: 200_000,
  timeSeconds: 86_400,
  rounds: 100,
  /** How far ahead a workout may be scheduled. */
  scheduleDays: 365,
} as const

export interface TemplateSetInput {
  reps?: number | null
  weight?: number | null
  rpe?: number | null
  restSeconds?: number | null
  distance?: number | null
  time?: number | null
  rounds?: number | null
}

export interface TemplateExerciseInput {
  exerciseId: string
  notes?: string | null
  sets: TemplateSetInput[]
}

export interface TemplateInput {
  name: string
  notes?: string | null
  source?: 'user' | 'ai'
  exercises: TemplateExerciseInput[]
}

export class TemplateValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateValidationError'
  }
}

const clamp = (value: unknown, min: number, max: number): number | null => {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(max, Math.max(min, n))
}

const trim = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t ? t.slice(0, max) : null
}

/**
 * Turn an untrusted draft into something safe to persist.
 *
 * Every exercise id is checked against the catalogue rather than trusted,
 * because the single most likely thing a language model gets wrong is an
 * identifier: it will happily invent a plausible uuid, and an unchecked insert
 * would fail on a foreign key at best and attach to an unrelated movement at
 * worst. Numbers are clamped rather than rejected so one silly weight does not
 * throw away an otherwise good plan.
 */
export const validateTemplateInput = async (
  input: TemplateInput
): Promise<TemplateInput & { name: string }> => {
  const name = trim(input?.name, LIMITS.nameLength)
  if (!name) throw new TemplateValidationError('A workout needs a name.')

  const rawExercises = Array.isArray(input?.exercises) ? input.exercises : []
  if (rawExercises.length === 0) {
    throw new TemplateValidationError('A workout needs at least one exercise.')
  }
  if (rawExercises.length > LIMITS.exercises) {
    throw new TemplateValidationError(`A workout can hold at most ${LIMITS.exercises} exercises.`)
  }

  const ids = rawExercises.map(e => String(e?.exerciseId ?? ''))
  const found = await prisma.exercise.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })
  const known = new Set(found.map(e => e.id))

  const missing = ids.filter(id => !known.has(id))
  if (missing.length > 0) {
    throw new TemplateValidationError(
      `${missing.length} exercise${missing.length === 1 ? '' : 's'} in that plan could not be matched to the catalogue.`
    )
  }

  const exercises: TemplateExerciseInput[] = rawExercises.map(exercise => {
    const rawSets = Array.isArray(exercise.sets) ? exercise.sets : []
    // An exercise with no sets is a plan that says nothing. One default set is
    // more useful than a validation failure the athlete has to go and fix.
    const sets = (rawSets.length > 0 ? rawSets : [{ reps: 10, rpe: 7, restSeconds: 90 }])
      .slice(0, LIMITS.setsPerExercise)
      .map(set => ({
        reps: clamp(set?.reps, 0, LIMITS.reps),
        weight: clamp(set?.weight, 0, LIMITS.weightKg),
        rpe: clamp(set?.rpe, 1, 10),
        restSeconds: clamp(set?.restSeconds, 0, LIMITS.restSeconds),
        distance: clamp(set?.distance, 0, LIMITS.distanceM),
        time: clamp(set?.time, 0, LIMITS.timeSeconds),
        rounds: clamp(set?.rounds, 0, LIMITS.rounds),
      }))

    return {
      exerciseId: exercise.exerciseId,
      notes: trim(exercise.notes, LIMITS.notesLength),
      sets,
    }
  })

  return {
    name,
    notes: trim(input?.notes, LIMITS.notesLength),
    source: input?.source === 'ai' ? 'ai' : 'user',
    exercises,
  }
}

const EXERCISE_INCLUDE = {
  modality: true,
  muscleLinks: { include: { muscle: true } },
  categoryLinks: { include: { category: true } },
  equipmentLinks: { include: { equipment: true } },
}

const TEMPLATE_INCLUDE = {
  exercises: {
    orderBy: { orderIndex: 'asc' as const },
    include: {
      exercise: { include: EXERCISE_INCLUDE },
      sets: { orderBy: { setNumber: 'asc' as const } },
    },
  },
}

/**
 * Flatten an exercise into the shape the catalogue endpoint serves.
 *
 * The planner and the live views read exercises from either source and cannot
 * tell them apart, so the two must agree. This file used to hand back Prisma's
 * raw row, where `modality` is the related RECORD rather than its name and the
 * muscle/category/equipment links are still link rows. Both differences were
 * crashes, not cosmetic: React refuses to render an object as a child, so
 * opening a saved plan blanked the whole app, and `exercise.muscles` being
 * absent took the live session down one screen later.
 *
 * Fatigue flags are deliberately not reproduced here. They describe the
 * athlete at this moment rather than the plan, they cost a lookup per request,
 * and no screen in the planner shows them.
 */
const serializeExercise = (exercise: {
  id: string
  name: string
  description: string | null
  createdByUserId: string | null
  modality: { name: string }
  muscleLinks: { muscleId: string; impactFactor: number; muscle: { name: string } }[]
  categoryLinks: { category: { name: string } }[]
  equipmentLinks: { equipment: { name: string } }[]
}) => ({
  id: exercise.id,
  name: exercise.name,
  description: exercise.description,
  modality: exercise.modality.name,
  muscles: exercise.muscleLinks.map(ml => ({
    id: ml.muscleId,
    name: ml.muscle.name,
    impactFactor: ml.impactFactor,
  })),
  categories: exercise.categoryLinks.map(cl => cl.category.name),
  equipment: exercise.equipmentLinks.map(el => el.equipment.name),
  isCustom: exercise.createdByUserId !== null,
})

type RawTemplateExercise = { exercise: Parameters<typeof serializeExercise>[0] }

/** Everything else on the row is passed through untouched — including Dates,
 *  which callers such as the AI tool layer still format themselves. */
const serializeTemplate = <T extends { exercises: RawTemplateExercise[] }>(template: T) => ({
  ...template,
  exercises: template.exercises.map(te => ({ ...te, exercise: serializeExercise(te.exercise) })),
})

const serializeScheduled = <T extends { template: { exercises: RawTemplateExercise[] } }>(slot: T) => ({
  ...slot,
  template: serializeTemplate(slot.template),
})

export const createTemplate = async (userId: string, input: TemplateInput) => {
  const clean = await validateTemplateInput(input)

  return serializeTemplate(await prisma.workoutTemplate.create({
    data: {
      userId,
      name: clean.name,
      notes: clean.notes,
      source: clean.source ?? 'user',
      exercises: {
        create: clean.exercises.map((exercise, index) => ({
          exerciseId: exercise.exerciseId,
          orderIndex: index,
          notes: exercise.notes,
          sets: {
            create: exercise.sets.map((set, setIndex) => ({
              setNumber: setIndex + 1,
              ...set,
            })),
          },
        })),
      },
    },
    include: TEMPLATE_INCLUDE,
  }))
}

export const listTemplates = async (
  userId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {}
) => {
  const templates = await prisma.workoutTemplate.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    include: TEMPLATE_INCLUDE,
    orderBy: [{ archivedAt: 'asc' }, { lastPerformedAt: 'desc' }, { createdAt: 'desc' }],
  })
  return templates.map(serializeTemplate)
}

export const getTemplate = async (userId: string, id: string) => {
  const template = await prisma.workoutTemplate.findFirst({
    where: { id, userId },
    include: TEMPLATE_INCLUDE,
  })
  return template && serializeTemplate(template)
}

/**
 * Replace a template's contents.
 *
 * Exercises and sets are deleted and rewritten rather than diffed. A plan is
 * small, and a diff would have to reconcile reordering, insertion and removal
 * to save a handful of rows — the reconciliation is where the bugs would be.
 */
export const updateTemplate = async (userId: string, id: string, input: TemplateInput) => {
  const owned = await prisma.workoutTemplate.findFirst({ where: { id, userId }, select: { id: true } })
  if (!owned) return null

  const clean = await validateTemplateInput(input)

  return prisma.$transaction(async tx => {
    await tx.templateExercise.deleteMany({ where: { templateId: id } })
    return serializeTemplate(await tx.workoutTemplate.update({
      where: { id },
      data: {
        name: clean.name,
        notes: clean.notes,
        exercises: {
          create: clean.exercises.map((exercise, index) => ({
            exerciseId: exercise.exerciseId,
            orderIndex: index,
            notes: exercise.notes,
            sets: {
              create: exercise.sets.map((set, setIndex) => ({
                setNumber: setIndex + 1,
                ...set,
              })),
            },
          })),
        },
      },
      include: TEMPLATE_INCLUDE,
    }))
  })
}

/** Archive, or bring one back. Templates are never destroyed. */
export const setTemplateArchived = async (userId: string, id: string, archived: boolean) => {
  const owned = await prisma.workoutTemplate.findFirst({ where: { id, userId }, select: { id: true } })
  if (!owned) return null

  return serializeTemplate(await prisma.workoutTemplate.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
    include: TEMPLATE_INCLUDE,
  }))
}

/**
 * Save a finished session as a repeatable plan.
 *
 * Reads what was actually performed and freezes it as the target for next time,
 * which is the honest starting point for "do that again" — better than any
 * suggestion, because the athlete has already proved they can do it.
 */
export const templateFromSession = async (userId: string, sessionId: string, name?: string) => {
  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, userId },
    include: {
      workoutExercises: {
        orderBy: { orderIndex: 'asc' },
        include: {
          exercise: true,
          sets: {
            orderBy: { setNumber: 'asc' },
            include: { strength: true, calisthenics: true, cardio: true, wod: true, mobility: true },
          },
        },
      },
    },
  })
  if (!session) return null
  if (session.workoutExercises.length === 0) {
    throw new TemplateValidationError('That session has no exercises to save.')
  }

  const input: TemplateInput = {
    name: name?.trim() || `${new Date(session.dateTime).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    })} session`,
    source: 'user',
    exercises: session.workoutExercises.map(we => ({
      exerciseId: we.exerciseId,
      notes: we.notes,
      sets: we.sets.map(set => ({
        reps: set.strength?.reps ?? set.calisthenics?.reps ?? set.wod?.reps ?? null,
        weight: set.strength?.weight ?? set.calisthenics?.addedWeight ?? null,
        rpe: set.rpe,
        restSeconds: set.restSeconds,
        distance: set.cardio?.distance ?? set.wod?.distance ?? null,
        time: set.cardio?.time ?? set.wod?.time ?? set.mobility?.time ?? set.calisthenics?.time ?? null,
        rounds: set.wod?.rounds ?? null,
      })),
    })),
  }

  return createTemplate(userId, input)
}

// ── scheduling ────────────────────────────────────────────────────────────

const SCHEDULED_INCLUDE = {
  template: { include: TEMPLATE_INCLUDE },
}

/**
 * Put a template on a date, optionally with a reminder.
 *
 * The reminder becomes a row in Notification rather than a timer here. That
 * table already owns quiet hours, the daily cap, dedupe and delivery receipts,
 * and a second thing writing to the same phone is how people end up with
 * duplicate pushes at six in the morning.
 */
export const scheduleTemplate = async (
  userId: string,
  { templateId, scheduledFor, reminderAt }: {
    templateId: string
    scheduledFor: Date
    reminderAt?: Date | null
  }
) => {
  const template = await prisma.workoutTemplate.findFirst({
    where: { id: templateId, userId },
    select: { id: true, name: true },
  })
  if (!template) return null

  const horizon = Date.now() + LIMITS.scheduleDays * 86_400_000
  if (!(scheduledFor instanceof Date) || Number.isNaN(scheduledFor.getTime())) {
    throw new TemplateValidationError('That date could not be understood.')
  }
  if (scheduledFor.getTime() > horizon) {
    throw new TemplateValidationError('Workouts can only be scheduled up to a year ahead.')
  }

  // A reminder for a moment that has already passed would fire the instant it
  // is created, which reads as a bug rather than a reminder.
  const reminder =
    reminderAt instanceof Date &&
    !Number.isNaN(reminderAt.getTime()) &&
    reminderAt.getTime() > Date.now()
      ? reminderAt
      : null

  let notificationId: string | null = null
  if (reminder) {
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: NOTIFICATION_TYPES.WORKOUT_REMINDER,
        tier: 'essential',
        source: 'rule',
        title: '🏋️ Workout on standby',
        body: `${template.name} is scheduled. Ready when you are.`,
        status: 'planned',
        plannedFor: reminder,
        // Scoped to the slot, so re-scheduling the same template to a different
        // day is a different reminder rather than a silently dropped duplicate.
        dedupeKey: `workout_reminder:${templateId}:${reminder.toISOString()}`,
      },
    })
    notificationId = notification.id
  }

  return serializeScheduled(await prisma.scheduledWorkout.create({
    data: {
      userId,
      templateId,
      scheduledFor,
      reminderAt: reminder,
      notificationId,
      status: 'standby',
    },
    include: SCHEDULED_INCLUDE,
  }))
}

export const listScheduled = async (
  userId: string,
  { status }: { status?: string } = {}
) => {
  const slots = await prisma.scheduledWorkout.findMany({
    where: { userId, ...(status ? { status } : {}) },
    include: SCHEDULED_INCLUDE,
    orderBy: { scheduledFor: 'asc' },
  })
  return slots.map(serializeScheduled)
}

/**
 * Cancel a standby slot, withdrawing its reminder.
 *
 * The notification is deleted only while it is still `planned`. Once it has
 * been sent, the row is the record that it reached the phone — deleting it
 * would erase a delivery receipt the engagement tracking depends on.
 */
export const cancelScheduled = async (userId: string, id: string) => {
  const scheduled = await prisma.scheduledWorkout.findFirst({ where: { id, userId } })
  if (!scheduled) return null

  if (scheduled.notificationId) {
    await prisma.notification.deleteMany({
      where: { id: scheduled.notificationId, userId, status: 'planned' },
    })
  }

  return serializeScheduled(await prisma.scheduledWorkout.update({
    where: { id },
    data: { status: 'cancelled', notificationId: null },
    include: SCHEDULED_INCLUDE,
  }))
}

/**
 * Bind a scheduled slot to the session that fulfils it.
 *
 * Called once the athlete actually starts training from the plan. Counters on
 * the template advance here rather than at schedule time — a workout that was
 * planned and skipped has not been performed, and letting it count would make
 * "how often do I actually do this" a measure of intention.
 */
export const startScheduled = async (userId: string, id: string, sessionId: string) => {
  const scheduled = await prisma.scheduledWorkout.findFirst({
    where: { id, userId },
    include: { template: { select: { id: true } } },
  })
  if (!scheduled) return null

  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  })
  if (!session) return null

  return prisma.$transaction(async tx => {
    await tx.workoutSession.update({
      where: { id: sessionId },
      data: { templateId: scheduled.templateId },
    })
    await tx.workoutTemplate.update({
      where: { id: scheduled.templateId },
      data: { timesPerformed: { increment: 1 }, lastPerformedAt: new Date() },
    })
    return serializeScheduled(await tx.scheduledWorkout.update({
      where: { id },
      data: { status: 'started', sessionId },
      include: SCHEDULED_INCLUDE,
    }))
  })
}

/** Mark a slot done or deliberately skipped. */
export const closeScheduled = async (
  userId: string,
  id: string,
  status: 'completed' | 'skipped'
) => {
  const scheduled = await prisma.scheduledWorkout.findFirst({ where: { id, userId }, select: { id: true } })
  if (!scheduled) return null

  return serializeScheduled(await prisma.scheduledWorkout.update({
    where: { id },
    data: { status, completedAt: status === 'completed' ? new Date() : null },
    include: SCHEDULED_INCLUDE,
  }))
}

import { FunctionDeclaration, SchemaType } from '@google/generative-ai'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import {
  LIMITS, TemplateValidationError, createTemplate, listScheduled, listTemplates,
  scheduleTemplate, validateTemplateInput,
} from './template.service'

/**
 * What the coach is allowed to look up, and what it is allowed to draft.
 *
 * The split is the whole safety model, so it is worth stating plainly:
 *
 *   READ tools run. They are scoped to the caller's own userId — which the
 *   model never supplies and cannot influence — and they cannot change
 *   anything, so there is nothing to confirm and no reason to make the athlete
 *   approve a lookup mid-conversation.
 *
 *   WRITE tools do not run. They validate a draft, store it as an AiProposal,
 *   and return a card for the athlete to tap. The model has no path to the
 *   app's own tables at all. This is not caution about tone or phrasing: an
 *   invented exercise id or a misheard weight becomes training history, and
 *   fatigue, training load and every future suggestion are computed from that
 *   history. A wrong number does not stay wrong in one place.
 *
 * Deliberately absent, and not by oversight: nothing deletes, nothing edits a
 * set that was already performed, and nothing touches security settings or
 * sends a notification directly. Completed sessions are append-only to the AI.
 */

/** How long a drafted card stays applicable. */
export const PROPOSAL_TTL_MS = 30 * 60 * 1000

/** Stops a confused model looping through lookups on one message. */
export const MAX_TOOL_CALLS_PER_MESSAGE = 6

const READ_TOOLS = [
  'search_exercises',
  'get_workout_history',
  'get_exercise_progress',
  'get_muscle_volume',
  'get_recent_nutrition',
  'get_recent_sleep',
  'list_templates',
  'list_scheduled',
] as const

const WRITE_TOOLS = ['propose_workout', 'propose_schedule'] as const

export const isWriteTool = (name: string): boolean =>
  (WRITE_TOOLS as readonly string[]).includes(name)

export const isKnownTool = (name: string): boolean =>
  isWriteTool(name) || (READ_TOOLS as readonly string[]).includes(name)

// ── declarations ──────────────────────────────────────────────────────────

const setSchema = {
  type: SchemaType.OBJECT,
  properties: {
    reps: { type: SchemaType.INTEGER, description: 'Reps. For mobility, seconds held. For a WOD movement, reps per round.' },
    weight: { type: SchemaType.NUMBER, description: 'Kilograms. 0 for bodyweight.' },
    rpe: { type: SchemaType.NUMBER, description: 'Target effort 1-10.' },
    restSeconds: { type: SchemaType.INTEGER, description: 'Rest after this set.' },
    distance: { type: SchemaType.NUMBER, description: 'Metres, for cardio or a WOD.' },
    time: { type: SchemaType.INTEGER, description: 'Seconds, for cardio, holds or a time cap.' },
    rounds: { type: SchemaType.NUMBER, description: 'Target rounds, for a WOD.' },
  },
} as const

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_exercises',
    description:
      'Search the exercise catalogue. Call this before proposing any workout — it returns the real exercise ids that a plan must be built from. Never invent an id.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Name or part of a name, e.g. "romanian deadlift".' },
        modality: { type: SchemaType.STRING, description: 'One of Strength, Calisthenics, Cardio, WOD, Mobility.' },
        muscle: { type: SchemaType.STRING, description: 'Muscle name, e.g. "Hamstrings".' },
        limit: { type: SchemaType.INTEGER, description: 'Max results, default 15.' },
      },
    },
  },
  {
    name: 'get_workout_history',
    description:
      'Past training sessions with their exercises and sets. Use for questions about what was done, when, and how heavy.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        days: { type: SchemaType.INTEGER, description: 'How far back to look. Default 30, max 365.' },
        exerciseName: { type: SchemaType.STRING, description: 'Only sessions containing this exercise.' },
        limit: { type: SchemaType.INTEGER, description: 'Max sessions, default 10.' },
      },
    },
  },
  {
    name: 'get_exercise_progress',
    description:
      'Estimated one-rep max over time plus the best recent sets for one exercise. Use for "am I getting stronger" and PR questions.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { exerciseName: { type: SchemaType.STRING, description: 'Exercise to trace.' } },
      required: ['exerciseName'],
    },
  },
  {
    name: 'get_muscle_volume',
    description: 'Sets performed per muscle per week. Use for balance, neglect and overload questions.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { weeks: { type: SchemaType.INTEGER, description: 'Weeks back, default 8, max 26.' } },
    },
  },
  {
    name: 'get_recent_nutrition',
    description: 'Logged nutrition totals per day.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { days: { type: SchemaType.INTEGER, description: 'Days back, default 7, max 90.' } },
    },
  },
  {
    name: 'get_recent_sleep',
    description: 'Logged sleep per night.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { days: { type: SchemaType.INTEGER, description: 'Days back, default 7, max 90.' } },
    },
  },
  {
    name: 'list_templates',
    description: 'The athlete\'s saved workout plans, with how often each has been performed.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { includeArchived: { type: SchemaType.BOOLEAN, description: 'Include archived plans.' } },
    },
  },
  {
    name: 'list_scheduled',
    description: 'Workouts currently on standby with a date, and their reminders.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },

  // ── drafting ──
  {
    name: 'propose_workout',
    description:
      'Draft a workout for the athlete to review. This does NOT save anything — it shows them a card they must tap to accept. Always call search_exercises first so every exerciseId is real. Optionally include a date to offer scheduling on the same card.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Short name, e.g. "Upper push - moderate".' },
        notes: { type: SchemaType.STRING, description: 'One line on the intent of the session.' },
        exercises: {
          type: SchemaType.ARRAY,
          description: 'In the order they should be performed.',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              exerciseId: { type: SchemaType.STRING, description: 'A real id from search_exercises.' },
              notes: { type: SchemaType.STRING },
              sets: { type: SchemaType.ARRAY, items: setSchema },
            },
            required: ['exerciseId', 'sets'],
          },
        },
        scheduledFor: { type: SchemaType.STRING, description: 'ISO 8601 datetime to place it on, if the athlete asked for a date.' },
        reminderAt: { type: SchemaType.STRING, description: 'ISO 8601 datetime for a reminder. Requires scheduledFor.' },
      },
      required: ['name', 'exercises'],
    },
  },
  {
    name: 'propose_schedule',
    description:
      'Draft putting an EXISTING saved plan on a date. Does NOT save — the athlete taps to accept. Get the templateId from list_templates.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        templateId: { type: SchemaType.STRING, description: 'A real id from list_templates.' },
        scheduledFor: { type: SchemaType.STRING, description: 'ISO 8601 datetime.' },
        reminderAt: { type: SchemaType.STRING, description: 'ISO 8601 datetime for the reminder.' },
      },
      required: ['templateId', 'scheduledFor'],
    },
  },
]

// ── helpers ───────────────────────────────────────────────────────────────

const intArg = (value: unknown, fallback: number, max: number) => {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)

/** Parse a model-supplied timestamp, refusing anything unusable. */
const parseDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const describeSet = (set: {
  reps: number | null; weight: number | null; rpe: number | null
  restSeconds: number | null; distance: number | null; time: number | null; rounds: number | null
}) => {
  const parts: string[] = []
  if (set.reps != null) parts.push(`${set.reps} reps`)
  if (set.weight != null && set.weight > 0) parts.push(`${set.weight}kg`)
  if (set.distance != null) parts.push(`${set.distance}m`)
  if (set.time != null) parts.push(`${set.time}s`)
  if (set.rounds != null) parts.push(`${set.rounds} rounds`)
  if (set.rpe != null) parts.push(`RPE ${set.rpe}`)
  return parts.join(' · ')
}

// ── read execution ────────────────────────────────────────────────────────

/**
 * Run a lookup. Always scoped to `userId` from the verified token — the model
 * has no say in whose data it reads.
 */
export const executeReadTool = async (
  userId: string,
  name: string,
  args: Record<string, any>
): Promise<object> => {
  switch (name) {
    case 'search_exercises': {
      const limit = intArg(args.limit, 15, 40)
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      const exercises = await prisma.exercise.findMany({
        where: {
          ...(query ? { name: { contains: query, mode: 'insensitive' as const } } : {}),
          ...(args.modality ? { modality: { name: { equals: String(args.modality), mode: 'insensitive' as const } } } : {}),
          ...(args.muscle
            ? { muscleLinks: { some: { muscle: { name: { equals: String(args.muscle), mode: 'insensitive' as const } } } } }
            : {}),
          // Catalogue movements plus this athlete's own, never another user's.
          OR: [{ createdByUserId: null }, { createdByUserId: userId }],
        },
        include: { modality: true, muscleLinks: { include: { muscle: true } } },
        take: limit,
        orderBy: { name: 'asc' },
      })

      return {
        count: exercises.length,
        exercises: exercises.map(e => ({
          exerciseId: e.id,
          name: e.name,
          modality: e.modality.name,
          muscles: e.muscleLinks.map(m => m.muscle.name),
        })),
      }
    }

    case 'get_workout_history': {
      const days = intArg(args.days, 30, 365)
      const limit = intArg(args.limit, 10, 30)
      const exerciseName = typeof args.exerciseName === 'string' ? args.exerciseName.trim() : ''

      const sessions = await prisma.workoutSession.findMany({
        where: {
          userId,
          dateTime: { gte: daysAgo(days) },
          ...(exerciseName
            ? { workoutExercises: { some: { exercise: { name: { contains: exerciseName, mode: 'insensitive' as const } } } } }
            : {}),
        },
        include: {
          workoutExercises: {
            orderBy: { orderIndex: 'asc' },
            include: {
              exercise: { select: { name: true } },
              sets: {
                orderBy: { setNumber: 'asc' },
                include: { strength: true, calisthenics: true, cardio: true, wod: true, mobility: true },
              },
            },
          },
        },
        orderBy: { dateTime: 'desc' },
        take: limit,
      })

      return {
        count: sessions.length,
        sessions: sessions.map(s => ({
          date: s.dateTime.toISOString().slice(0, 10),
          durationMin: s.duration ? Math.round(s.duration / 60) : null,
          avgRpe: s.avgRpe,
          totalVolumeKg: s.totalVolume ? Math.round(s.totalVolume) : null,
          notes: s.notes,
          exercises: s.workoutExercises.map(we => ({
            name: we.exercise.name,
            sets: we.sets.map(set => ({
              reps: set.strength?.reps ?? set.calisthenics?.reps ?? set.wod?.reps ?? null,
              weightKg: set.strength?.weight ?? set.calisthenics?.addedWeight ?? null,
              distanceM: set.cardio?.distance ?? set.wod?.distance ?? null,
              seconds: set.cardio?.time ?? set.wod?.time ?? set.mobility?.time ?? set.calisthenics?.time ?? null,
              rounds: set.wod?.rounds ?? null,
              rpe: set.rpe,
            })),
          })),
        })),
      }
    }

    case 'get_exercise_progress': {
      const exerciseName = String(args.exerciseName ?? '').trim()
      if (!exerciseName) return { error: 'exerciseName is required' }

      const exercise = await prisma.exercise.findFirst({
        where: { name: { contains: exerciseName, mode: 'insensitive' } },
        select: { id: true, name: true },
      })
      if (!exercise) return { found: false, message: `No exercise matching "${exerciseName}".` }

      const estimate = await prisma.exerciseStrengthEstimate.findFirst({
        where: { userId, exerciseId: exercise.id },
      })

      const sets = await prisma.workoutSet.findMany({
        where: {
          workoutExercise: { exerciseId: exercise.id, session: { userId } },
          strength: { isNot: null },
        },
        include: {
          strength: true,
          workoutExercise: { include: { session: { select: { dateTime: true } } } },
        },
        orderBy: { workoutExercise: { session: { dateTime: 'desc' } } },
        take: 40,
      })

      const performed = sets.map(s => ({
        date: s.workoutExercise.session.dateTime.toISOString().slice(0, 10),
        reps: s.strength!.reps,
        weightKg: s.strength!.weight,
        rpe: s.rpe,
      }))

      const heaviest = performed.reduce<typeof performed[number] | null>(
        (best, set) => (!best || set.weightKg > best.weightKg ? set : best), null
      )

      return {
        found: true,
        exercise: exercise.name,
        estimatedOneRepMaxKg: estimate?.e1rm ?? null,
        estimateUpdated: estimate?.updatedAt?.toISOString().slice(0, 10) ?? null,
        heaviestSet: heaviest,
        recentSets: performed.slice(0, 20),
      }
    }

    case 'get_muscle_volume': {
      const weeks = intArg(args.weeks, 8, 26)
      const since = daysAgo(weeks * 7)

      const workoutExercises = await prisma.workoutExercise.findMany({
        where: { session: { userId, dateTime: { gte: since } } },
        include: {
          exercise: { include: { muscleLinks: { include: { muscle: true } } } },
          sets: { select: { id: true } },
        },
      })

      const setsByMuscle = new Map<string, number>()
      for (const we of workoutExercises) {
        for (const link of we.exercise.muscleLinks) {
          setsByMuscle.set(
            link.muscle.name,
            (setsByMuscle.get(link.muscle.name) ?? 0) + we.sets.length
          )
        }
      }

      return {
        weeks,
        totalSets: Array.from(setsByMuscle.values()).reduce((a, b) => a + b, 0),
        perMuscle: Array.from(setsByMuscle.entries())
          .map(([muscle, sets]) => ({ muscle, sets, setsPerWeek: Math.round((sets / weeks) * 10) / 10 }))
          .sort((a, b) => b.sets - a.sets),
      }
    }

    case 'get_recent_nutrition': {
      const days = intArg(args.days, 7, 90)
      const logs = await prisma.nutritionLog.findMany({
        where: { userId, logDate: { gte: daysAgo(days) } },
        orderBy: { logDate: 'desc' },
      })
      return {
        count: logs.length,
        days: logs.map(l => ({
          date: l.logDate.toISOString().slice(0, 10),
          calories: l.calories,
          proteinG: l.proteinG,
          notes: l.notes,
        })),
      }
    }

    case 'get_recent_sleep': {
      const days = intArg(args.days, 7, 90)
      const logs = await prisma.sleepLog.findMany({
        where: { userId, sleepDate: { gte: daysAgo(days) } },
        orderBy: { sleepDate: 'desc' },
      })
      return {
        count: logs.length,
        nights: logs.map(l => ({
          date: l.sleepDate.toISOString().slice(0, 10),
          hours: Math.round((l.durationMin / 60) * 10) / 10,
          score: l.sleepScore,
        })),
      }
    }

    case 'list_templates': {
      const templates = await listTemplates(userId, { includeArchived: Boolean(args.includeArchived) })
      return {
        count: templates.length,
        templates: templates.map(t => ({
          templateId: t.id,
          name: t.name,
          source: t.source,
          archived: t.archivedAt !== null,
          timesPerformed: t.timesPerformed,
          lastPerformed: t.lastPerformedAt?.toISOString().slice(0, 10) ?? null,
          exercises: t.exercises.map(e => ({
            name: e.exercise.name,
            sets: e.sets.length,
            detail: e.sets.map(describeSet).join(' | '),
          })),
        })),
      }
    }

    case 'list_scheduled': {
      const scheduled = await listScheduled(userId, { status: 'standby' })
      return {
        count: scheduled.length,
        scheduled: scheduled.map(s => ({
          scheduledId: s.id,
          templateId: s.templateId,
          name: s.template.name,
          scheduledFor: s.scheduledFor.toISOString(),
          reminderAt: s.reminderAt?.toISOString() ?? null,
          status: s.status,
        })),
      }
    }

    default:
      return { error: `Unknown tool "${name}".` }
  }
}

// ── drafting ──────────────────────────────────────────────────────────────

export interface ProposalSummary {
  id: string
  kind: string
  title: string
  /** Human-readable lines the card renders. */
  lines: string[]
  scheduledFor: string | null
  reminderAt: string | null
  expiresAt: string
}

/**
 * Validate a draft and stage it for the athlete.
 *
 * Returns both what to tell the model and what to show the user. The two differ
 * on purpose: the model is told, in the function response, that nothing has
 * been saved — without that it reliably announces "done, I've added it to your
 * plan", and the athlete then never taps the card because they believe the work
 * is finished.
 */
export const createProposal = async (
  userId: string,
  threadId: string | null,
  name: string,
  args: Record<string, any>
): Promise<{ toModel: object; proposal: ProposalSummary | null }> => {
  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS)

  try {
    if (name === 'propose_workout') {
      const clean = await validateTemplateInput({
        name: String(args.name ?? ''),
        notes: args.notes ?? null,
        source: 'ai',
        exercises: Array.isArray(args.exercises) ? args.exercises : [],
      })

      const scheduledFor = parseDate(args.scheduledFor)
      // A reminder without a date to remind about is meaningless, and silently
      // keeping it would schedule a push for a workout that is not on the plan.
      const reminderAt = scheduledFor ? parseDate(args.reminderAt) : null

      const detail = await prisma.exercise.findMany({
        where: { id: { in: clean.exercises.map(e => e.exerciseId) } },
        select: { id: true, name: true },
      })
      const nameById = new Map(detail.map(e => [e.id, e.name]))

      const payload = { template: clean, scheduledFor: scheduledFor?.toISOString() ?? null, reminderAt: reminderAt?.toISOString() ?? null }

      const row = await prisma.aiProposal.create({
        // Structurally plain JSON; the interfaces it is built from just lack the
        // index signature Prisma's Json input type asks for.
        data: { userId, threadId, kind: 'create_template', payload: payload as unknown as Prisma.InputJsonObject, expiresAt },
      })

      const lines = clean.exercises.map(exercise => {
        const label = nameById.get(exercise.exerciseId) ?? 'Exercise'
        const summary = exercise.sets.map(s => describeSet({
          reps: s.reps ?? null, weight: s.weight ?? null, rpe: s.rpe ?? null,
          restSeconds: s.restSeconds ?? null, distance: s.distance ?? null,
          time: s.time ?? null, rounds: s.rounds ?? null,
        })).filter(Boolean)
        return `${label} — ${exercise.sets.length} × (${summary[0] ?? 'as planned'})`
      })

      return {
        toModel: {
          status: 'drafted_not_saved',
          message:
            'A card has been shown to the athlete. Nothing is saved until they tap it. Tell them it is ready to review — do NOT say it has been added, saved or scheduled.',
          exerciseCount: clean.exercises.length,
        },
        proposal: {
          id: row.id,
          kind: 'create_template',
          title: clean.name,
          lines,
          scheduledFor: payload.scheduledFor,
          reminderAt: payload.reminderAt,
          expiresAt: expiresAt.toISOString(),
        },
      }
    }

    if (name === 'propose_schedule') {
      const templateId = String(args.templateId ?? '')
      const template = await prisma.workoutTemplate.findFirst({
        where: { id: templateId, userId },
        select: { id: true, name: true },
      })
      if (!template) {
        return {
          toModel: { error: 'No saved plan with that id. Call list_templates and use an id from the result.' },
          proposal: null,
        }
      }

      const scheduledFor = parseDate(args.scheduledFor)
      if (!scheduledFor) {
        return { toModel: { error: 'scheduledFor must be an ISO 8601 datetime.' }, proposal: null }
      }
      if (scheduledFor.getTime() > Date.now() + LIMITS.scheduleDays * 86_400_000) {
        return { toModel: { error: 'Workouts can only be scheduled up to a year ahead.' }, proposal: null }
      }
      const reminderAt = parseDate(args.reminderAt)

      const payload = {
        templateId: template.id,
        scheduledFor: scheduledFor.toISOString(),
        reminderAt: reminderAt?.toISOString() ?? null,
      }

      const row = await prisma.aiProposal.create({
        data: { userId, threadId, kind: 'schedule_workout', payload, expiresAt },
      })

      return {
        toModel: {
          status: 'drafted_not_saved',
          message:
            'A card has been shown to the athlete. Nothing is scheduled until they tap it. Do NOT say it has been scheduled.',
        },
        proposal: {
          id: row.id,
          kind: 'schedule_workout',
          title: template.name,
          lines: [`Put "${template.name}" on standby`],
          scheduledFor: payload.scheduledFor,
          reminderAt: payload.reminderAt,
          expiresAt: expiresAt.toISOString(),
        },
      }
    }

    return { toModel: { error: `Unknown tool "${name}".` }, proposal: null }
  } catch (error) {
    // A rejected draft is information the model can act on — usually it means a
    // made-up exercise id, and telling it so gets a corrected second attempt
    // instead of a silent failure the athlete never sees explained.
    const message = error instanceof TemplateValidationError
      ? error.message
      : 'That draft could not be prepared.'
    return { toModel: { error: message }, proposal: null }
  }
}

// ── applying ──────────────────────────────────────────────────────────────

export class ProposalError extends Error {
  constructor(message: string, readonly code: 'not_found' | 'expired' | 'spent' | 'invalid') {
    super(message)
    this.name = 'ProposalError'
  }
}

/**
 * Turn an accepted card into real data.
 *
 * This is the only function in the AI path that writes to the app's own tables,
 * and it is reachable only from a request carrying the athlete's own token. It
 * applies the payload that was staged and shown — never anything the model says
 * afterwards — so what gets saved is what was on the card they looked at.
 */
export const applyProposal = async (userId: string, proposalId: string) => {
  const row = await prisma.aiProposal.findFirst({ where: { id: proposalId, userId } })
  if (!row) throw new ProposalError('That suggestion is no longer available.', 'not_found')

  if (row.status !== 'pending') {
    throw new ProposalError(
      row.status === 'applied' ? 'That has already been added.' : 'That suggestion was dismissed.',
      'spent'
    )
  }

  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.aiProposal.update({ where: { id: row.id }, data: { status: 'expired' } })
    throw new ProposalError(
      'That suggestion has expired — ask again and I will draft a fresh one.',
      'expired'
    )
  }

  const payload = row.payload as any

  if (row.kind === 'create_template') {
    // Re-validated on the way in as well as on the way out. The row has been
    // sitting in the database, and an exercise could have been removed from the
    // catalogue since it was drafted.
    const template = await createTemplate(userId, { ...payload.template, source: 'ai' })

    let scheduled = null
    if (payload.scheduledFor) {
      scheduled = await scheduleTemplate(userId, {
        templateId: template.id,
        scheduledFor: new Date(payload.scheduledFor),
        reminderAt: payload.reminderAt ? new Date(payload.reminderAt) : null,
      })
    }

    await prisma.aiProposal.update({
      where: { id: row.id },
      data: { status: 'applied', appliedAt: new Date() },
    })
    return { kind: row.kind, template, scheduled }
  }

  if (row.kind === 'schedule_workout') {
    const scheduled = await scheduleTemplate(userId, {
      templateId: String(payload.templateId),
      scheduledFor: new Date(payload.scheduledFor),
      reminderAt: payload.reminderAt ? new Date(payload.reminderAt) : null,
    })
    if (!scheduled) throw new ProposalError('That plan no longer exists.', 'invalid')

    await prisma.aiProposal.update({
      where: { id: row.id },
      data: { status: 'applied', appliedAt: new Date() },
    })
    return { kind: row.kind, template: scheduled.template, scheduled }
  }

  throw new ProposalError('That suggestion is of an unknown kind.', 'invalid')
}

/** Dismiss a card without applying it. */
export const rejectProposal = async (userId: string, proposalId: string) => {
  const { count } = await prisma.aiProposal.updateMany({
    where: { id: proposalId, userId, status: 'pending' },
    data: { status: 'rejected' },
  })
  return count > 0
}

/**
 * Cards still awaiting a decision in a thread.
 *
 * Read when a conversation is reopened so the athlete can still act on
 * something they scrolled past. Expired rows are filtered rather than returned
 * greyed out — a card that cannot be tapped is only a reminder of a missed one.
 */
export const listPendingProposals = async (userId: string, threadId: string) => {
  const rows = await prisma.aiProposal.findMany({
    where: { userId, threadId, status: 'pending', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' },
  })

  return rows.map(row => {
    const payload = row.payload as any
    const template = payload?.template
    return {
      id: row.id,
      kind: row.kind,
      messageId: row.messageId,
      title: template?.name ?? 'Scheduled workout',
      lines: Array.isArray(template?.exercises)
        ? template.exercises.map((e: any) => `${e.sets?.length ?? 0} sets`)
        : [],
      scheduledFor: payload?.scheduledFor ?? null,
      reminderAt: payload?.reminderAt ?? null,
      expiresAt: row.expiresAt.toISOString(),
    }
  })
}

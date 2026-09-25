import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import {
  LIMITS, TemplateValidationError, createTemplate, listScheduled, listTemplates,
  scheduleTemplate, validateTemplateInput,
} from './template.service'
import {
  CustomExerciseError, createCustomExercise, prepareCustomExercise,
} from './custom-exercise.service'

/**
 * The AI coach's tools and its safety model.
 *
 *   READ tools run immediately, always scoped to the caller's userId (never
 *   supplied by the model), and change nothing.
 *   WRITE tools never touch the app's tables: they validate a draft, store it
 *   as an AiProposal and return a card the athlete must tap. An invented id or
 *   misheard weight would otherwise become training history.
 *
 * Nothing here deletes, edits a performed set, changes security settings or
 * sends a notification.
 */

/** How long a drafted card stays applicable. */
export const PROPOSAL_TTL_MS = 30 * 60 * 1000

/** Caps tool calls per message. */
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

const WRITE_TOOLS = ['propose_workout', 'propose_schedule', 'propose_exercise'] as const

export const isWriteTool = (name: string): boolean =>
  (WRITE_TOOLS as readonly string[]).includes(name)

export const isKnownTool = (name: string): boolean =>
  isWriteTool(name) || (READ_TOOLS as readonly string[]).includes(name)

// ── declarations ──────────────────────────────────────────────────────────

const setSchema = {
  type: 'object',
  properties: {
    reps: { type: 'integer', description: 'Reps. For mobility, seconds held. For a WOD movement, reps per round.' },
    weight: { type: 'number', description: 'Kilograms. 0 for bodyweight.' },
    rpe: { type: 'number', description: 'Target effort 1-10.' },
    restSeconds: { type: 'integer', description: 'Rest after this set.' },
    distance: { type: 'number', description: 'Metres, for cardio or a WOD.' },
    time: { type: 'integer', description: 'Seconds, for cardio, holds or a time cap.' },
    rounds: { type: 'number', description: 'Target rounds, for a WOD.' },
  },
} as const

/** A tool declaration in plain JSON Schema, provider-neutral. */
export interface ToolDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: 'search_exercises',
    description:
      'Search the exercise catalogue. Call this before proposing any workout — it returns the real exercise ids that a plan must be built from. Never invent an id.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name or part of a name, e.g. "romanian deadlift".' },
        modality: { type: 'string', description: 'One of Strength, Calisthenics, Cardio, WOD, Mobility.' },
        muscle: { type: 'string', description: 'Muscle name, e.g. "Hamstrings".' },
        limit: { type: 'integer', description: 'Max results, default 15.' },
      },
    },
  },
  {
    name: 'get_workout_history',
    description:
      'Past training sessions with their exercises and sets, plus any note the athlete wrote against an exercise (pain, form, how it felt). Use for questions about what was done, when, how heavy, and how it went.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'How far back to look. Default 30, max 365.' },
        exerciseName: { type: 'string', description: 'Only sessions containing this exercise.' },
        limit: { type: 'integer', description: 'Max sessions, default 10.' },
      },
    },
  },
  {
    name: 'get_exercise_progress',
    description:
      'Estimated one-rep max over time plus the best recent sets for one exercise. Use for "am I getting stronger" and PR questions.',
    parameters: {
      type: 'object',
      properties: { exerciseName: { type: 'string', description: 'Exercise to trace.' } },
      required: ['exerciseName'],
    },
  },
  {
    name: 'get_muscle_volume',
    description: 'Sets performed per muscle per week. Use for balance, neglect and overload questions.',
    parameters: {
      type: 'object',
      properties: { weeks: { type: 'integer', description: 'Weeks back, default 8, max 26.' } },
    },
  },
  {
    name: 'get_recent_nutrition',
    description: 'Logged nutrition totals per day.',
    parameters: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'Days back, default 7, max 90.' } },
    },
  },
  {
    name: 'get_recent_sleep',
    description: 'Logged sleep per night.',
    parameters: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'Days back, default 7, max 90.' } },
    },
  },
  {
    name: 'list_templates',
    description: 'The athlete\'s saved workout plans, with how often each has been performed.',
    parameters: {
      type: 'object',
      properties: { includeArchived: { type: 'boolean', description: 'Include archived plans.' } },
    },
  },
  {
    name: 'list_scheduled',
    description: 'Workouts currently on standby with a date, and their reminders.',
    parameters: { type: 'object', properties: {} },
  },

  // ── drafting ──
  {
    name: 'propose_workout',
    description:
      'Draft a workout for the athlete to review. This does NOT save anything — it shows them a card they must tap to accept. Always call search_exercises first so every exerciseId is real. Optionally include a date to offer scheduling on the same card.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short name, e.g. "Upper push - moderate".' },
        notes: { type: 'string', description: 'One line on the intent of the session.' },
        exercises: {
          type: 'array',
          description: 'In the order they should be performed.',
          items: {
            type: 'object',
            properties: {
              exerciseId: { type: 'string', description: 'A real id from search_exercises.' },
              notes: { type: 'string' },
              sets: { type: 'array', items: setSchema },
            },
            required: ['exerciseId', 'sets'],
          },
        },
        scheduledFor: { type: 'string', description: 'ISO 8601 datetime to place it on, if the athlete asked for a date.' },
        reminderAt: { type: 'string', description: 'ISO 8601 datetime for a reminder. Requires scheduledFor.' },
      },
      required: ['name', 'exercises'],
    },
  },
  {
    name: 'propose_schedule',
    description:
      'Draft putting an EXISTING saved plan on a date. Does NOT save — the athlete taps to accept. Get the templateId from list_templates.',
    parameters: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: 'A real id from list_templates.' },
        scheduledFor: { type: 'string', description: 'ISO 8601 datetime.' },
        reminderAt: { type: 'string', description: 'ISO 8601 datetime for the reminder.' },
      },
      required: ['templateId', 'scheduledFor'],
    },
  },
  {
    name: 'propose_exercise',
    description:
      'Draft a NEW custom exercise for the athlete to review, for a movement that search_exercises could not find. Does NOT save — they tap to accept. Always search first; if a close match already exists, use it instead of inventing a duplicate. Never guess on the athlete\'s behalf: if you do not know which muscles the movement works, ask them.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What the movement is called, e.g. "Bulgarian Split Squat".' },
        modality: {
          type: 'string',
          description: 'One of: Strength, Calisthenics, Cardio, WOD, Mobility.',
        },
        description: {
          type: 'string',
          description: 'How to perform it — setup and the cues that matter. A couple of sentences.',
        },
        muscles: {
          type: 'array',
          description: 'The muscles worked. At least one must be primary.',
          items: {
            type: 'object',
            properties: {
              muscle: {
                type: 'string',
                description: 'Muscle name, e.g. "Quadriceps", "Lats", "Lower Back".',
              },
              role: {
                type: 'string',
                description: '"primary" if the movement is really for this muscle, "secondary" if it only assists.',
              },
            },
            required: ['muscle', 'role'],
          },
        },
        categories: { type: 'array', items: { type: 'string' }, description: 'Category names, e.g. "Legs".' },
        equipment: { type: 'array', items: { type: 'string' }, description: 'Equipment names needed, e.g. "Dumbbell".' },
      },
      required: ['name', 'modality', 'muscles'],
    },
  },
]

// ── helpers ───────────────────────────────────────────────────────────────

const intArg = (value: unknown, fallback: number, max: number) => {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)

/** Parse a model-supplied timestamp; null when unusable. */
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

/** Run a read tool, scoped to `userId` from the verified token. */
export const executeReadTool = async (
  userId: string,
  name: string,
  args: Record<string, any>
): Promise<object> => {
  switch (name) {
    case 'search_exercises': {
      const limit = intArg(args.limit, 15, 40)
      const query = typeof args.query === 'string' ? args.query.trim() : ''

      // Each word matched independently, so word order and extra words don't matter
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean)

      const runSearch = (words: string[]) => prisma.exercise.findMany({
        where: {
          ...(words.length > 0
            ? { AND: words.map(word => ({ name: { contains: word, mode: 'insensitive' as const } })) }
            : {}),
          ...(args.modality ? { modality: { name: { equals: String(args.modality), mode: 'insensitive' as const } } } : {}),
          ...(args.muscle
            ? { muscleLinks: { some: { muscle: { name: { equals: String(args.muscle), mode: 'insensitive' as const } } } } }
            : {}),
          // Catalogue movements plus this athlete's own
          OR: [{ createdByUserId: null }, { createdByUserId: userId }],
        },
        include: { modality: true, muscleLinks: { include: { muscle: true } } },
        take: limit,
        orderBy: { name: 'asc' },
      })

      let exercises = await runSearch(terms)
      let widenedTo: string | null = null

      // Nothing found: retry with singular words, then the longest single word
      if (exercises.length === 0 && terms.length > 0) {
        const singular = terms.map(t => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t))
        exercises = await runSearch(singular)
        if (exercises.length > 0) widenedTo = singular.join(' ')

        if (exercises.length === 0) {
          const longest = singular.reduce((a, b) => (b.length > a.length ? b : a), '')
          if (longest.length >= 3) {
            exercises = await runSearch([longest])
            if (exercises.length > 0) widenedTo = longest
          }
        }
      }

      return {
        count: exercises.length,
        // Tell the model what happened and what to try next
        ...(widenedTo ? { note: `No exact match for "${query}" — showing results for "${widenedTo}" instead.` } : {}),
        ...(exercises.length === 0
          ? { hint: `Nothing matched "${query}". Search again with one distinctive word (e.g. "squat" rather than "barbell squat"), or use the muscle filter. Do not invent an exerciseId.` }
          : {}),
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
            // The athlete's own note on the exercise
            notes: we.notes,
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
 * Validate a draft and stage it as a proposal card. Returns what to tell the
 * model (explicitly "not saved", or it claims the work is done) and the card.
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
      // A reminder without a date is dropped
      const reminderAt = scheduledFor ? parseDate(args.reminderAt) : null

      const detail = await prisma.exercise.findMany({
        where: { id: { in: clean.exercises.map(e => e.exerciseId) } },
        select: { id: true, name: true },
      })
      const nameById = new Map(detail.map(e => [e.id, e.name]))

      const payload = { template: clean, scheduledFor: scheduledFor?.toISOString() ?? null, reminderAt: reminderAt?.toISOString() ?? null }

      const row = await prisma.aiProposal.create({
        // Cast: plain JSON, but the interfaces lack Prisma's index signature
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

    if (name === 'propose_exercise') {
      // Prepared, not created — the card shows exactly what would be saved
      const prepared = await prepareCustomExercise(userId, {
        name: args.name,
        modality: args.modality,
        description: args.description,
        muscles: args.muscles,
        categories: args.categories,
        equipment: args.equipment,
      })

      const payload = {
        name: prepared.name,
        modality: prepared.modalityName,
        description: prepared.description,
        muscles: prepared.muscleLinks.map(link => ({ muscle: link.muscleName, role: link.role })),
        categories: prepared.categoryIds,
        equipment: prepared.equipmentIds,
      }

      const row = await prisma.aiProposal.create({
        data: {
          userId, threadId, kind: 'create_exercise',
          payload: payload as unknown as Prisma.InputJsonObject, expiresAt,
        },
      })

      const primary = prepared.muscleLinks.filter(l => l.role === 'primary').map(l => l.muscleName)
      const secondary = prepared.muscleLinks.filter(l => l.role === 'secondary').map(l => l.muscleName)

      const lines = [
        `${prepared.modalityName} · ${prepared.name}`,
        `Primary: ${primary.join(', ')}`,
        ...(secondary.length ? [`Secondary: ${secondary.join(', ')}`] : []),
        ...(prepared.description ? [prepared.description] : []),
      ]

      return {
        toModel: {
          status: 'drafted_not_saved',
          message:
            'A card has been shown to the athlete. The exercise does NOT exist until they tap it, so you cannot use it in a workout yet. Tell them it is ready to review — do NOT say it has been created or added.',
          // Lets the model correct a name that matched the wrong muscle
          resolvedMuscles: prepared.muscleLinks.map(l => `${l.muscleName} (${l.role})`),
        },
        proposal: {
          id: row.id,
          kind: 'create_exercise',
          title: prepared.name,
          lines,
          scheduledFor: null,
          reminderAt: null,
          expiresAt: expiresAt.toISOString(),
        },
      }
    }

    return { toModel: { error: `Unknown tool "${name}".` }, proposal: null }
  } catch (error) {
    // A rejected draft goes back to the model so it can correct itself
    const message =
      error instanceof TemplateValidationError ? error.message :
      // Includes the valid vocabulary, so the retry can succeed
      error instanceof CustomExerciseError ? error.message :
      'That draft could not be prepared.'
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
 * Apply an accepted card — the only AI-path function that writes app data.
 * Reachable only with the athlete's own token; applies exactly the staged payload.
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
    // Re-validated: the catalogue may have changed since drafting
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

  if (row.kind === 'create_exercise') {
    // Re-prepared: the duplicate check must reflect the catalogue now
    let prepared
    try {
      prepared = await prepareCustomExercise(userId, payload)
    } catch (error) {
      if (error instanceof CustomExerciseError) {
        throw new ProposalError(error.message, error.code === 'duplicate' ? 'spent' : 'invalid')
      }
      throw error
    }

    const exercise = await createCustomExercise(userId, prepared)

    await prisma.aiProposal.update({
      where: { id: row.id },
      data: { status: 'applied', appliedAt: new Date() },
    })
    return { kind: row.kind, exercise }
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
 * Every card a thread produced, for redrawing the conversation. Rejected
 * cards are omitted; `status` is derived so an expired pending card shows as
 * expired.
 */
export const listThreadProposals = async (userId: string, threadId: string) => {
  const rows = await prisma.aiProposal.findMany({
    where: { userId, threadId, status: { in: ['pending', 'applied', 'expired'] } },
    orderBy: { createdAt: 'asc' },
  })

  const now = new Date()
  return rows.map(row => {
    const payload = row.payload as any
    const template = payload?.template
    const status = row.status === 'pending' && row.expiresAt <= now ? 'expired' : row.status

    return {
      id: row.id,
      kind: row.kind,
      status,
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

/** The declarations in the chat-completions `tools` shape — the only provider adapter. */
export const toolsForChatCompletions = () =>
  TOOL_DECLARATIONS.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))

import { GoogleGenerativeAI } from '@google/generative-ai'
import prisma from '../lib/prisma'
import { buildUserContext } from './ai.service'
import { recordUsage } from './ai-budget.service'
import { NOTIFICATION_TYPES } from './notification-preference.service'
import { localDay, localHour, isQuietHour } from './notification-window.service'

/**
 * The coach tier's daily plan.
 *
 * The division of labour is deliberate: the AI decides WHAT to say and roughly
 * WHEN, and nothing else. It cannot decide how many notifications to send, it
 * cannot pick a time outside the user's waking hours, and it cannot introduce a
 * number that was not in the data it was given.
 *
 * The reason is not distrust of the model, it is failure modes. A plan is a row
 * you can read, delete and reproduce. A model deciding to fire on its own is a
 * behaviour you cannot test and cannot explain to a user who got woken up.
 */

/** Hard ceiling regardless of what the model proposes. */
const MAX_PLANNED = 5
/** Planner calls per user per day. One morning plan plus a few re-plans. */
const MAX_PLANNER_CALLS = Number(process.env.AI_PLANNER_CALLS_PER_DAY) || 4

interface PlannedItem {
  hour: number
  minute: number
  title: string
  body: string
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    notifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hour: { type: 'integer' },
          minute: { type: 'integer' },
          title: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['hour', 'minute', 'title', 'body'],
      },
    },
  },
  required: ['notifications'],
}

/**
 * Reject any number the model invented.
 *
 * The context contains real figures — readiness, loads, weights — and a model
 * that paraphrases them will occasionally produce a plausible-looking one that
 * is simply wrong ("you benched 120kg last week"). A user cannot tell the
 * difference, so any message containing a number absent from the source data is
 * dropped rather than corrected.
 */
export const containsInventedNumbers = (text: string, context: string): boolean => {
  const numbers = text.match(/\d+(?:\.\d+)?/g) ?? []
  if (numbers.length === 0) return false

  const contextNumbers = new Set(context.match(/\d+(?:\.\d+)?/g) ?? [])
  return numbers.some(n => {
    // Small integers are ordinary prose ("3 sets", "day 2"), not claims
    if (Number(n) <= 12 && Number.isInteger(Number(n))) return false
    return !contextNumbers.has(n)
  })
}

/** Wording used when the AI is unavailable, refused, or produced nothing usable. */
const FALLBACK_ITEM = {
  title: '💪 SomaTrack',
  body: 'Checking in — how’s the training going? Tap to talk it through.',
}

const clampToWakingHours = (
  item: PlannedItem,
  quietStart: number,
  quietEnd: number
): PlannedItem | null => {
  const hour = Math.max(0, Math.min(23, Math.floor(item.hour)))
  const minute = Math.max(0, Math.min(59, Math.floor(item.minute)))

  // Never nudge a proposed time INTO the waking window — a 3am suggestion is a
  // sign the model misread the context, and shifting it to 8am sends a message
  // that was reasoned about the middle of the night.
  if (isQuietHour(hour, quietStart, quietEnd)) return null
  return { ...item, hour, minute, title: item.title, body: item.body }
}

/**
 * Convert a local wall-clock time today into an instant.
 *
 * Compares the naive UTC guess against what that instant actually reads as in
 * the target zone, then corrects — which handles DST without needing a table.
 */
const localTimeToDate = (hour: number, minute: number, timezone: string): Date => {
  const now = new Date()
  const guess = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute
  ))
  const offsetHours = localHour(guess, timezone) - hour
  // Offsets can wrap the day boundary either way
  const corrected = offsetHours > 12 ? offsetHours - 24
    : offsetHours < -12 ? offsetHours + 24
    : offsetHours
  return new Date(guess.getTime() - corrected * 3_600_000)
}

/**
 * Generate today's coach plan and store it as `planned` notification rows.
 *
 * Never throws: a failed plan means no coach notifications today, which is a
 * far better outcome than an exception escaping into the scheduler interval.
 */
export const planCoachNotifications = async (userId: string): Promise<number> => {
  try {
    const pref = await prisma.notificationPreference.findUnique({ where: { userId } })
    if (!pref?.pushEnabled || !pref.coachEnabled || pref.coachSuspendedAt) return 0

    const timezone = pref.timezone
    const today = localDay(new Date(), timezone)

    // Already planned today?
    const existing = await prisma.notification.count({
      where: { userId, tier: 'coach', dedupeKey: { startsWith: `coach:${today}` } },
    })
    if (existing > 0) return 0

    // Planner calls are capped on count rather than sharing the chat budget:
    // a day of conversation must not silence the coach, and a re-plan loop must
    // not quietly consume the allowance the user wanted for chatting.
    const usage = await prisma.aiUsageDaily.findUnique({
      where: { userId_day: { userId, day: new Date().toISOString().slice(0, 10) } },
    })
    if ((usage?.plannerCalls ?? 0) >= MAX_PLANNER_CALLS) return 0

    const context = await buildUserContext(userId)
    const slots = Math.min(MAX_PLANNED, pref.dailyCap)

    const { items, failure } = await generatePlan(userId, context, slots, timezone)
    if (items.length === 0) return 0

    let created = 0
    for (const [index, item] of items.entries()) {
      const clamped = clampToWakingHours(item, pref.quietStartHour, pref.quietEndHour)
      if (!clamped) continue

      const plannedFor = localTimeToDate(clamped.hour, clamped.minute, timezone)
      // Times already past are dropped, not fired immediately — a morning
      // suggestion delivered at dinner has lost its point.
      if (plannedFor.getTime() < Date.now()) continue

      try {
        await prisma.notification.create({
          data: {
            userId,
            type: NOTIFICATION_TYPES.COACH_NUDGE,
            tier: 'coach',
            source: 'ai',
            title: clamped.title,
            body: clamped.body,
            status: 'planned',
            plannedFor,
            dedupeKey: `coach:${today}:${index}`,
            // Carried on the row rather than only in the logs. A planner that
            // fails silently looks identical to one that had nothing to say —
            // both produce bland text — and the fallback ran unnoticed for days
            // because the only evidence was a console line on the host.
            failReason: failure ?? null,
          },
        })
        created++
      } catch {
        // Duplicate key from a concurrent plan — harmless, skip it
      }
    }

    return created

  } catch (error: any) {
    console.error('planCoachNotifications failed:', error.message)
    return 0
  }
}

/** `failure` is set only when the fallback was used, and says why. */
interface PlanResult {
  items: PlannedItem[]
  failure?: string
}

const generatePlan = async (
  userId: string,
  context: string,
  slots: number,
  timezone: string
): Promise<PlanResult> => {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || slots <= 0) return { items: [] }

  const rawModelName = (process.env.GEMINI_MODEL ?? 'models/gemini-2.5-flash-lite').trim()
  const modelName = rawModelName.startsWith('models/') ? rawModelName : `models/${rawModelName}`

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' })

    const prompt = `
${context}

---

You are planning today's notifications for this athlete. Local time now is ${localHour(new Date(), timezone)}:00.

Propose AT MOST ${slots} short push notifications for the rest of today.

Rules:
- Only use numbers that appear in the data above. Never invent a figure.
- Each body under 120 characters. Title under 30.
- Time them to what the data suggests: nudge before their usual training window,
  check nutrition in the evening, suggest rest when load is high.
- If there is nothing genuinely useful to say, return an empty array. Silence is
  a valid plan and better than filler.
`.trim()

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: PLAN_SCHEMA as any,
      },
    })

    await recordUsage(userId, response.response.usageMetadata, { modelName, isPlanner: true })

    const parsed = JSON.parse(response.response.text())
    const raw: PlannedItem[] = Array.isArray(parsed?.notifications) ? parsed.notifications : []

    const items = raw
      .slice(0, slots)
      .filter(item =>
        typeof item?.title === 'string' && typeof item?.body === 'string' &&
        item.title.length > 0 && item.body.length > 0 &&
        item.body.length <= 200 &&
        Number.isFinite(Number(item.hour)) && Number.isFinite(Number(item.minute)) &&
        // Anything quoting a figure that is not in the source data is discarded
        !containsInventedNumbers(`${item.title} ${item.body}`, context)
      )
      .map(item => ({ ...item, hour: Number(item.hour), minute: Number(item.minute) }))

    // The model answered but every item was rejected. Worth distinguishing from
    // a model that deliberately returned nothing: the first is a bug in the
    // wording rules, the second is the plan working as intended.
    if (items.length === 0 && raw.length > 0) {
      return { items: [], failure: `all ${raw.length} proposed items rejected by filters` }
    }

    return { items }

  } catch (error: any) {
    // Model down, rate limited, safety-filtered, or returned unparseable JSON.
    // One generic nudge is better than a crash and better than silence, but
    // only one — filler does not deserve a full day's allowance.
    console.error('Coach plan generation failed, using fallback:', error.message)
    return {
      items: [{ hour: 18, minute: 0, ...FALLBACK_ITEM }],
      failure: `planner fallback: ${String(error?.message ?? error).slice(0, 180)}`,
    }
  }
}

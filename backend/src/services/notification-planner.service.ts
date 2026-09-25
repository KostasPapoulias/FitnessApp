import prisma from '../lib/prisma'
import { getAiClient, resolveAiProvider } from '../lib/aiProvider'
import { buildUserContext } from './ai.service'
import { recordUsage } from './ai-budget.service'
import { NOTIFICATION_TYPES } from './notification-preference.service'
import { localDay, localHour, isQuietHour } from './notification-window.service'
import { log } from '../lib/logger'

/**
 * The coach tier's daily plan. The AI decides what to say and roughly when —
 * never how many, never a time inside quiet hours, never a number that is not
 * in its data. Plans are stored as `planned` notification rows.
 */

/** Hard ceiling regardless of what the model proposes. */
const MAX_PLANNED = 5
/** Planner calls per user per day. */
const MAX_PLANNER_CALLS = Number(process.env.AI_PLANNER_CALLS_PER_DAY) || 4

interface PlannedItem {
  hour: number
  minute: number
  title: string
  body: string
}

/** Unwrap a ```json fence, for models that ignore `response_format`. */
const stripJsonFences = (text: string): string => {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed || '{}'
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim() || '{}'
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
 * True when the text contains a number not present in the source data —
 * such messages are dropped rather than risk a wrong figure.
 */
export const containsInventedNumbers = (text: string, context: string): boolean => {
  const numbers = text.match(/\d+(?:\.\d+)?/g) ?? []
  if (numbers.length === 0) return false

  const contextNumbers = new Set(context.match(/\d+(?:\.\d+)?/g) ?? [])
  return numbers.some(n => {
    // Small integers are ordinary prose ("3 sets"), not claims
    if (Number(n) <= 12 && Number.isInteger(Number(n))) return false
    return !contextNumbers.has(n)
  })
}

/** Used when the AI is unavailable or produced nothing usable. */
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

  // A time inside quiet hours is dropped, never shifted into waking hours
  if (isQuietHour(hour, quietStart, quietEnd)) return null
  return { ...item, hour, minute, title: item.title, body: item.body }
}

/** A local wall-clock time today as an instant; corrects the offset, so DST is handled. */
const localTimeToDate = (hour: number, minute: number, timezone: string): Date => {
  const now = new Date()
  const guess = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute
  ))
  const offsetHours = localHour(guess, timezone) - hour
  // Offsets can wrap the day boundary
  const corrected = offsetHours > 12 ? offsetHours - 24
    : offsetHours < -12 ? offsetHours + 24
    : offsetHours
  return new Date(guess.getTime() - corrected * 3_600_000)
}

/** Generate today's coach plan as `planned` rows. Never throws. */
export const planCoachNotifications = async (userId: string): Promise<number> => {
  try {
    // Needs both push opt-in and AI data consent — the coach writes from body data
    const [pref, settings] = await Promise.all([
      prisma.notificationPreference.findUnique({ where: { userId } }),
      prisma.settings.findUnique({
        where: { userId },
        select: { aiConsentEnabled: true },
      }),
    ])
    if (!pref?.pushEnabled || !pref.coachEnabled || pref.coachSuspendedAt) return 0

    // No settings row reads as consent (the column default)
    if (!(settings?.aiConsentEnabled ?? true)) return 0

    const timezone = pref.timezone
    const today = localDay(new Date(), timezone)

    const existing = await prisma.notification.count({
      where: { userId, tier: 'coach', dedupeKey: { startsWith: `coach:${today}` } },
    })
    if (existing > 0) return 0

    // Planner calls have their own cap, separate from the chat budget
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
      // Times already past are dropped, not fired immediately
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
            // Records why the fallback was used, so a failing planner is visible
            failReason: failure ?? null,
          },
        })
        created++
      } catch {
        // Duplicate key from a concurrent plan — skip
      }
    }

    return created

  } catch (error: any) {
    log.error('planCoachNotifications failed', error)
    return 0
  }
}

/** `failure` is set only when the fallback was used. */
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
  if (slots <= 0) return { items: [] }

  // No provider configured: no plan (the coach tier is optional)
  let provider
  try {
    provider = resolveAiProvider()
  } catch {
    return { items: [] }
  }

  const modelName = provider.plannerModel

  try {
    const client = getAiClient(provider)

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

    // `json_object` is the portable structured-output mode; every field is
    // validated below regardless
    const response = await client.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'system',
          content:
            'Reply with JSON only, matching exactly this schema: ' +
            JSON.stringify(PLAN_SCHEMA) +
            '. No prose, no markdown fences.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    })

    await recordUsage(userId, response.usage, { modelName, isPlanner: true })

    const parsed = JSON.parse(stripJsonFences(response.choices[0]?.message?.content ?? '{}'))
    const raw: PlannedItem[] = Array.isArray(parsed?.notifications) ? parsed.notifications : []

    const items = raw
      .slice(0, slots)
      .filter(item =>
        typeof item?.title === 'string' && typeof item?.body === 'string' &&
        item.title.length > 0 && item.body.length > 0 &&
        item.body.length <= 200 &&
        Number.isFinite(Number(item.hour)) && Number.isFinite(Number(item.minute)) &&
        // Drop anything quoting a figure absent from the source data
        !containsInventedNumbers(`${item.title} ${item.body}`, context)
      )
      .map(item => ({ ...item, hour: Number(item.hour), minute: Number(item.minute) }))

    // Every proposed item was rejected — worth recording, unlike a deliberately empty plan
    if (items.length === 0 && raw.length > 0) {
      return { items: [], failure: `all ${raw.length} proposed items rejected by filters` }
    }

    return { items }

  } catch (error: any) {
    // Model down, rate limited or unparseable: one generic nudge, not a full day of filler
    log.error('Coach plan generation failed, using fallback', error)
    return {
      items: [{ hour: 18, minute: 0, ...FALLBACK_ITEM }],
      failure: `planner fallback: ${String(error?.message ?? error).slice(0, 180)}`,
    }
  }
}

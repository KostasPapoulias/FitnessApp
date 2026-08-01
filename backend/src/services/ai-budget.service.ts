import prisma from '../lib/prisma'

/**
 * Spend guard for every AI call in the app.
 *
 * Two independent limits, because they stop different things:
 *
 *   - a DAILY BUDGET in dollars, which stops sustained use running up a bill
 *   - a PER-MINUTE RATE LIMIT, which stops a runaway loop or a held-down send
 *     button burning the whole day's budget in seconds
 *
 * A budget alone is not enough: without the rate limit, the first thing a bug
 * does is spend the entire allowance before anyone notices.
 */

// Priced per million tokens. Defaults match Gemini 2.5 Flash Lite; override
// both when changing model, or the ledger silently under-reports.
const INPUT_USD_PER_M = Number(process.env.AI_PRICE_INPUT_PER_M) || 0.10
const OUTPUT_USD_PER_M = Number(process.env.AI_PRICE_OUTPUT_PER_M) || 0.40

// ~57 chat messages/day at current prices and context size. Low enough to cap
// the damage, high enough that real conversation never reaches it.
const DAILY_BUDGET_USD = Number(process.env.AI_DAILY_BUDGET_USD) || 0.02
const RATE_LIMIT_PER_MIN = Number(process.env.AI_RATE_LIMIT_PER_MIN) || 10

export class AiBudgetError extends Error {
  constructor(message: string, readonly retryAfterSeconds: number) {
    super(message)
    this.name = 'AiBudgetError'
  }
}

const utcDay = (date = new Date()) => date.toISOString().slice(0, 10)

// In-process sliding window. Good enough for the rate limit specifically —
// worst case with N server instances is N× the intended rate, which the daily
// budget still backstops. The budget itself is in the database precisely
// because it must NOT be per-instance.
const recentCalls = new Map<string, number[]>()

const checkRateLimit = (userId: string) => {
  const now = Date.now()
  const windowStart = now - 60_000
  const calls = (recentCalls.get(userId) ?? []).filter(t => t > windowStart)

  if (calls.length >= RATE_LIMIT_PER_MIN) {
    const retryAfter = Math.ceil((calls[0] + 60_000 - now) / 1000)
    throw new AiBudgetError(
      'Too many requests in a row — give it a moment.',
      Math.max(1, retryAfter)
    )
  }

  calls.push(now)
  recentCalls.set(userId, calls)

  // Unbounded growth otherwise: one entry per user who ever chatted, forever
  if (recentCalls.size > 1000) {
    for (const [key, times] of recentCalls) {
      if (times.every(t => t <= windowStart)) recentCalls.delete(key)
    }
  }
}

/**
 * Call BEFORE spending anything. Throws AiBudgetError when the user is out of
 * budget for the day or calling too fast.
 */
export const assertWithinBudget = async (userId: string) => {
  checkRateLimit(userId)

  const usage = await prisma.aiUsageDaily.findUnique({
    where: { userId_day: { userId, day: utcDay() } }
  })

  if (usage && usage.costUsd >= DAILY_BUDGET_USD) {
    // Seconds until the next UTC midnight, so the client can say when it lifts
    const now = new Date()
    const midnight = Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
    )
    throw new AiBudgetError(
      'You have reached today’s AI limit. It resets at midnight UTC.',
      Math.ceil((midnight - now.getTime()) / 1000)
    )
  }
}

/**
 * Call AFTER a successful response, with the provider's own token counts.
 *
 * Estimating token counts from string length drifts badly once context blocks
 * and history are involved, and the drift is always in the direction of
 * under-billing — so the numbers come from usageMetadata or not at all.
 */
export const recordUsage = async (
  userId: string,
  usage: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined
) => {
  const inputTokens = usage?.promptTokenCount ?? 0
  const outputTokens = usage?.candidatesTokenCount ?? 0
  const costUsd =
    (inputTokens / 1_000_000) * INPUT_USD_PER_M +
    (outputTokens / 1_000_000) * OUTPUT_USD_PER_M

  const day = utcDay()

  try {
    await prisma.aiUsageDaily.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, calls: 1, inputTokens, outputTokens, costUsd },
      update: {
        calls: { increment: 1 },
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: outputTokens },
        costUsd: { increment: costUsd }
      }
    })
  } catch (error: any) {
    // Never fail a reply the user has already been charged for because the
    // ledger write failed. The rate limit still holds the line.
    console.error('recordUsage failed:', error.message)
  }
}

/** Today's spend, for the UI and for debugging. */
export const getUsageToday = async (userId: string) => {
  const usage = await prisma.aiUsageDaily.findUnique({
    where: { userId_day: { userId, day: utcDay() } }
  })

  const costUsd = usage?.costUsd ?? 0
  return {
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    budgetUsd: DAILY_BUDGET_USD,
    calls: usage?.calls ?? 0,
    remainingPct: Math.max(0, Math.round((1 - costUsd / DAILY_BUDGET_USD) * 100))
  }
}

import prisma from '../lib/prisma'
import { log } from '../lib/logger'

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

/**
 * Prices per million tokens, keyed by model.
 *
 * A single hardcoded price is a trap: the price constants said Flash Lite while
 * the configured model defaulted to Flash, so an unset env var meant costs
 * accrued at a fraction of the real rate and the cap would not trip until well
 * past the budget — the exact failure this module exists to prevent.
 *
 * Verify against the provider's current pricing when changing model; an unknown
 * model deliberately bills at the most expensive known rate, so drift
 * over-reports (send fewer messages) rather than under-reports (spend money).
 */
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-2.5-flash':      { input: 0.30, output: 2.50 },
  'gemini-2.0-flash':      { input: 0.10, output: 0.40 },
  'gpt-4o-mini':           { input: 0.15, output: 0.60 },
}

/**
 * Providers whose hosted allowance is not billed per token.
 *
 * NVIDIA's build.nvidia.com and a local Ollama both cost nothing per call, so
 * pricing them against Gemini's rate card would trip the daily budget after a
 * few dozen messages for spend that never happened. `AI_PRICE_*` still
 * overrides this, and the per-minute rate limit still applies either way — the
 * runaway-loop guard is not a money guard and must not be switched off with one.
 */
const UNMETERED_HOSTS = ['integrate.api.nvidia.com', 'localhost', '127.0.0.1']

const isUnmetered = (): boolean => {
  const base = (process.env.AI_BASE_URL ?? '').trim()
  const provider = (process.env.AI_PROVIDER ?? '').trim().toLowerCase()
  if (provider === 'nvidia' || provider === 'ollama') return true
  return UNMETERED_HOSTS.some(host => base.includes(host))
}

const priceFor = (modelName?: string) => {
  // Explicit env overrides win, so a price change never needs a deploy
  const envInput = Number(process.env.AI_PRICE_INPUT_PER_M)
  const envOutput = Number(process.env.AI_PRICE_OUTPUT_PER_M)
  if (envInput > 0 && envOutput > 0) return { input: envInput, output: envOutput }

  if (isUnmetered()) return { input: 0, output: 0 }

  const key = (modelName ?? '').replace(/^models\//, '').trim()
  const known = MODEL_PRICES[key]
  if (known) return known

  // Unknown model: assume the priciest entry rather than guessing low
  return Object.values(MODEL_PRICES).reduce((worst, price) =>
    price.output > worst.output ? price : worst
  )
}

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
  // Budget BEFORE rate limit. Checking the rate first meant a user already out
  // of budget was told "too many requests, retry in 60s" — advice that will not
  // work for hours — because each rejected attempt still counted toward the
  // window and tripped it before the real reason was ever reached.
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

  checkRateLimit(userId)
}

/**
 * Call AFTER a successful response, with the provider's own token counts.
 *
 * Estimating token counts from string length drifts badly once context blocks
 * and history are involved, and the drift is always in the direction of
 * under-billing — so the numbers come from the provider's usage block or not
 * at all.
 *
 * Both field namings are accepted. `prompt_tokens`/`completion_tokens` is the
 * chat-completions shape every provider returns; the Gemini-native
 * `promptTokenCount` spelling is kept so this keeps totalling correctly for
 * rows written before the provider migration, and for any caller still on the
 * old SDK.
 */
export interface AiUsageCounts {
  prompt_tokens?: number
  completion_tokens?: number
  promptTokenCount?: number
  candidatesTokenCount?: number
}

export const recordUsage = async (
  userId: string,
  usage: AiUsageCounts | undefined,
  options: { modelName?: string; isPlanner?: boolean } = {}
) => {
  const price = priceFor(options.modelName)
  const inputTokens = usage?.prompt_tokens ?? usage?.promptTokenCount ?? 0
  const outputTokens = usage?.completion_tokens ?? usage?.candidatesTokenCount ?? 0
  const costUsd =
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output

  const day = utcDay()
  const plannerCalls = options.isPlanner ? 1 : 0

  try {
    await prisma.aiUsageDaily.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, calls: 1, plannerCalls, inputTokens, outputTokens, costUsd },
      update: {
        calls: { increment: 1 },
        plannerCalls: { increment: plannerCalls },
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: outputTokens },
        costUsd: { increment: costUsd }
      }
    })
  } catch (error: any) {
    // Never fail a reply the user has already been charged for because the
    // ledger write failed. The rate limit still holds the line.
    log.error('recordUsage failed', error)
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

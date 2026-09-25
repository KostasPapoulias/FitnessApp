import prisma from '../lib/prisma'
import { log } from '../lib/logger'

/**
 * Spend guard for every AI call: a daily dollar budget (in the database) plus
 * a per-minute rate limit (in memory) that stops runaway loops.
 */

/**
 * Prices per million tokens, keyed by model. Unknown models on metered
 * endpoints bill at FALLBACK_PRICE so the cap trips early rather than late.
 */
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  // Empty: the app runs on unmetered endpoints. Add a row, or set
  // AI_PRICE_INPUT_PER_M / AI_PRICE_OUTPUT_PER_M, for a metered provider.
}

/** Price for an unpriced model on a metered endpoint — deliberately high. */
const FALLBACK_PRICE = { input: 5, output: 15 }

/**
 * Hosts that do not bill per token (NVIDIA's hosted catalogue, local Ollama).
 * The rate limit still applies to them.
 */
const UNMETERED_HOSTS = ['integrate.api.nvidia.com', 'localhost', '127.0.0.1']

const isUnmetered = (): boolean => {
  const base = (process.env.AI_BASE_URL ?? '').trim()
  const provider = (process.env.AI_PROVIDER ?? '').trim().toLowerCase()
  if (provider === 'nvidia' || provider === 'ollama') return true
  return UNMETERED_HOSTS.some(host => base.includes(host))
}

const priceFor = (modelName?: string) => {
  // Env overrides win
  const envInput = Number(process.env.AI_PRICE_INPUT_PER_M)
  const envOutput = Number(process.env.AI_PRICE_OUTPUT_PER_M)
  if (envInput > 0 && envOutput > 0) return { input: envInput, output: envOutput }

  if (isUnmetered()) return { input: 0, output: 0 }

  const key = (modelName ?? '').replace(/^models\//, '').trim()
  const known = MODEL_PRICES[key]
  if (known) return known

  // Unknown model: the priciest known entry, or the fallback when the table is empty
  return Object.values(MODEL_PRICES).reduce((worst, price) =>
    price.output > worst.output ? price : worst, FALLBACK_PRICE
  )
}

// Defaults: $0.02/day and 10 calls/minute per user.
const DAILY_BUDGET_USD = Number(process.env.AI_DAILY_BUDGET_USD) || 0.02
const RATE_LIMIT_PER_MIN = Number(process.env.AI_RATE_LIMIT_PER_MIN) || 10

export class AiBudgetError extends Error {
  constructor(message: string, readonly retryAfterSeconds: number) {
    super(message)
    this.name = 'AiBudgetError'
  }
}

const utcDay = (date = new Date()) => date.toISOString().slice(0, 10)

// Per-instance sliding window; the daily budget (in the database) is the shared backstop.
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

  // Prune idle users
  if (recentCalls.size > 1000) {
    for (const [key, times] of recentCalls) {
      if (times.every(t => t <= windowStart)) recentCalls.delete(key)
    }
  }
}

/** Call before any AI request. Throws AiBudgetError when over budget or calling too fast. */
export const assertWithinBudget = async (userId: string) => {
  // Budget first, so an exhausted user gets the right message rather than "retry in 60s"
  const usage = await prisma.aiUsageDaily.findUnique({
    where: { userId_day: { userId, day: utcDay() } }
  })

  if (usage && usage.costUsd >= DAILY_BUDGET_USD) {
    // Seconds until the next UTC midnight
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
 * Call after a successful response with the provider's own token counts.
 * Accepts both the chat-completions and the older Gemini field names.
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
    // Never fail a reply because the ledger write failed
    log.error('recordUsage failed', error)
  }
}

/** Today's spend. */
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

import OpenAI from 'openai'
import { log } from './logger'

/**
 * Which service answers the coach, and on what model.
 *
 * Everything AI in this app used to talk to `@google/generative-ai` directly,
 * which made the provider a code dependency rather than a deployment choice.
 * That became a problem the moment Google moved the Gemini API to prepaid
 * billing: the app could not be pointed somewhere else without a rewrite, and
 * the rewrite was the same size whichever provider you picked next.
 *
 * So the provider is now three environment variables. Every serious inference
 * host speaks the OpenAI chat-completions shape — Gemini included, via its
 * compatibility endpoint — so one client reaches all of them:
 *
 *   AI_BASE_URL   where to send the request
 *   AI_API_KEY    the key for that service
 *   AI_MODEL      the model id, in that service's own naming
 *
 * Nothing about the app's behaviour depends on which one is configured. The
 * tool declarations, the budget ledger and the persona are all provider-neutral.
 */

/** Presets so the common cases are a one-word change rather than a URL to look up. */
const PRESETS: Record<string, { baseURL: string; keyEnv: string; defaultModel: string }> = {
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    keyEnv: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
  },
  nvidia: {
    baseURL: 'https://integrate.api.nvidia.com/v1',
    keyEnv: 'NVIDIA_API_KEY',
    // Verified present in the live catalogue rather than taken from a docs page:
    // build.nvidia.com carries no llama-3.3-70b-instruct, which is what this
    // defaulted to at first. Nemotron Super is NVIDIA's own agentic model and
    // the strongest tool-caller on the platform for a coach that has to chain
    // search_exercises into propose_workout. Confirm with
    // `npx tsx scripts/compare-ai-models.ts` before trusting it in production.
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b',
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    keyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
  },
  ollama: {
    baseURL: 'http://localhost:11434/v1',
    keyEnv: 'OLLAMA_API_KEY',
    defaultModel: 'llama3.1',
  },
}

export interface AiProviderConfig {
  /** Which preset was matched, or 'custom' when AI_BASE_URL was set directly. */
  name: string
  baseURL: string
  apiKey: string
  model: string
  /** Model used for the cheap background planner. Falls back to `model`. */
  plannerModel: string
}

export class AiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiNotConfiguredError'
  }
}

const firstNonEmpty = (...values: (string | undefined)[]): string | undefined => {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

/**
 * Resolve the provider from the environment.
 *
 * Order of precedence is explicit-beats-implicit: a directly configured
 * AI_BASE_URL wins, then a named AI_PROVIDER preset, and finally the legacy
 * GEMINI_API_KEY. That last fallback is what makes this a non-breaking change —
 * an existing deployment that sets only GEMINI_API_KEY keeps working, on the
 * same model, without touching its environment.
 */
export const resolveAiProvider = (): AiProviderConfig => {
  const providerName = firstNonEmpty(process.env.AI_PROVIDER)?.toLowerCase()
  const preset = providerName ? PRESETS[providerName] : undefined

  if (providerName && !preset && !process.env.AI_BASE_URL?.trim()) {
    throw new AiNotConfiguredError(
      `Unknown AI_PROVIDER "${providerName}". Known: ${Object.keys(PRESETS).join(', ')}. ` +
      'Or set AI_BASE_URL directly for anything else that speaks the OpenAI API.'
    )
  }

  // Legacy path: only GEMINI_API_KEY is set, nothing else. Keep the old
  // behaviour exactly rather than making an upgrade require a config change.
  const legacyGemini = !preset
    && !process.env.AI_BASE_URL?.trim()
    && Boolean(process.env.GEMINI_API_KEY?.trim())

  const active = preset ?? (legacyGemini ? PRESETS.gemini : undefined)

  const baseURL = firstNonEmpty(process.env.AI_BASE_URL, active?.baseURL)
  const apiKey = firstNonEmpty(
    process.env.AI_API_KEY,
    active ? process.env[active.keyEnv] : undefined
  )

  if (!baseURL || !apiKey) {
    throw new AiNotConfiguredError(
      'AI is not configured. Set AI_PROVIDER (gemini, nvidia, openai, groq, openrouter, ollama) ' +
      'and that provider’s key, or set AI_BASE_URL and AI_API_KEY directly.'
    )
  }

  // Gemini's own naming carries a "models/" prefix that its compatibility
  // endpoint rejects. Strip it so the same value works either way — an
  // existing GEMINI_MODEL is very likely to have it.
  const rawModel = firstNonEmpty(
    process.env.AI_MODEL,
    process.env.GEMINI_MODEL,
    active?.defaultModel
  ) ?? 'gemini-2.5-flash'
  const model = rawModel.replace(/^models\//, '')

  const plannerModel = (firstNonEmpty(process.env.AI_PLANNER_MODEL) ?? model)
    .replace(/^models\//, '')

  return {
    name: providerName ?? (legacyGemini ? 'gemini (legacy GEMINI_API_KEY)' : 'custom'),
    baseURL,
    apiKey,
    model,
    plannerModel,
  }
}

/** True when the app can talk to a model at all — used by /api/config. */
export const isAiConfigured = (): boolean => {
  try {
    resolveAiProvider()
    return true
  } catch {
    return false
  }
}

let cached: { key: string; client: OpenAI } | null = null

/**
 * The shared client for a resolved provider.
 *
 * Cached on the resolved config rather than created per request: the SDK holds
 * a connection pool, and building one per chat message throws that away. Keyed
 * so a changed environment in a long-running dev process still takes effect.
 */
export const getAiClient = (config: AiProviderConfig): OpenAI => {
  const key = `${config.baseURL}|${config.apiKey.slice(0, 8)}`
  if (cached?.key === key) return cached.client

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    // A hung request holds a chat message open behind it. Two minutes is well
    // past a slow tool-calling round and well short of a user giving up.
    timeout: 120_000,
    maxRetries: 2,
  })

  cached = { key, client }
  log.info('AI provider resolved', {
    provider: config.name,
    baseURL: config.baseURL,
    model: config.model,
  })
  return client
}

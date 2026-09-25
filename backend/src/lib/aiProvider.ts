import OpenAI from 'openai'
import { log } from './logger'

/**
 * Resolves which OpenAI-compatible service answers the coach, from
 * AI_PROVIDER (a preset) or AI_BASE_URL / AI_API_KEY / AI_MODEL directly.
 */

/** Free and self-hosted presets. Anything else works through AI_BASE_URL. */
const PRESETS: Record<string, { baseURL: string; keyEnv: string; defaultModel: string }> = {
  nvidia: {
    baseURL: 'https://integrate.api.nvidia.com/v1',
    keyEnv: 'NVIDIA_API_KEY',
    // Nemotron Super fails on tool calls on this host; re-run
    // `scripts/compare-ai-models.ts` before changing this.
    defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b',
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
 * Resolve the provider from the environment. An explicit AI_BASE_URL wins,
 * otherwise the AI_PROVIDER preset. No values are inherited from other providers.
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

  const active = preset

  const baseURL = firstNonEmpty(process.env.AI_BASE_URL, active?.baseURL)
  const apiKey = firstNonEmpty(
    process.env.AI_API_KEY,
    active ? process.env[active.keyEnv] : undefined
  )

  if (!baseURL || !apiKey) {
    throw new AiNotConfiguredError(
      `AI is not configured. Set AI_PROVIDER (${Object.keys(PRESETS).join(', ')}) ` +
      'and that provider’s key, or set AI_BASE_URL and AI_API_KEY directly.'
    )
  }

  // A "models/" prefix is rejected by most endpoints, so it is stripped
  const rawModel = firstNonEmpty(process.env.AI_MODEL, active?.defaultModel)

  // No preset default and no AI_MODEL: fail with a readable configuration error
  if (!rawModel) {
    throw new AiNotConfiguredError(
      'AI_MODEL is not set, and AI_BASE_URL was configured without a preset to ' +
      'take a default model from. Set AI_MODEL to a model that endpoint serves.'
    )
  }

  const model = rawModel.replace(/^models\//, '')

  const plannerModel = (firstNonEmpty(process.env.AI_PLANNER_MODEL) ?? model)
    .replace(/^models\//, '')

  return {
    // 'custom' when AI_BASE_URL was set directly
    name: providerName ?? 'custom',
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

/** Shared client, cached per resolved config (the SDK holds a connection pool). */
export const getAiClient = (config: AiProviderConfig): OpenAI => {
  const key = `${config.baseURL}|${config.apiKey.slice(0, 8)}`
  if (cached?.key === key) return cached.client

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    // A message can take several tool rounds, and timeouts multiply across
    // them and their retries — keep each short so a stuck call surfaces fast.
    timeout: Number(process.env.AI_TIMEOUT_MS) || 45_000,
    maxRetries: Number(process.env.AI_MAX_RETRIES ?? 1),
  })

  cached = { key, client }
  log.info('AI provider resolved', {
    provider: config.name,
    baseURL: config.baseURL,
    model: config.model,
  })
  return client
}

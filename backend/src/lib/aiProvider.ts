import OpenAI from 'openai'
import { log } from './logger'

/**
 * Which service answers the coach, and on what model.
 *
 * One client reaches all of them:
 *
 *   AI_BASE_URL   where to send the request
 *   AI_API_KEY    the key for that service
 *   AI_MODEL      the model id, in that service's own naming
 *
 * Nothing about the app's behaviour depends on which one is configured. The
 * tool declarations, the budget ledger and the persona are all provider-neutral.
 */

/**
 * Presets so the common cases are a one-word change rather than a URL to look up.
 *
 * Free and self-hosted endpoints only. Gemini and OpenAI were here and are
 * gone: the app is being run on free inference, and a preset for a service
 * nobody is paying for is a route back to an outage — a stale key or model id
 * for it sits in an environment doing nothing until it silently wins over the
 * provider actually in use. Anything paid still works through AI_BASE_URL and
 * AI_API_KEY, which is what those two were reduced to anyway.
 */
const PRESETS: Record<string, { baseURL: string; keyEnv: string; defaultModel: string }> = {
  nvidia: {
    baseURL: 'https://integrate.api.nvidia.com/v1',
    keyEnv: 'NVIDIA_API_KEY',
    // Verified present in the live catalogue rather than taken from a docs
    // page: build.nvidia.com carries no llama-3.3-70b-instruct, which is what
    // this defaulted to at first.
    //
    // Nemotron Super was the default until 2026-09-20 on the reasoning that it
    // is NVIDIA's agentic model — but `scripts/compare-ai-models.ts` answers
    // 500 for it on every tool call, twice over, while Ultra completes the
    // search step and replies in ~2s. Neither reaches propose_workout on this
    // host, so plan cards are currently a Nemotron limitation rather than a
    // configuration one. Re-run that script before changing this.
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
 * Resolve the provider from the environment.
 *
 * Explicit beats implicit, and nothing is inherited: a directly configured
 * AI_BASE_URL wins, otherwise the named AI_PROVIDER preset decides both the
 * URL and the default model. There is no fallback to a key or a model id left
 * over from another provider — one of those cost an outage, with NVIDIA being
 * asked for a Gemini model on every message and answering 404.
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

  // A "models/" prefix is how some catalogues name their own models and most
  // endpoints reject it, so it is stripped either way.
  const rawModel = firstNonEmpty(process.env.AI_MODEL, active?.defaultModel)

  // No preset to take a default from, and no AI_MODEL: there is nothing
  // sensible left to guess. This used to fall back to a hardcoded Gemini id,
  // which on any other endpoint is a 404 on every message rather than a
  // configuration error anyone could read.
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
    // 'custom' when AI_BASE_URL was set directly, so the logs and the provider
    // name never read as undefined.
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
    // These multiply, and that is what made a busy endpoint look like a hang:
    // one message is up to MAX_TOOL_ROUNDS calls, each retried, each allowed
    // two minutes — twelve minutes of an athlete staring at a typing
    // indicator before anything was said.
    //
    // 45s is past any healthy round on the models in use and short enough that
    // a stuck one becomes a visible error. One retry still absorbs the single
    // 503 that free hosted endpoints hand out under load, without turning a
    // sustained outage into minutes of waiting.
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

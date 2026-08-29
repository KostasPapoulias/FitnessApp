import 'dotenv/config'
import OpenAI from 'openai'
import { toolsForChatCompletions } from '../src/services/ai-tools.service'
import { AI_PERSONA } from '../src/services/ai.service'

/**
 * Which model should the coach run on?
 *
 * Benchmarks answer that badly. What decides it here is not general
 * intelligence but one narrow behaviour: given the app's real tool
 * declarations, does the model call `search_exercises` first and then build
 * `propose_workout` out of the ids that search actually returned?
 *
 * That last part is the whole test. A model that invents a plausible-looking
 * exercise id does not fail loudly — it produces a proposal card that looks
 * correct, and the failure only surfaces when the athlete taps it. So the
 * script feeds back three known ids and checks, literally, whether the ids
 * that come back are those three.
 *
 * Run it against a provider before switching to it, and again whenever you
 * change AI_MODEL:
 *
 *   npx tsx scripts/compare-ai-models.ts
 *   npx tsx scripts/compare-ai-models.ts nvidia/nemotron-3-super-120b-a12b openai/gpt-oss-120b
 *
 * Costs two calls per model. On a metered provider that is real money, so the
 * candidate list is short by default.
 */

const DEFAULT_CANDIDATES = [
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'nvidia/nemotron-nano-3-30b-a3b',
  'mistralai/mistral-nemotron',
  'openai/gpt-oss-120b',
  'moonshotai/kimi-k2.6',
  'deepseek-ai/deepseek-v4-flash-0731',
]

const BASE_URL = process.env.AI_BASE_URL?.trim()
  || 'https://integrate.api.nvidia.com/v1'
const API_KEY = (process.env.AI_API_KEY || process.env.NVIDIA_API_KEY || '').trim()

/**
 * The app's real system prompt, not a summary of it.
 *
 * An earlier version of this script used a three-line stand-in and every single
 * candidate "failed" at the propose step — because nothing had told them to
 * draft rather than describe. That is a broken test, not seven broken models.
 * If the comparison is going to decide which model ships, it has to send what
 * production sends.
 */
const SYSTEM = AI_PERSONA

// Shaped like the real context block: fatigue percentages, readiness, kit.
const USER = `## LIVE BODY DATA
Chest: 78% fatigued (high). Quadriceps: 12% fatigued (recovered). Hamstrings: 9% fatigued (recovered).
Readiness: 74%. Equipment: Barbell, Dumbbell, Leg Press.

Build me a leg session for today.`

/** The only ids that exist. Anything else in the proposal was invented. */
const REAL_IDS: Record<string, string> = {
  'a3f1c8e2-0000-4aaa-9111-000000000001': 'Back Squat',
  'a3f1c8e2-0000-4aaa-9111-000000000002': 'Romanian Deadlift',
  'a3f1c8e2-0000-4aaa-9111-000000000003': 'Leg Press',
}

interface Row {
  model: string
  searched: boolean
  proposed: boolean
  idsOk: boolean | null
  jsonOk: boolean
  ms: number
  note: string
}

const evaluate = async (client: OpenAI, model: string, tools: any): Promise<Row> => {
  const row: Row = {
    model, searched: false, proposed: false, idsOk: null, jsonOk: true, ms: 0, note: '',
  }
  const started = Date.now()

  try {
    const messages: any[] = [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: USER },
    ]

    // Round 1 — does it look things up before answering?
    const first = await client.chat.completions.create({
      model, messages, tools, tool_choice: 'auto',
    })
    const turn = first.choices[0]?.message
    const calls = turn?.tool_calls ?? []
    row.searched = calls.some((c: any) => c.function?.name === 'search_exercises')

    if (calls.length === 0) {
      row.ms = Date.now() - started
      row.note = 'answered from memory — never called a tool'
      return row
    }

    for (const call of calls) {
      try { JSON.parse((call as any).function?.arguments || '{}') }
      catch { row.jsonOk = false }
    }

    // Round 2 — hand back known ids and see what it builds with.
    messages.push(turn)
    for (const call of calls) {
      messages.push({
        role: 'tool',
        tool_call_id: (call as any).id,
        content: JSON.stringify({
          exercises: Object.entries(REAL_IDS)
            .map(([id, name]) => ({ id, name, modality: 'Strength' })),
        }),
      })
    }

    const second = await client.chat.completions.create({
      model, messages, tools, tool_choice: 'auto',
    })
    const proposal = (second.choices[0]?.message?.tool_calls ?? [])
      .find((c: any) => c.function?.name === 'propose_workout') as any
    row.proposed = Boolean(proposal)

    if (proposal) {
      let args: any = {}
      try { args = JSON.parse(proposal.function.arguments || '{}') }
      catch { row.jsonOk = false }

      const used: string[] = (args.exercises ?? [])
        .map((e: any) => e.exerciseId)
        .filter(Boolean)
      row.idsOk = used.length > 0 && used.every(id => id in REAL_IDS)
      if (!row.idsOk) {
        const invented = used.filter(id => !(id in REAL_IDS))
        row.note = invented.length > 0
          ? `INVENTED ids: ${invented.slice(0, 2).join(', ')}`
          : 'proposed with no exercises'
      }
    } else {
      row.note = 'searched but never proposed'
    }
  } catch (error: any) {
    row.note = `ERR ${error?.status ?? ''} ${String(error?.message ?? error).slice(0, 80)}`
  }

  row.ms = Date.now() - started
  return row
}

const main = async () => {
  if (!API_KEY) {
    console.error('No API key. Set NVIDIA_API_KEY (or AI_API_KEY) in backend/.env')
    process.exit(1)
  }
  if (API_KEY.length < 20) {
    console.error(
      `The configured key is only ${API_KEY.length} characters — that is a placeholder, not a key.\n` +
      'Copy the real one from build.nvidia.com (it is ~70 characters).'
    )
    process.exit(1)
  }

  const candidates = process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : DEFAULT_CANDIDATES

  const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL, timeout: 90_000, maxRetries: 0 })
  const tools = toolsForChatCompletions() as any

  console.log(`\n${BASE_URL}`)
  console.log(`${candidates.length} models · ${tools.length} tools · 2 calls each\n`)

  const mark = (value: boolean | null) => value === null ? ' -- ' : value ? ' ok ' : 'FAIL'
  const rows: Row[] = []

  for (const model of candidates) {
    const row = await evaluate(client, model, tools)
    rows.push(row)
    console.log(
      `${row.model.padEnd(40)} search:${mark(row.searched)} propose:${mark(row.proposed)} ` +
      `realIds:${mark(row.idsOk)} json:${mark(row.jsonOk)} ${String(row.ms).padStart(6)}ms  ${row.note}`
    )
  }

  // Usable means: looked it up, drafted something, and used only ids that exist.
  const usable = rows.filter(r => r.searched && r.proposed && r.idsOk && r.jsonOk)
  console.log('')
  if (usable.length === 0) {
    console.log('No candidate passed. Widen the list or keep the current provider.')
    return
  }
  usable.sort((a, b) => a.ms - b.ms)
  console.log('Passed, fastest first:')
  for (const row of usable) console.log(`  ${row.model}  (${row.ms}ms)`)
  console.log(`\nSet AI_MODEL="${usable[0].model}" in backend/.env`)
}

main()

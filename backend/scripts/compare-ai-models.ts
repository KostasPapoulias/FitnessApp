import 'dotenv/config'
import OpenAI from 'openai'
import { toolsForChatCompletions } from '../src/services/ai-tools.service'
import { AI_PERSONA } from '../src/services/ai.service'

/**
 * Compares candidate models on the coach's key behaviour: calling
 * `search_exercises`, then building `propose_workout` only from the ids it
 * returned. Uses the real system prompt and tool declarations; two calls per model.
 *
 *   npx tsx scripts/compare-ai-models.ts
 *   npx tsx scripts/compare-ai-models.ts nvidia/nemotron-3-super-120b-a12b openai/gpt-oss-120b
 */

const DEFAULT_CANDIDATES = [
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'nvidia/nemotron-nano-3-30b-a3b',
  'mistralai/mistral-nemotron',
  // gpt-oss-120b was retired by NVIDIA (410); the 20b remains
  'openai/gpt-oss-20b',
  'moonshotai/kimi-k2.6',
  'deepseek-ai/deepseek-v4-flash-0731',
]

const BASE_URL = process.env.AI_BASE_URL?.trim()
  || 'https://integrate.api.nvidia.com/v1'
const API_KEY = (process.env.AI_API_KEY || process.env.NVIDIA_API_KEY || '').trim()

/** The real production system prompt — a stand-in makes every model fail. */
const SYSTEM = AI_PERSONA

// Shaped like the real context block.
const USER = `## LIVE BODY DATA
Chest: 78% fatigued (high). Quadriceps: 12% fatigued (recovered). Hamstrings: 9% fatigued (recovered).
Readiness: 74%. Equipment: Barbell, Dumbbell, Leg Press.

Build me a leg session for today.`

/** The only valid ids; anything else in a proposal was invented. */
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

  // Usable: looked it up, drafted something, used only real ids
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

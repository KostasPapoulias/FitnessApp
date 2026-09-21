/**
 * The whole production path, end to end: four tool rounds, then the salvage
 * call that ai.service falls back to when the loop produces no prose.
 *
 * Prints what the final round actually contains — content, the thinking
 * channel, and any tool calls made when no tools were even offered — because
 * "empty reply" has three different causes and they need different fixes.
 */
import 'dotenv/config'
import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { toolsForChatCompletions } from './src/services/ai-tools.service'
import { AI_PERSONA } from './src/services/ai.service'

const NO_THINK = process.argv.includes('--no-think')
const MAX_ROUNDS = 4

const client = new OpenAI({
  apiKey: (process.env.AI_API_KEY || process.env.NVIDIA_API_KEY || '').trim(),
  baseURL: process.env.AI_BASE_URL?.trim() || 'https://integrate.api.nvidia.com/v1',
  timeout: 90_000,
  maxRetries: 0,
})

const SALVAGE_PERSONA = `
You are SomaTrack AI — a personal fitness and recovery coach assistant.
Be encouraging but honest, and keep it short — this is a mobile app.

You have no tools in this reply. Everything that could be looked up already has
been, and is quoted for you below. Write the answer itself: ordinary prose for
the athlete to read — no JSON, no function call, no mention of tools or of
looking anything up.
`.trim()

const CONTEXT = `## LIVE BODY DATA
Chest: 78% fatigued (high). Quadriceps: 12% fatigued (recovered). Hamstrings: 9% fatigued (recovered).
Readiness: 74%. Equipment: Barbell, Dumbbell, Leg Press.

The athlete asks: What should I train today? Put a session together for me.`

const resultFor = (name: string) =>
  name === 'search_exercises'
    ? JSON.stringify([
        { id: 'ex_squat', name: 'Back Squat' },
        { id: 'ex_rdl', name: 'Romanian Deadlift' },
        { id: 'ex_legpress', name: 'Leg Press' },
      ])
    : JSON.stringify({ ok: true })

const run = async (model: string) => {
  const tools = toolsForChatCompletions()
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: AI_PERSONA },
    { role: 'user', content: CONTEXT },
  ]
  const transcript: string[] = []
  const think = NO_THINK ? { chat_template_kwargs: { thinking: false } } : {}

  console.log(`\n=== ${model}${NO_THINK ? ' [thinking:false]' : ''}`)
  const wall = Date.now()
  let reply = ''

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const isLast = round === MAX_ROUNDS - 1
    const started = Date.now()
    const result: any = await client.chat.completions.create({
      model, messages,
      ...(isLast ? {} : { tools, tool_choice: 'auto' as const }),
      ...think,
    } as any)
    const turn: any = result.choices[0]?.message ?? {}
    const calls = turn.tool_calls ?? []

    if (isLast || calls.length === 0) {
      reply = (turn.content ?? '').trim()
      console.log(`  round ${round + 1} (${Date.now() - started}ms): content=${JSON.stringify(reply).slice(0, 90)}`)
      console.log(`    reasoning=${JSON.stringify(turn.reasoning_content ?? '').slice(0, 90)}`)
      console.log(`    tool_calls even though none offered: ${calls.length} ${calls.map((c: any) => c.function?.name).join(',')}`)
      break
    }

    console.log(`  round ${round + 1} (${Date.now() - started}ms): calls ${calls.map((c: any) => c.function?.name).join(', ')}`)
    messages.push(turn)
    for (const call of calls) {
      transcript.push(`${call.function.name} -> ${resultFor(call.function.name)}`)
      messages.push({ role: 'tool', tool_call_id: call.id, content: resultFor(call.function.name) } as ChatCompletionMessageParam)
    }
  }

  if (reply) {
    console.log(`  GOT A REPLY in ${Date.now() - wall}ms`)
    return
  }

  // The salvage call, as ai.service does it: transcript rebuilt as prose, no
  // tool call anywhere for the model to imitate.
  const started = Date.now()
  const salvage: any = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SALVAGE_PERSONA },
      { role: 'user', content: CONTEXT },
      { role: 'user', content: `Results of the lookups already carried out for you:\n\n${transcript.join('\n')}\n\nAnswer the athlete's question now, using only this.` },
    ],
    ...think,
  } as any)
  const text = (salvage.choices[0]?.message?.content ?? '').trim()
  console.log(`  SALVAGE (${Date.now() - started}ms): ${JSON.stringify(text).slice(0, 140) || '<empty>'}`)
  console.log(`  TOTAL ${Date.now() - wall}ms`)
}

const main = async () => {
  for (const model of process.argv.slice(2).filter(a => !a.startsWith('--'))) {
    try { await run(model) } catch (e: any) { console.log('  FAILED:', e?.status, String(e?.message).slice(0, 120)) }
  }
}

main()

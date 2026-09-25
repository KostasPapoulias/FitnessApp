import 'dotenv/config'
import { resolveAiProvider } from '../src/lib/aiProvider'

/**
 * One minimal, tool-free request to the configured AI provider, printing the
 * raw status, rate-limit headers and both text channels. Raw `fetch`, so a
 * non-2xx body is shown unedited.
 *
 *   npx tsx scripts/ai-smoke.ts                                  # configured model
 *   npx tsx scripts/ai-smoke.ts nvidia/nemotron-3-super-120b-a12b
 *   npx tsx scripts/ai-smoke.ts --thinking                       # leave thinking on
 */

const args = process.argv.slice(2)
const keepThinking = args.includes('--thinking')
const modelArg = args.find(a => !a.startsWith('--'))

const main = async () => {
  const provider = resolveAiProvider()
  const model = modelArg ?? provider.model

  console.log('provider :', provider.name)
  console.log('baseURL  :', provider.baseURL)
  console.log('model    :', model)
  console.log('key      :', provider.apiKey ? `present (${provider.apiKey.length} chars)` : 'MISSING')
  console.log('thinking :', keepThinking ? 'on' : 'off')
  console.log('---')

  const started = Date.now()
  const response = await fetch(`${provider.baseURL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      // NVIDIA's published temperature/top_p; tiny max_tokens for a one-word answer
      temperature: 1,
      top_p: 0.95,
      max_tokens: 64,
      // Unknown keys go at the top level of the body
      chat_template_kwargs: { enable_thinking: keepThinking },
    }),
  })

  const took = Date.now() - started
  console.log(`HTTP ${response.status} ${response.statusText} in ${took}ms`)

  // Any header mentioning a limit or retry
  for (const [name, value] of response.headers.entries()) {
    if (/ratelimit|retry-after|quota|x-request-id/i.test(name)) console.log(`  ${name}: ${value}`)
  }

  const text = await response.text()
  if (!response.ok) {
    console.log('\nBODY (this is the diagnosis):')
    console.log(text.slice(0, 1200))
    process.exitCode = 1
    return
  }

  const body = JSON.parse(text)
  const message = body.choices?.[0]?.message ?? {}
  console.log('\ncontent          :', JSON.stringify(message.content ?? ''))
  console.log('reasoning_content:', JSON.stringify(message.reasoning_content ?? '').slice(0, 300))
  console.log('finish_reason    :', body.choices?.[0]?.finish_reason)
  console.log('usage            :', JSON.stringify(body.usage))

  // Tokens spent but empty `content`: the app would show an empty reply
  if (!String(message.content ?? '').trim()) {
    console.log('\nWARNING: content is empty while tokens were produced.')
    console.log('The model put its output in the thinking channel. The app reads')
    console.log('`content`, so this reads as "the AI said nothing".')
  }
}

main().catch(error => {
  console.log('FAILED before a reply:', error?.message ?? error)
  process.exitCode = 1
})

import 'dotenv/config'
import { resolveAiProvider } from '../src/lib/aiProvider'

/**
 * One call. Is the coach's provider actually answering?
 *
 * `compare-ai-models.ts` asks a different question — which model chains the
 * app's tools correctly — and it costs two calls per model. When the coach is
 * simply dead, that is the wrong tool and an expensive way to find out
 * nothing: a table of failures looks identical whether the key is exhausted,
 * the model id is wrong, or the endpoint is down.
 *
 * So this sends the smallest possible request, with no tools, and prints what
 * came back unedited: the HTTP status, whatever rate-limit headers the
 * provider sets, and both text channels.
 *
 *   npx tsx scripts/ai-smoke.ts                                  # configured model
 *   npx tsx scripts/ai-smoke.ts nvidia/nemotron-3-super-120b-a12b
 *   npx tsx scripts/ai-smoke.ts --thinking                       # leave thinking on
 *
 * Deliberately raw `fetch` rather than the SDK: the SDK turns a non-2xx into
 * an exception with the body summarised away, and the body is the diagnosis.
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
      // NVIDIA's own published settings for the Nemotron models. temperature
      // and top_p are theirs; max_tokens is ours and deliberately tiny, since
      // this asks for one word.
      temperature: 1,
      top_p: 0.95,
      max_tokens: 64,
      // Python's `extra_body` has no equivalent in the Node SDK — unknown keys
      // go at the top level of the body, which is what this sends.
      chat_template_kwargs: { enable_thinking: keepThinking },
    }),
  })

  const took = Date.now() - started
  console.log(`HTTP ${response.status} ${response.statusText} in ${took}ms`)

  // Whatever the provider says about limits. Named differently per provider,
  // so anything that mentions a limit or a retry is printed.
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

  // The failure that looks like success: tokens were generated and billed, but
  // the app reads `content` and would show an empty bubble.
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

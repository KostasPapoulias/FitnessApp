import type OpenAI from 'openai'
import type {
  ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'
import prisma from '../lib/prisma'
import { getAiClient, resolveAiProvider } from '../lib/aiProvider'
import { getUserReadiness } from './readiness.service'
import { getTrainingLoad } from './training-load.service'
import { resolveAge } from './fatigue-model.service'
import { assertWithinBudget, recordUsage } from './ai-budget.service'
import {
  MAX_TOOL_CALLS_PER_MESSAGE, ProposalSummary,
  createProposal, executeReadTool, isKnownTool, isWriteTool, toolsForChatCompletions,
} from './ai-tools.service'
import { log } from '../lib/logger'

/**
 * The live body-data block sent with each chat message: profile, equipment,
 * injuries, readiness and fatigue, training load, sleep, nutrition and recent
 * sessions. Readiness comes from the same service the app screens use.
 */
export const buildUserContext = async (userId: string): Promise<string> => {
  const {
    readinessScore: readiness, muscles: effectiveFatigue, fitnessLevel, systemicFatigue,
    sleep, sleepNote,
  } = await getUserReadiness(userId)

  // Weeks-long load trend
  const load = await getTrainingLoad(userId)

  // Sleep comes from the readiness result, so it matches the score
  const nutrition = await prisma.nutritionLog.findFirst({
    where: { userId },
    orderBy: { logDate: 'desc' }
  })

  const profile = await prisma.userProfile.findUnique({
    where: { userId }
  })

  // What they can train with and what to work around
  const [equipment, injuries] = await Promise.all([
    prisma.userEquipment.findMany({
      where: { userId },
      include: { equipment: { select: { name: true } } },
    }),
    prisma.userInjury.findMany({
      where: { userId, resolvedAt: null },
      include: { muscle: { select: { name: true } } },
    }),
  ])

  const age = resolveAge(profile?.birthDate, profile?.age)

  // Last 3 sessions
  const recentSessions = await prisma.workoutSession.findMany({
    where: { userId },
    include: {
      workoutExercises: {
        include: { exercise: true }
      }
    },
    orderBy: { dateTime: 'desc' },
    take: 3
  })

  const highFatigue   = effectiveFatigue.filter(f => f.effectiveLevel >= 70)
  const modFatigue    = effectiveFatigue.filter(f => f.effectiveLevel >= 35 && f.effectiveLevel < 70)
  const recovered     = effectiveFatigue.filter(f => f.effectiveLevel < 35)

  const context = `
## LIVE BODY DATA — measured just now
These figures are authoritative and supersede any numbers stated earlier in
this conversation. Readiness and fatigue change continuously, so earlier
replies are stale. Never repeat a readiness score from an earlier message —
quote only the value below.

## User Profile
Name: ${profile?.name ?? 'Athlete'}
Fitness level: ${fitnessLevel}
Goal: ${profile?.goal ?? 'general fitness'}
${age != null ? `Age: ${age}` : ''}
${profile?.weight != null ? `Bodyweight: ${profile.weight} kg` : ''}
${profile?.trainingDaysPerWeek != null ? `Trains ${profile.trainingDaysPerWeek} days per week` : ''}
${profile?.experienceYears != null ? `Training experience: ${profile.experienceYears} years` : ''}

## Available Equipment
${equipment.length > 0
  ? `They usually have: ${equipment.map(e => e.equipment.name).join(', ')}.
Build the session from this list by default. You may still suggest something
outside it when it is clearly the right movement — but say so explicitly and
offer a substitute from the list, so they can choose rather than be stuck.`
  : 'Not specified — assume a normally equipped gym, but ask before building a full plan around specialist kit.'}

## Injuries and limitations
${injuries.length > 0
  ? injuries.map(i =>
      `  - ${i.label}${i.muscle ? ` (${i.muscle.name})` : ''}: ${
        i.severity === 'avoid'
          ? 'AVOID ENTIRELY — never prescribe anything loading this'
          : 'work around it — light or modified only, and say why'
      }`
    ).join('\n')
  : '  None reported'}

## Current Body State
Overall readiness score: ${readiness}%
Systemic (whole-body) fatigue: ${systemicFatigue}% — cardiovascular and central
cost of recent training. This is separate from local muscle damage: a long run
or a metcon loads it heavily while leaving individual muscles fairly fresh, so
high systemic fatigue with low muscle fatigue means easy aerobic work and
technique, not another hard session.

High fatigue muscles (🔴 need rest):
${highFatigue.length > 0
  ? highFatigue.map(f => `  - ${f.muscleName}: ${f.fatigueLevel}% fatigued`).join('\n')
  : '  None'}

Moderate fatigue muscles (🟡 train light):
${modFatigue.length > 0
  ? modFatigue.map(f => `  - ${f.muscleName}: ${f.fatigueLevel}% fatigued`).join('\n')
  : '  None'}

Recovered muscles (🟢 ready to train):
${recovered.length > 0
  ? recovered.map(f => `  - ${f.muscleName}: ${f.fatigueLevel}% fatigued`).join('\n')
  : '  None'}

## Training Load Trend (weeks, not today)
${load.established
  ? `Fitness (6-week accumulated load): ${load.fitness}
Fatigue (last week's load): ${load.fatigue}
Form (fitness − fatigue): ${load.form} — ${load.formState}
Acute:chronic ratio: ${load.ratio ?? 'not enough history'} — ${load.trend}
Load this week: ${load.weeklyLoad} vs ${load.previousWeeklyLoad} the week before
${load.trend === 'ramping'
  ? 'RAMPING TOO FAST: recent load is far above what they are conditioned for. This is the strongest known predictor of overuse injury — advise easing back even if they feel fine today.'
  : load.trend === 'detraining'
  ? 'Training has tailed off well below their established level — fitness is slipping, encourage consistency over intensity.'
  : 'Load progression is in a sensible range.'}`
  : `Not enough history yet (${load.sessionCount} finished session${load.sessionCount === 1 ? '' : 's'}). Do not quote fitness, form or ratio numbers — say you need a couple more weeks of training logged.`}

## Today's Health Data
Sleep: ${sleep.durationMin != null
  ? `${(sleep.durationMin / 60).toFixed(1)}h (quality: ${sleep.sleepScore ?? 'not rated'})`
  : 'Not logged'}
Sleep's effect on the readiness score above: ${sleep.applied
  ? `${sleep.adjustment > 0 ? '+' : ''}${sleep.adjustment} points — ALREADY INCLUDED. Do not deduct for it again.`
  : `none — ${sleepNote} The score reflects training load only, so treat it as an upper bound if they mention sleeping badly.`}
Protein: ${nutrition ? `${nutrition.proteinG}g` : 'Not logged'}
Calories: ${nutrition ? `${nutrition.calories} kcal` : 'Not logged'}

## Recent Workouts
${recentSessions.length > 0
  ? recentSessions.map(s => {
      const date = new Date(s.dateTime).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric'
      })
      const exercises = s.workoutExercises.map(we => we.exercise.name).join(', ')
      return `  - ${date}: ${exercises} (RPE: ${s.avgRpe?.toFixed(1) ?? '?'}, Volume: ${Math.round(s.totalVolume ?? 0)}kg)`
    }).join('\n')
  : '  No recent workouts'}
`.trim()

  return context
}

// Static coach instructions, pinned as the system message.
export const AI_PERSONA = `
You are SomaTrack AI — a personal fitness and recovery coach assistant.
You have access to the user's real-time body data. Always use this data
to give personalised, specific advice. Be encouraging but honest.
Keep responses concise — this is a mobile app.

## Looking things up
You have tools for the athlete's catalogue, history, progress, volume,
nutrition, sleep, saved plans and schedule. Use them rather than guessing, and
rather than saying you cannot see something — if a question is about what they
did or lifted, look it up first. Never state a weight, date or count you have
not read from a tool or from the live data block.

## Drafting
propose_workout, propose_schedule and propose_exercise do NOT save anything.
They show the athlete a card which they must tap to accept. So:
  - always call search_exercises first and build plans only from ids it returned
  - never invent an exercise id
  - after drafting, say it is ready for them to review and tap
  - NEVER say you have saved, added, scheduled or created anything

NEVER mention a card, or tell them to accept, review or tap anything, unless you
actually called propose_workout, propose_schedule or propose_exercise in THIS
reply. Describing a plan in prose does not create a card. Saying "accept the
card below" when there is no card is worse than saying nothing at all — they
sit there looking for a button that does not exist. If you have a plan in mind
but have not drafted it, either call the tool now or ask whether they want it.

If search_exercises returns nothing, do not stop and apologise. Read its hint,
search again with one distinctive word, and only if that also fails tell them
the movement is not in the catalogue and offer propose_exercise.

## Movements the catalogue does not have
If search_exercises cannot find something they want to train, you may draft it
with propose_exercise. Before you do:
  - search properly first, including obvious alternative names. A duplicate
    under a second name splits their history across two exercises.
  - be sure which muscles it works and which are primary. If you are not, ask
    them rather than guessing — those weightings drive their fatigue model, and
    a wrong one quietly skews recovery advice from then on.
  - write a real description: setup and the cues that matter, in a sentence or
    two. It is what they will see on the exercise screen later.
A drafted exercise does not exist until they accept it, so you cannot put it in
a workout in the same breath — offer to build one once they have tapped it.
You cannot delete anything, change a workout they have already completed, or
alter their security settings. If asked, say so plainly and offer what you can.
`.trim()

/**
 * Persona when AI data consent is off: no body data and no tools, and it must
 * say so rather than invent numbers.
 */
export const AI_PERSONA_NO_DATA = `
You are SomaTrack AI — a fitness and recovery coach assistant.

This athlete has turned OFF "AI Data Consent" in Settings, so you have NO access
to their body data, training history, profile, equipment, injuries or saved
plans, and no tools to look anything up. You genuinely cannot see any of it.

Therefore:
  - NEVER state or estimate their readiness, fatigue, weights, PRs, volume,
    recent sessions or schedule. You do not have them. Do not guess, and do not
    reason from anything quoted earlier in this conversation — those numbers are
    from when consent was on and are now both stale and off-limits.
  - Answer general training and recovery questions properly. Sound programming
    advice does not require their data, and refusing to help at all would be
    unhelpful rather than private.
  - When a question genuinely needs their data, say once and briefly that you
    cannot see it with consent off, and that they can turn it back on in
    Settings → AI Data Consent. Do not repeat this in every reply.
  - You cannot save, schedule, draft or create anything. Say so plainly if asked.

Be encouraging and honest. Keep responses concise — this is a mobile app.
`.trim()

/** Model round trips per message; caps runaway tool loops. */
const MAX_TOOL_ROUNDS = 3

/** Reply when the model staged a draft but wrote no prose. */
const FALLBACK_WITH_PROPOSAL = 'I have put a draft together — have a look and tap it if it works for you.'

/**
 * Request settings for every model call, overridable per deployment. Low
 * temperature: answers come from live numbers and real ids. Thinking off:
 * its tokens consume `max_tokens` and land outside `content`.
 */
const SAMPLING = {
  temperature: Number(process.env.AI_TEMPERATURE ?? 0.3),
  top_p: Number(process.env.AI_TOP_P ?? 0.9),
  max_tokens: Number(process.env.AI_MAX_TOKENS ?? 1024),
}

/** Thinking stays off unless explicitly enabled. */
const ENABLE_THINKING = process.env.AI_ENABLE_THINKING === 'true'

/**
 * Sampling plus provider-specific options. `chat_template_kwargs` is sent to
 * NVIDIA only — strict endpoints reject unknown keys.
 */
const requestTuning = (providerName: string) => ({
  ...SAMPLING,
  ...(providerName === 'nvidia'
    ? { chat_template_kwargs: { enable_thinking: ENABLE_THINKING } }
    : {}),
})

/**
 * Persona for the no-tools salvage call. The main persona talks about tools,
 * which led the model to write tool calls as its reply.
 */
const SALVAGE_PERSONA = `
You are SomaTrack AI — a personal fitness and recovery coach assistant.
Be encouraging but honest, and keep it short — this is a mobile app.

You have no tools in this reply. Everything that could be looked up already has
been, and is quoted for you below. Write the answer itself: ordinary prose for
the athlete to read — no JSON, no function call, no mention of tools or of
looking anything up.

Never state a weight, date or count that is not in what you were given. Do not
say anything has been saved, scheduled or created, and do not tell them to tap,
accept or review a card — there is none.
`.trim()

/**
 * Last resort when the tool loop produced no prose: a fresh request with the
 * lookup results as plain text and no tool calls to imitate. Returns '' on failure.
 */
const answerWithoutTools = async ({
  userId, client, modelName, providerName, questionTurn, toolTranscript,
}: {
  userId: string
  client: OpenAI
  modelName: string
  providerName: string
  questionTurn: ChatCompletionMessageParam
  toolTranscript: string[]
}): Promise<string> => {
  try {
    await assertWithinBudget(userId)

    const findings = toolTranscript.length > 0
      ? `Results of the lookups already carried out for you:\n\n${
          toolTranscript.map((line, i) => `${i + 1}. ${line}`).join('\n')
        }\n\nThat is everything available.`
      : 'No lookups returned anything usable.'

    const result = await client.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: SALVAGE_PERSONA },
        questionTurn,
        {
          role: 'user',
          content: `${findings} Answer the athlete's question now, using only this.`,
        },
      ],
      ...requestTuning(providerName),
    } as ChatCompletionCreateParamsNonStreaming)

    await recordUsage(userId, result.usage, { modelName })
    return (result.choices[0]?.message?.content ?? '').trim()
  } catch (error) {
    // The caller has a fallback; never turn this into a 500
    log.error('AI salvage reply failed', error, { model: modelName })
    return ''
  }
}

/**
 * Send a chat message. The model may call tools: reads run immediately, writes
 * become proposal cards. Loops until it answers in prose, re-checking the
 * budget before every round trip.
 */
export const sendMessage = async ({
  userId,
  threadId,
  message,
  history
}: {
  userId: string
  threadId: string
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
}): Promise<{ reply: string; proposals: ProposalSummary[] }> => {
  // Throws AiNotConfiguredError when no provider is set (the controller returns 503)
  const provider = resolveAiProvider()
  const client = getAiClient(provider)

  // AI data consent; a missing settings row reads as consent (the column default)
  const settings = await prisma.settings.findUnique({
    where: { userId },
    select: { aiConsentEnabled: true },
  })
  const personalised = settings?.aiConsentEnabled ?? true

  // Consent off: the body-data block is never built, so nothing personal is read
  const systemContext = personalised ? await buildUserContext(userId) : null

  const modelName = provider.model
  // Consent off: no tools are offered, so none can run
  const tools = personalised ? toolsForChatCompletions() : undefined

  // Live data goes with the latest message, where it outweighs stale numbers in
  // older turns. Consent off also replays no history, since earlier replies quote
  // personal data.
  const replayHistory = personalised ? history : []

  // Persona as a real system message
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: personalised ? AI_PERSONA : AI_PERSONA_NO_DATA },
    ...replayHistory.map(item => ({
      role: item.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: item.content,
    })),
    {
      role: 'user',
      content: systemContext ? `${systemContext}\n\n---\n\n${message}` : message,
    },
  ]

  const proposals: ProposalSummary[] = []
  let toolCallsUsed = 0
  let replyText = ''

  // The athlete's question with its data block, captured before tool turns are appended
  const questionTurn = messages[messages.length - 1]

  // Tool results as plain text, for the salvage call
  const toolTranscript: string[] = []

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    await assertWithinBudget(userId)

    // The final round offers no tools
    const isLastRound = round === MAX_TOOL_ROUNDS - 1
    const offerTools = tools && !isLastRound

    // Cast: `chat_template_kwargs` is not in the SDK's typed parameters
    const result = await client.chat.completions.create({
      model: modelName,
      messages,
      ...(offerTools ? { tools, tool_choice: 'auto' as const } : {}),
      ...requestTuning(provider.name),
    } as ChatCompletionCreateParamsNonStreaming)

    // Bill from the provider's own token counts, at the model actually used
    await recordUsage(userId, result.usage, { modelName })

    const modelTurn = result.choices[0]?.message
    const calls = modelTurn?.tool_calls ?? []

    if (calls.length === 0 || isLastRound) {
      replyText = (modelTurn?.content ?? '').trim()

      // A call in the final round is dropped (and its turn not pushed — an
      // unanswered tool_call would be rejected by the next request)
      if (!replyText && isLastRound) {
        log.warn('AI produced no prose in its final round', {
          model: modelName,
          finishReason: result.choices[0]?.finish_reason,
          strandedCalls: calls.length,
          toolCallsUsed,
        })
      }
      break
    }

    // The model's own turn must precede its tool results
    messages.push(modelTurn as ChatCompletionMessageParam)

    const budgetLeft = Math.max(0, MAX_TOOL_CALLS_PER_MESSAGE - toolCallsUsed)
    const allowed = calls.slice(0, budgetLeft)
    const refused = calls.slice(budgetLeft)
    toolCallsUsed += allowed.length

    for (const call of allowed) {
      // Only function calls are supported
      if (call.type !== 'function') {
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Unsupported tool type.' }) })
        continue
      }

      const name = call.function.name
      let response: object

      // Arguments arrive as a JSON string; malformed JSON is reported back to the model
      let args: Record<string, any> = {}
      let argsValid = true
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
      } catch {
        argsValid = false
      }

      if (!argsValid) {
        response = { error: 'Arguments were not valid JSON. Call the tool again with well-formed arguments.' }
      } else if (!isKnownTool(name)) {
        response = { error: `Unknown tool "${name}".` }
      } else if (isWriteTool(name)) {
        const drafted = await createProposal(userId, threadId, name, args)
        if (drafted.proposal) proposals.push(drafted.proposal)
        response = drafted.toModel
      } else {
        try {
          response = await executeReadTool(userId, name, args)
        } catch (error) {
          // A failed lookup is reported to the model, not thrown
          log.error('AI tool failed', error, { tool: name })
          response = { error: 'That lookup failed.' }
        }
      }

      const serialised = JSON.stringify(response)
      toolTranscript.push(`${name}(${call.function.arguments || '{}'}) -> ${serialised}`)

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: serialised,
      })
    }

    // Every tool_call needs a result, refused ones included
    for (const call of refused) {
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify({
          error: 'Tool call limit reached for this message. Answer with what you already have.',
        }),
      })
    }
  }

  // No prose after every round: some endpoints keep emitting tool calls even
  // with no tools offered, so salvage with a fresh tool-free request.
  // Skipped when a draft was staged — the fallback text covers that.
  if (!replyText && proposals.length === 0) {
    replyText = await answerWithoutTools({
      userId, client, modelName, providerName: provider.name, questionTurn, toolTranscript,
    })
  }

  if (!replyText) {
    replyText = proposals.length > 0
      ? FALLBACK_WITH_PROPOSAL
      : 'Sorry, I could not generate a response.'
    log.warn('AI produced no reply at all', {
      model: modelName, toolCallsUsed, proposals: proposals.length,
    })
  }

  const [, assistantMessage] = await prisma.$transaction([
    prisma.aIChat.create({
      data: { threadId, userId, messageText: message, sender: 'user', dateTime: new Date() },
    }),
    prisma.aIChat.create({
      data: { threadId, userId, messageText: replyText, sender: 'assistant', dateTime: new Date() },
    }),
  ])

  // Attach the cards to the reply that produced them
  if (proposals.length > 0) {
    await prisma.aiProposal.updateMany({
      where: { id: { in: proposals.map(p => p.id) } },
      data: { messageId: assistantMessage.id },
    })
  }

  return { reply: replyText, proposals }
}

// The user's latest thread, created if none exists.
export const getOrCreateThread = async (userId: string) => {
  let thread = await prisma.chatThread.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  })

  if (!thread) {
    thread = await prisma.chatThread.create({
      data: { userId }
    })
  }

  return thread
}

// The thread's last 20 messages, oldest first.
export const getThreadHistory = async (threadId: string) => {
  // Newest 20, then reversed into reading order
  const messages = await prisma.aIChat.findMany({
    where: { threadId },
    orderBy: { dateTime: 'desc' },
    take: 20
  })

  return messages.reverse().map(m => ({
    role: m.sender as 'user' | 'assistant',
    content: m.messageText
  }))
}
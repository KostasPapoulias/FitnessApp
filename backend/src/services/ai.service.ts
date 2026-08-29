import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
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

// Build the fatigue context string that gets sent to ChaGPT
export const buildUserContext = async (userId: string): Promise<string> => {
  // Same readiness calculation the Home/Profile screens show, so the AI
  // never quotes a different number than the UI.
  const {
    readinessScore: readiness, muscles: effectiveFatigue, fitnessLevel, systemicFatigue,
    sleep, sleepNote,
  } = await getUserReadiness(userId)

  // Weeks-long trend, not today's soreness — this is what tells the coach
  // whether to push, hold, or back off.
  const load = await getTrainingLoad(userId)

  // Sleep comes back with readiness rather than being fetched again — the score
  // above already has it folded in, and a second query could disagree with the
  // one the score was computed from.

  // Get latest nutrition
  const nutrition = await prisma.nutritionLog.findFirst({
    where: { userId },
    orderBy: { logDate: 'desc' }
  })

  // Get user profile
  const profile = await prisma.userProfile.findUnique({
    where: { userId }
  })

  // What they can train with, and what they are training around. Without this
  // the coach happily prescribed barbell work to someone training at home.
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

  // Get recent sessions (last 3)
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

  // Format fatigue by status
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

// Static instructions — safe to pin at the front of the conversation, since
// nothing here goes stale.
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
 * The persona used when the athlete has turned "AI Data Consent" off.
 *
 * Consent-off degrades the coach rather than removing it: the chat still
 * answers, but with no body data block and no tools at all, so there is
 * physically nothing for it to read or draft. This prompt exists so it says so
 * up front instead of confabulating numbers to fill the silence — a coach that
 * invents a readiness score is worse than one that admits it is blindfolded.
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

/**
 * How many model round trips one message may take.
 *
 * A round trip is a lookup and a re-think, and four is enough for "find the
 * exercise, check the history, draft, explain". The cap exists because a
 * confused model will otherwise keep calling tools, and every call is billed.
 */
const MAX_TOOL_ROUNDS = 4

/** Reply used when the model produced only tool calls and never any prose. */
const FALLBACK_WITH_PROPOSAL = 'I have put a draft together — have a look and tap it if it works for you.'

/**
 * Send a message, letting the coach look things up and draft along the way.
 *
 * The loop is: ask → the model may call tools → run the reads, stage the
 * drafts → ask again with the results → repeat until it answers in prose.
 * Budget is re-checked before every round trip rather than once at the top,
 * because one message can now cost several calls and a tool loop must not be
 * able to overshoot a cap that was checked when it was still cheap.
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
  // Throws AiNotConfiguredError when no provider is set, which the controller
  // turns into a clear 503 rather than a stack trace.
  const provider = resolveAiProvider()
  const client = getAiClient(provider)

  // The consent gate. Absent row reads as consent given, matching the column
  // default — the switch is opt-OUT, and an account whose settings row went
  // missing must not silently lose its coach.
  const settings = await prisma.settings.findUnique({
    where: { userId },
    select: { aiConsentEnabled: true },
  })
  const personalised = settings?.aiConsentEnabled ?? true

  // Consent off means the body data block is never built. Skipping it is the
  // point: none of those queries run, so nothing personal is read, let alone
  // sent to Google.
  const systemContext = personalised ? await buildUserContext(userId) : null

  const modelName = provider.model
  // Withheld rather than declared-and-refused. A model that cannot see a tool
  // cannot call it, so consent-off needs no per-call enforcement further down
  // and there is no path by which a read tool runs against this user's rows.
  const tools = personalised ? toolsForChatCompletions() : undefined

  // Live data goes LAST, not first. Older assistant turns assert concrete
  // numbers ("your readiness is 58%"), and a context block pinned at the
  // top of the thread loses to them on recency — the model kept quoting
  // stale scores. Freshest data closest to the question wins.
  // Consent-off replays no transcript either, which costs real continuity — a
  // follow-up like "what about for beginners?" loses what it refers to.
  //
  // It is the only version where the privacy claim is true rather than merely
  // instructed. Assistant turns written while consent was ON quote concrete
  // readiness scores and lifted weights, so replaying them would feed exactly
  // the data the switch was flipped to withhold, and the prompt telling the
  // model to ignore them is a request, not a guarantee.
  const replayHistory = personalised ? history : []

  // The persona moves from a faked first user turn to a real system message —
  // the one place the chat-completions shape is genuinely better than what it
  // replaced, since a system role is what every provider trains against.
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

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    await assertWithinBudget(userId)

    // The final round drops the tools entirely, so the model has no choice but
    // to answer. Without this a stuck model returns nothing but calls and the
    // athlete sees an empty bubble.
    const isLastRound = round === MAX_TOOL_ROUNDS - 1
    const offerTools = tools && !isLastRound

    const result = await client.chat.completions.create({
      model: modelName,
      messages,
      ...(offerTools ? { tools, tool_choice: 'auto' as const } : {}),
    })

    // Bill from the provider's own counts before anything else can throw, and
    // at the price of the model actually used
    await recordUsage(userId, result.usage, { modelName })

    const modelTurn = result.choices[0]?.message
    const calls = modelTurn?.tool_calls ?? []

    if (calls.length === 0) {
      replyText = (modelTurn?.content ?? '').trim()
      break
    }

    // Echo the model's own turn back before answering it — a tool result with
    // no matching call in the transcript is rejected by the API.
    messages.push(modelTurn as ChatCompletionMessageParam)

    const budgetLeft = Math.max(0, MAX_TOOL_CALLS_PER_MESSAGE - toolCallsUsed)
    const allowed = calls.slice(0, budgetLeft)
    const refused = calls.slice(budgetLeft)
    toolCallsUsed += allowed.length

    for (const call of allowed) {
      // Only function calls carry a name and arguments; anything else in the
      // union is a shape this app never declared and cannot execute.
      if (call.type !== 'function') {
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Unsupported tool type.' }) })
        continue
      }

      const name = call.function.name
      let response: object

      // Arguments arrive as a JSON *string* here rather than a parsed object,
      // and a model that emits malformed JSON must be told so rather than
      // taking the whole message down with a SyntaxError.
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
          // A failed lookup is reported to the model, not thrown: it can say
          // it could not check rather than the whole message erroring out.
          log.error('AI tool failed', error, { tool: name })
          response = { error: 'That lookup failed.' }
        }
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(response),
      })
    }

    // Every call in the assistant turn must be answered, refused ones included:
    // the API rejects a transcript where a tool_call has no matching result.
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

  if (!replyText) {
    replyText = proposals.length > 0
      ? FALLBACK_WITH_PROPOSAL
      : 'Sorry, I could not generate a response.'
  }

  const [, assistantMessage] = await prisma.$transaction([
    prisma.aIChat.create({
      data: { threadId, userId, messageText: message, sender: 'user', dateTime: new Date() },
    }),
    prisma.aIChat.create({
      data: { threadId, userId, messageText: replyText, sender: 'assistant', dateTime: new Date() },
    }),
  ])

  // Bind the cards to the message that produced them, so reopening the thread
  // shows them attached to the right reply rather than floating at the end.
  if (proposals.length > 0) {
    await prisma.aiProposal.updateMany({
      where: { id: { in: proposals.map(p => p.id) } },
      data: { messageId: assistantMessage.id },
    })
  }

  return { reply: replyText, proposals }
}

// Get or create a thread for the user
export const getOrCreateThread = async (userId: string) => {
  // Use latest thread or create new one
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

// Get thread history formatted for ChatGPT
export const getThreadHistory = async (threadId: string) => {
  // Newest first, then reversed back into reading order. Ordering ascending and
  // taking 20 returns the OLDEST twenty messages of the thread — so a long
  // conversation kept re-sending its opening exchanges and never the turn the
  // user was actually replying to, while paying for the tokens either way.
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
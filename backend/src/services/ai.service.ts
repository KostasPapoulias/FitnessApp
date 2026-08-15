import { Content, GoogleGenerativeAI, Part } from '@google/generative-ai'
import prisma from '../lib/prisma'
import { getUserReadiness } from './readiness.service'
import { getTrainingLoad } from './training-load.service'
import { resolveAge } from './fatigue-model.service'
import { assertWithinBudget, recordUsage } from './ai-budget.service'
import {
  MAX_TOOL_CALLS_PER_MESSAGE, ProposalSummary, TOOL_DECLARATIONS,
  createProposal, executeReadTool, isKnownTool, isWriteTool,
} from './ai-tools.service'

// Build the fatigue context string that gets sent to ChaGPT
export const buildUserContext = async (userId: string): Promise<string> => {
  // Same readiness calculation the Home/Profile screens show, so the AI
  // never quotes a different number than the UI.
  const { readinessScore: readiness, muscles: effectiveFatigue, fitnessLevel, systemicFatigue } =
    await getUserReadiness(userId)

  // Weeks-long trend, not today's soreness — this is what tells the coach
  // whether to push, hold, or back off.
  const load = await getTrainingLoad(userId)

  // Get latest sleep
  const sleep = await prisma.sleepLog.findFirst({
    where: { userId },
    orderBy: { sleepDate: 'desc' }
  })

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
Sleep: ${sleep ? `${(sleep.durationMin / 60).toFixed(1)}h (score: ${sleep.sleepScore ?? 'not rated'})` : 'Not logged'}
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
propose_workout and propose_schedule do NOT save anything. They show the
athlete a card which they must tap to accept. So:
  - always call search_exercises first and build plans only from ids it returned
  - never invent an exercise id
  - after drafting, say it is ready for them to review and tap
  - NEVER say you have saved, added, scheduled or created anything
You cannot delete anything, change a workout they have already completed, or
alter their security settings. If asked, say so plainly and offer what you can.
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
  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey) throw new Error('Gemini is not configured. Set GEMINI_API_KEY.')

  // Build the full context
  const systemContext = await buildUserContext(userId)

  const genAI = new GoogleGenerativeAI(geminiApiKey)
  const rawModelName = (process.env.GEMINI_MODEL ?? 'models/gemini-2.5-flash').trim()
  const modelName = rawModelName.startsWith('models/')
    ? rawModelName
    : `models/${rawModelName}`
  const model = genAI.getGenerativeModel(
    { model: modelName, tools: [{ functionDeclarations: TOOL_DECLARATIONS }] },
    { apiVersion: 'v1' }
  )

  // Live data goes LAST, not first. Older assistant turns assert concrete
  // numbers ("your readiness is 58%"), and a context block pinned at the
  // top of the thread loses to them on recency — the model kept quoting
  // stale scores. Freshest data closest to the question wins.
  const contents: Content[] = [
    { role: 'user', parts: [{ text: AI_PERSONA }] },
    ...history.map(item => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }]
    })),
    { role: 'user', parts: [{ text: `${systemContext}\n\n---\n\n${message}` }] }
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
    const result = isLastRound
      ? await model.generateContent({ contents, tools: [] })
      : await model.generateContent({ contents })

    // Bill from the provider's own counts before anything else can throw, and
    // at the price of the model actually used
    await recordUsage(userId, result.response.usageMetadata, { modelName })

    const calls = result.response.functionCalls()
    if (!calls || calls.length === 0) {
      replyText = result.response.text().trim()
      break
    }

    // Echo the model's own turn back before answering it — a function response
    // with no matching call in the transcript is rejected by the API.
    const modelParts = result.response.candidates?.[0]?.content?.parts ?? []
    contents.push({ role: 'model', parts: modelParts })

    const budgetLeft = Math.max(0, MAX_TOOL_CALLS_PER_MESSAGE - toolCallsUsed)
    const allowed = calls.slice(0, budgetLeft)
    const refused = calls.slice(budgetLeft)
    toolCallsUsed += allowed.length

    const responseParts: Part[] = []

    for (const call of allowed) {
      const args = (call.args ?? {}) as Record<string, any>
      let response: object

      if (!isKnownTool(call.name)) {
        response = { error: `Unknown tool "${call.name}".` }
      } else if (isWriteTool(call.name)) {
        const drafted = await createProposal(userId, threadId, call.name, args)
        if (drafted.proposal) proposals.push(drafted.proposal)
        response = drafted.toModel
      } else {
        try {
          response = await executeReadTool(userId, call.name, args)
        } catch (error) {
          // A failed lookup is reported to the model, not thrown: it can say
          // it could not check rather than the whole message erroring out.
          console.error(`AI tool "${call.name}" failed:`, error)
          response = { error: 'That lookup failed.' }
        }
      }

      responseParts.push({ functionResponse: { name: call.name, response } })
    }

    for (const call of refused) {
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: { error: 'Tool call limit reached for this message. Answer with what you already have.' },
        },
      })
    }

    // Function responses travel under the 'function' role, not 'user'.
    contents.push({ role: 'function', parts: responseParts })
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
import { GoogleGenerativeAI } from '@google/generative-ai'
import prisma from '../lib/prisma'
import { getUserReadiness } from './readiness.service'
import { getTrainingLoad } from './training-load.service'
import { assertWithinBudget, recordUsage } from './ai-budget.service'

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
`.trim()

// Send a message and get a response from Chatgpt
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
}) => {
  // Refuse before spending anything, not after
  await assertWithinBudget(userId)

  // Build the full context
  const systemContext = await buildUserContext(userId)

  const geminiApiKey = process.env.GEMINI_API_KEY
  if (geminiApiKey) {
    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const rawModelName = (process.env.GEMINI_MODEL ?? 'models/gemini-2.5-flash').trim()
    const modelName = rawModelName.startsWith('models/')
      ? rawModelName
      : `models/${rawModelName}`
    const model = genAI.getGenerativeModel(
      { model: modelName },
      { apiVersion: 'v1' }
    )

    // Live data goes LAST, not first. Older assistant turns assert concrete
    // numbers ("your readiness is 58%"), and a context block pinned at the
    // top of the thread loses to them on recency — the model kept quoting
    // stale scores. Freshest data closest to the question wins.
    const contents = [
      { role: 'user', parts: [{ text: AI_PERSONA }] },
      ...history.map(item => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }]
      })),
      { role: 'user', parts: [{ text: `${systemContext}\n\n---\n\n${message}` }] }
    ]

    const response = await model.generateContent({ contents })

    // Bill from the provider's own counts before anything else can throw, and
    // at the price of the model actually used
    await recordUsage(userId, response.response.usageMetadata, { modelName })

    const replyText = response.response.text().trim()
      ? response.response.text().trim()
      : 'Sorry, I could not generate a response.'

    await prisma.aIChat.createMany({
      data: [
        {
          threadId,
          userId,
          messageText: message,
          sender: 'user',
          dateTime: new Date()
        },
        {
          threadId,
          userId,
          messageText: replyText,
          sender: 'assistant',
          dateTime: new Date()
        }
      ]
    })

    return replyText
  }

  throw new Error('Gemini is not configured. Set GEMINI_API_KEY.')
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
import OpenAi from 'openai'
import prisma from '../lib/prisma'

const openai = new OpenAi({
  apiKey: process.env.OPENAI_API_KEY
})

// Build the fatigue context string that gets sent to ChaGPT
export const buildUserContext = async (userId: string): Promise<string> => {
  // Get current fatigue
  const fatigue = await prisma.muscleFatigueCurrent.findMany({
    where: { userId },
    include: { muscle: true }
  })

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

  // Build readiness score
  const avgFatigue = fatigue.length > 0
    ? fatigue.reduce((sum, f) => sum + f.fatigueLevel, 0) / fatigue.length
    : 0
  const readiness = Math.round(Math.max(0, 100 - avgFatigue))

  // Format fatigue by status
  const highFatigue   = fatigue.filter(f => f.fatigueLevel >= 70)
  const modFatigue    = fatigue.filter(f => f.fatigueLevel >= 35 && f.fatigueLevel < 70)
  const recovered     = fatigue.filter(f => f.fatigueLevel < 35)

  const context = `
You are SomaTrack AI — a personal fitness and recovery coach assistant.
You have access to the user's real-time body data. Always use this data
to give personalised, specific advice. Be encouraging but honest.
Keep responses concise — this is a mobile app.

## User Profile
Name: ${profile?.name ?? 'Athlete'}
Fitness level: ${profile?.fitnessLevel ?? 'intermediate'}
Goal: ${profile?.goal ?? 'general fitness'}

## Current Body State
Overall readiness score: ${readiness}%

High fatigue muscles (🔴 need rest):
${highFatigue.length > 0
  ? highFatigue.map(f => `  - ${f.muscle.name}: ${Math.round(f.fatigueLevel)}% fatigued`).join('\n')
  : '  None'}

Moderate fatigue muscles (🟡 train light):
${modFatigue.length > 0
  ? modFatigue.map(f => `  - ${f.muscle.name}: ${Math.round(f.fatigueLevel)}% fatigued`).join('\n')
  : '  None'}

Recovered muscles (🟢 ready to train):
${recovered.length > 0
  ? recovered.map(f => `  - ${f.muscle.name}: ${Math.round(f.fatigueLevel)}% fatigued`).join('\n')
  : '  All muscles need more data'}

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
  // Build the full context
  const systemContext = await buildUserContext(userId)

  // Call OpenAI API
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemContext },
      ...history,
      { role: 'user', content: message }
    ]
  })

  const replyText = response.choices[0].message.content
    ? response.choices[0].message.content
    : 'Sorry, I could not generate a response.'

  // Save both messages to database
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
  const messages = await prisma.aIChat.findMany({
    where: { threadId },
    orderBy: { dateTime: 'asc' },
    take: 20 // last 20 messages for context window
  })

  return messages.map(m => ({
    role: m.sender as 'user' | 'assistant',
    content: m.messageText
  }))
}
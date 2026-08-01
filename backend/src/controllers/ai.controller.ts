import { Response } from 'express'
import { AuthRequest } from '../server'
import {
  sendMessage,
  getOrCreateThread,
  getThreadHistory
} from '../services/ai.service'
import { AiBudgetError, getUsageToday } from '../services/ai-budget.service'
import prisma from '../lib/prisma'

// POST /api/ai/chat
export const chat = async (req: AuthRequest, res: Response) => {
  try {
    const { message, threadId: existingThreadId, newThread } = req.body

    if (!message?.trim()) {
      res.status(400).json({ success: false, error: 'Message is required' })
      return
    }

    // Thread resolution. `newThread` is how the client starts a fresh
    // conversation — the row is created here, on the first real message,
    // so abandoning the compose screen never leaves an empty thread behind.
    let thread
    if (existingThreadId) {
      thread = await prisma.chatThread.findFirst({
        where: { id: existingThreadId, userId: req.userId! }
      })
      if (!thread) {
        res.status(404).json({ success: false, error: 'Thread not found' })
        return
      }
    } else if (newThread) {
      thread = await prisma.chatThread.create({ data: { userId: req.userId! } })
    } else {
      thread = await getOrCreateThread(req.userId!)
    }

    const history = await getThreadHistory(thread.id)

    const reply = await sendMessage({
      userId:   req.userId!,
      threadId: thread.id,
      message:  message.trim(),
      history
    })

    res.json({ success: true, data: { reply, threadId: thread.id } })

  } catch (error) {
    // Out of budget or calling too fast is a 429, not a server fault — the
    // client shows the reason rather than a generic "AI service error".
    if (error instanceof AiBudgetError) {
      res.status(429)
        .set('Retry-After', String(error.retryAfterSeconds))
        .json({ success: false, error: error.message, retryAfter: error.retryAfterSeconds })
      return
    }

    console.error('AI chat error:', error)
    res.status(500).json({ success: false, error: 'AI service error' })
  }
}

// GET /api/ai/usage
// Today's AI spend against the daily cap
export const getUsage = async (req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await getUsageToday(req.userId!) })
  } catch (error) {
    console.error('getUsage error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/ai/threads
// Returns all chat threads for the user
export const getThreads = async (req: AuthRequest, res: Response) => {
  try {
    const threads = await prisma.chatThread.findMany({
      // Only conversations that actually contain something. Also hides the
      // empty rows left behind by the old eager-create flow.
      where: { userId: req.userId!, messages: { some: {} } },
      include: {
        messages: {
          orderBy: { dateTime: 'desc' },
          take: 1 // just the last message for preview
        },
        _count: { select: { messages: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json({ success: true, data: threads })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// POST /api/ai/threads
// Creates a new thread
export const createThread = async (req: AuthRequest, res: Response) => {
  try {
    const thread = await prisma.chatThread.create({
      data: {
        userId: req.userId!
      }
    })

    res.status(201).json({ success: true, data: thread })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// DELETE /api/ai/threads/:id
export const deleteThread = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    await prisma.chatThread.delete({
      where: { id, userId: req.userId! }
    })

    res.json({ success: true, data: { deleted: true } })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/ai/history
// Returns full chat history for the user
export const getHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { threadId } = req.query

    // Reading history must never create a thread — that was a second source
    // of empty rows. It also has to honour the requested threadId; it used
    // to always return the newest thread, so opening an older chat showed
    // the wrong conversation.
    const thread = threadId
      ? await prisma.chatThread.findFirst({
          where: { id: String(threadId), userId: req.userId! }
        })
      : await prisma.chatThread.findFirst({
          where: { userId: req.userId! },
          orderBy: { createdAt: 'desc' }
        })

    if (!thread) {
      res.json({ success: true, data: { threadId: null, messages: [] } })
      return
    }

    const messages = await prisma.aIChat.findMany({
      where: { threadId: thread.id },
      orderBy: { dateTime: 'asc' }
    })

    res.json({ success: true, data: { threadId: thread.id, messages } })

  } catch (error) {
    console.error('getHistory error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/ai/suggest-workout
// Proactive suggestion based on current fatigue
export const suggestWorkout = async (req: AuthRequest, res: Response) => {
  try {
    const thread = await getOrCreateThread(req.userId!)
    const history = await getThreadHistory(thread.id)

    const reply = await sendMessage({
      userId:   req.userId!,
      threadId: thread.id,
      message:  'Based on my current muscle fatigue and recovery state, what should I train today? Give me a specific workout suggestion.',
      history
    })

    res.json({ success: true, data: { reply } })

  } catch (error) {
    if (error instanceof AiBudgetError) {
      res.status(429)
        .set('Retry-After', String(error.retryAfterSeconds))
        .json({ success: false, error: error.message, retryAfter: error.retryAfterSeconds })
      return
    }

    console.error('suggestWorkout error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}
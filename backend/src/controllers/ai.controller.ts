import { Response } from 'express'
import { AuthRequest } from '../server'
import {
  sendMessage,
  getOrCreateThread,
  getThreadHistory
} from '../services/ai.service'
import prisma from '../lib/prisma'

// POST /api/ai/chat
export const chat = async (req: AuthRequest, res: Response) => {
  try {
    const { message, threadId: existingThreadId } = req.body

    if (!message?.trim()) {
      res.status(400).json({ success: false, error: 'Message is required' })
      return
    }

    // provided threadId or get/create default
    let thread
    if (existingThreadId) {
      thread = await prisma.chatThread.findFirst({
        where: { id: existingThreadId, userId: req.userId! }
      })
      if (!thread) {
        res.status(404).json({ success: false, error: 'Thread not found' })
        return
      }
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
    console.error('AI chat error:', error)
    res.status(500).json({ success: false, error: 'AI service error' })
  }
}

// GET /api/ai/threads
// Returns all chat threads for the user
export const getThreads = async (req: AuthRequest, res: Response) => {
  try {
    const threads = await prisma.chatThread.findMany({
      where: { userId: req.userId! },
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
    const thread = await getOrCreateThread(req.userId!)

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
    console.error('suggestWorkout error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}
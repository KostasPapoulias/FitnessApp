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
    const { message } = req.body

    if (!message?.trim()) {
      res.status(400).json({ success: false, error: 'Message is required' })
      return
    }

    // Get or create thread
    const thread = await getOrCreateThread(req.userId!)

    // Get conversation history
    const history = await getThreadHistory(thread.id)

    // Send to Claude and save
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
import { Response } from 'express'
import { AuthRequest } from '../server'
import {
  sendMessage,
  getOrCreateThread,
  getThreadHistory
} from '../services/ai.service'
import { AiBudgetError, getUsageToday } from '../services/ai-budget.service'
import { AiNotConfiguredError } from '../lib/aiProvider'
import {
  ProposalError, applyProposal, listThreadProposals, rejectProposal,
} from '../services/ai-tools.service'
import prisma from '../lib/prisma'
import { log } from '../lib/logger'

// POST /api/ai/chat
export const chat = async (req: AuthRequest, res: Response) => {
  try {
    const { message, threadId: existingThreadId, newThread } = req.body

    if (!message?.trim()) {
      res.status(400).json({ success: false, error: 'Message is required' })
      return
    }

    // `newThread` creates the thread here, on the first real message, so an
    // abandoned compose screen leaves no empty thread
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

    const { reply, proposals } = await sendMessage({
      userId:   req.userId!,
      threadId: thread.id,
      message:  message.trim(),
      history
    })

    res.json({ success: true, data: { reply, threadId: thread.id, proposals } })

  } catch (error) {
    // Over budget or too fast: 429 with the reason
    if (error instanceof AiBudgetError) {
      res.status(429)
        .set('Retry-After', String(error.retryAfterSeconds))
        .json({ success: false, error: error.message, retryAfter: error.retryAfterSeconds })
      return
    }

    // Unconfigured provider: 503, logged without an Error so it is not reported
    if (error instanceof AiNotConfiguredError) {
      log.warn('AI chat attempted with no provider configured', { reason: error.message })
      res.status(503).json({ success: false, error: 'The AI coach is not configured on this server.' })
      return
    }

    log.error('AI chat failed', error)
    res.status(500).json({ success: false, error: 'AI service error' })
  }
}

// GET /api/ai/usage — today's AI spend against the daily cap
export const getUsage = async (req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await getUsageToday(req.userId!) })
  } catch (error) {
    log.error('getUsage failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/ai/threads — the user's non-empty threads with a last-message preview
export const getThreads = async (req: AuthRequest, res: Response) => {
  try {
    const threads = await prisma.chatThread.findMany({
      // Only threads that contain messages
      where: { userId: req.userId!, messages: { some: {} } },
      include: {
        messages: {
          orderBy: { dateTime: 'desc' },
          take: 1
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

// POST /api/ai/threads — create a thread
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

// GET /api/ai/history?threadId= — one thread's messages and open proposals
export const getHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { threadId } = req.query

    // Never creates a thread; honours the requested threadId
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

    // Unanswered proposal cards come back with the conversation
    const proposals = await listThreadProposals(req.userId!, thread.id)

    res.json({ success: true, data: { threadId: thread.id, messages, proposals } })

  } catch (error) {
    log.error('getHistory failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// GET /api/ai/suggest-workout — a workout suggestion from the current fatigue state
export const suggestWorkout = async (req: AuthRequest, res: Response) => {
  try {
    const thread = await getOrCreateThread(req.userId!)
    const history = await getThreadHistory(thread.id)

    const { reply, proposals } = await sendMessage({
      userId:   req.userId!,
      threadId: thread.id,
      message:  'Based on my current muscle fatigue and recovery state, what should I train today? Give me a specific workout suggestion.',
      history
    })

    res.json({ success: true, data: { reply, proposals } })

  } catch (error) {
    if (error instanceof AiBudgetError) {
      res.status(429)
        .set('Retry-After', String(error.retryAfterSeconds))
        .json({ success: false, error: error.message, retryAfter: error.retryAfterSeconds })
      return
    }

    log.error('suggestWorkout failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

// POST /api/ai/proposals/:id/accept — the only AI route that writes to the
// app's own tables, and only with the athlete's token.
export const acceptProposal = async (req: AuthRequest, res: Response) => {
  try {
    const result = await applyProposal(req.userId!, req.params.id)
    res.json({ success: true, data: result })
  } catch (error) {
    if (error instanceof ProposalError) {
      // Gone or already spent: 404 / 409 so the client can explain
      res.status(error.code === 'not_found' ? 404 : 409)
        .json({ success: false, error: error.message })
      return
    }
    log.error('acceptProposal failed', error)
    res.status(500).json({ success: false, error: 'Could not apply that suggestion.' })
  }
}

// POST /api/ai/proposals/:id/reject
export const dismissProposal = async (req: AuthRequest, res: Response) => {
  try {
    const dismissed = await rejectProposal(req.userId!, req.params.id)
    res.json({ success: true, data: { dismissed } })
  } catch (error) {
    log.error('dismissProposal failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

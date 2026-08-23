import { Response } from 'express'
import { log } from '../lib/logger'
import { AuthRequest } from '../server'
import {
  TemplateValidationError,
  cancelScheduled, closeScheduled, createTemplate, getTemplate, listScheduled,
  listTemplates, scheduleTemplate, setTemplateArchived, startScheduled,
  templateFromSession, updateTemplate,
} from '../services/template.service'

/**
 * Saved plans and the standby queue.
 *
 * Every handler scopes by `req.userId` from the verified token rather than
 * trusting an id in the body, so no request can reach another athlete's plan.
 */

const fail = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof TemplateValidationError) {
    res.status(400).json({ success: false, error: error.message })
    return
  }
  log.error(fallback, error)
  res.status(500).json({ success: false, error: fallback })
}

/** Parse a client-supplied timestamp, refusing anything unusable. */
const parseDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// GET /api/templates?includeArchived=true
export const getTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const includeArchived = String(req.query.includeArchived) === 'true'
    res.json({ success: true, data: await listTemplates(req.userId!, { includeArchived }) })
  } catch (error) {
    fail(res, error, 'Could not load your plans.')
  }
}

// GET /api/templates/:id
export const getOne = async (req: AuthRequest, res: Response) => {
  try {
    const template = await getTemplate(req.userId!, req.params.id)
    if (!template) {
      res.status(404).json({ success: false, error: 'Plan not found' })
      return
    }
    res.json({ success: true, data: template })
  } catch (error) {
    fail(res, error, 'Could not load that plan.')
  }
}

// POST /api/templates
export const create = async (req: AuthRequest, res: Response) => {
  try {
    const template = await createTemplate(req.userId!, { ...req.body, source: 'user' })
    res.status(201).json({ success: true, data: template })
  } catch (error) {
    fail(res, error, 'Could not save that plan.')
  }
}

// PUT /api/templates/:id
export const update = async (req: AuthRequest, res: Response) => {
  try {
    const template = await updateTemplate(req.userId!, req.params.id, req.body)
    if (!template) {
      res.status(404).json({ success: false, error: 'Plan not found' })
      return
    }
    res.json({ success: true, data: template })
  } catch (error) {
    fail(res, error, 'Could not update that plan.')
  }
}

// POST /api/templates/:id/archive   body: { archived: boolean }
// Archive rather than delete: a plan that produced sessions is part of the
// explanation for how the athlete got here.
export const archive = async (req: AuthRequest, res: Response) => {
  try {
    const template = await setTemplateArchived(req.userId!, req.params.id, req.body?.archived !== false)
    if (!template) {
      res.status(404).json({ success: false, error: 'Plan not found' })
      return
    }
    res.json({ success: true, data: template })
  } catch (error) {
    fail(res, error, 'Could not archive that plan.')
  }
}

// POST /api/templates/from-session   body: { sessionId, name? }
export const fromSession = async (req: AuthRequest, res: Response) => {
  try {
    const template = await templateFromSession(req.userId!, req.body?.sessionId, req.body?.name)
    if (!template) {
      res.status(404).json({ success: false, error: 'Session not found' })
      return
    }
    res.status(201).json({ success: true, data: template })
  } catch (error) {
    fail(res, error, 'Could not save that session as a plan.')
  }
}

// ── standby queue ─────────────────────────────────────────────────────────

// GET /api/templates/scheduled/list?status=standby
export const getScheduled = async (req: AuthRequest, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    res.json({ success: true, data: await listScheduled(req.userId!, { status }) })
  } catch (error) {
    fail(res, error, 'Could not load your schedule.')
  }
}

// POST /api/templates/:id/schedule   body: { scheduledFor, reminderAt? }
export const schedule = async (req: AuthRequest, res: Response) => {
  try {
    const scheduledFor = parseDate(req.body?.scheduledFor)
    if (!scheduledFor) {
      res.status(400).json({ success: false, error: 'A valid date is required.' })
      return
    }

    const scheduled = await scheduleTemplate(req.userId!, {
      templateId: req.params.id,
      scheduledFor,
      reminderAt: parseDate(req.body?.reminderAt),
    })
    if (!scheduled) {
      res.status(404).json({ success: false, error: 'Plan not found' })
      return
    }
    res.status(201).json({ success: true, data: scheduled })
  } catch (error) {
    fail(res, error, 'Could not schedule that plan.')
  }
}

// POST /api/templates/scheduled/:id/start   body: { sessionId }
export const startFromSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const scheduled = await startScheduled(req.userId!, req.params.id, req.body?.sessionId)
    if (!scheduled) {
      res.status(404).json({ success: false, error: 'Scheduled workout or session not found' })
      return
    }
    res.json({ success: true, data: scheduled })
  } catch (error) {
    fail(res, error, 'Could not start that plan.')
  }
}

// POST /api/templates/scheduled/:id/close   body: { status: 'completed' | 'skipped' }
export const closeSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const status = req.body?.status === 'skipped' ? 'skipped' : 'completed'
    const scheduled = await closeScheduled(req.userId!, req.params.id, status)
    if (!scheduled) {
      res.status(404).json({ success: false, error: 'Scheduled workout not found' })
      return
    }
    res.json({ success: true, data: scheduled })
  } catch (error) {
    fail(res, error, 'Could not update that scheduled workout.')
  }
}

// DELETE /api/templates/scheduled/:id
export const cancelSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const scheduled = await cancelScheduled(req.userId!, req.params.id)
    if (!scheduled) {
      res.status(404).json({ success: false, error: 'Scheduled workout not found' })
      return
    }
    res.json({ success: true, data: scheduled })
  } catch (error) {
    fail(res, error, 'Could not cancel that scheduled workout.')
  }
}

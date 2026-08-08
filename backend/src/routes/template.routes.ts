import { Router } from 'express'
import {
  archive, cancelSchedule, closeSchedule, create, fromSession, getOne,
  getScheduled, getTemplates, schedule, startFromSchedule, update,
} from '../controllers/template.controller'
import { verifyToken } from '../middleware/auth.middleware'

const router = Router()

router.use(verifyToken)

// Static and nested paths first: '/scheduled/list' would otherwise be captured
// by '/:id' and looked up as a template with the id "scheduled".
/**
 * @route GET /api/templates/scheduled/list
 * @protected
 * @returns Workouts on standby, optionally filtered by ?status=
 */
router.get('/scheduled/list', getScheduled)
/**
 * @route POST /api/templates/scheduled/:id/start
 * @protected
 * @body sessionId — binds the standby slot to the session fulfilling it
 */
router.post('/scheduled/:id/start', startFromSchedule)
/**
 * @route POST /api/templates/scheduled/:id/close
 * @protected
 * @body status — completed | skipped
 */
router.post('/scheduled/:id/close', closeSchedule)
/**
 * @route DELETE /api/templates/scheduled/:id
 * @protected — cancels the slot and withdraws an unsent reminder
 */
router.delete('/scheduled/:id', cancelSchedule)

/**
 * @route POST /api/templates/from-session
 * @protected
 * @body sessionId, name? — freeze a finished session as a repeatable plan
 */
router.post('/from-session', fromSession)

/**
 * @route GET /api/templates
 * @protected
 * @returns Saved plans; ?includeArchived=true for the archive
 */
router.get('/', getTemplates)
/**
 * @route POST /api/templates
 * @protected
 * @returns Created plan
 */
router.post('/', create)
/**
 * @route GET /api/templates/:id
 * @protected
 */
router.get('/:id', getOne)
/**
 * @route PUT /api/templates/:id
 * @protected — replaces the plan's exercises and sets
 */
router.put('/:id', update)
/**
 * @route POST /api/templates/:id/archive
 * @protected
 * @body archived — true to archive, false to restore. Plans are never deleted.
 */
router.post('/:id/archive', archive)
/**
 * @route POST /api/templates/:id/schedule
 * @protected
 * @body scheduledFor, reminderAt? — puts the plan on standby for a date
 */
router.post('/:id/schedule', schedule)

export default router

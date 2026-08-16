import { Router } from 'express'
import { verifyToken } from '../middleware/auth.middleware'
import {
  startSession,
  addExercise,
  logSet,
  finishSession,
  getSessions,
  getSessionById,
  getActiveSession,
  deleteSession,
  updateSet,
  deleteSet,
  getPlanSuggestions,
  getRunTrack
} from '../controllers/workout.controller'

const router = Router()
router.use(verifyToken)
/**
 * @route POST /api/workout/plan-suggestions
 * @protected
 * @returns per-exercise sets built from the athlete's own history
 */
router.post('/plan-suggestions', getPlanSuggestions)
/**
 * @route POST /api/workout/sessions
 * @protected
 * @returns created workout session
 */
router.post('/sessions', startSession)
/**
 * @route GET /api/workout/sessions
 * @protected
 * @returns list of user's workout sessions
 */
router.get('/sessions', getSessions)
/**
 * @route GET /api/workout/sessions/active
 * @protected
 * @returns the session still open, or null
 *
 * MUST stay above `/sessions/:id` — Express matches in order, and registered
 * after it "active" is swallowed as an id and answers 404.
 */
router.get('/sessions/active', getActiveSession)
/**
 * @route GET /api/workout/sessions/:id
 * @protected
 * @returns single workout session
 */
router.get('/sessions/:id', getSessionById)
/**
 * @route DELETE /api/workout/sessions/:id
 * @protected
 * @returns the deleted id, and whether fatigue had to be reversed
 */
router.delete('/sessions/:id', deleteSession)
/**
 * @route POST /api/workout/sessions/:id/exercises
 * @protected
 * @returns added exercise to session
 */
router.post('/sessions/:id/exercises', addExercise)
/**
 * @route POST /api/workout/sessions/:id/sets
 * @protected
 * @returns logged set for exercise
 */
router.post('/sessions/:id/sets', logSet)
/**
 * @route POST /api/workout/sessions/:id/finish
 * @protected
 * @returns finished session with fatigue updates
 */
router.post('/sessions/:id/finish', finishSession)
/**
 * @route GET /api/workout/sets/:setId/run
 * @protected
 * @returns the recorded route, splits and average pace for a cardio set,
 *          or null for one logged without a track
 */
router.get('/sets/:setId/run', getRunTrack)
/**
 * @route PATCH /api/workout/sets/:setId
 * @protected
 * @returns the edited set id — the session is re-scored and fatigue rebuilt
 */
router.patch('/sets/:setId', updateSet)
/**
 * @route DELETE /api/workout/sets/:setId
 * @protected
 * @returns the removed set id — the session is re-scored and fatigue rebuilt
 */
router.delete('/sets/:setId', deleteSet)

export default router
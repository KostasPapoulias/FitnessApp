import { Router } from 'express'
import { verifyToken } from '../middleware/auth.middleware'
import {
  startSession,
  addExercise,
  logSet,
  finishSession,
  getSessions,
  getSessionById
} from '../controllers/workout.controller'

const router = Router()
router.use(verifyToken)
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
 * @route GET /api/workout/sessions/:id
 * @protected
 * @returns single workout session
 */
router.get('/sessions/:id', getSessionById)
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

export default router
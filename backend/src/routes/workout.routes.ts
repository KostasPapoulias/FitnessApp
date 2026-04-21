import { Router } from 'express';
import { startSession, updateSession, finishSession, getSessions, getSession } from '../controllers/workout.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = Router();

router.use(verifyToken);

/**
 * @route POST /api/workout/sessions
 * @protected
 * @returns new workout session
 */
router.post('/sessions', startSession);

/**
 * @route PUT /api/workout/sessions/:id
 * @protected
 * @returns updated session
 */
router.put('/sessions/:id', updateSession);

/**
 * @route POST /api/workout/sessions/:id/finish
 * @protected
 * @returns finished session with fatigue updates
 */
router.post('/sessions/:id/finish', finishSession);

/**
 * @route GET /api/workout/sessions
 * @protected
 * @returns user's workout history
 */
router.get('/sessions', getSessions);

/**
 * @route GET /api/workout/sessions/:id
 * @protected
 * @returns single session detail
 */
router.get('/sessions/:id', getSession);

export default router;

import { Router } from 'express';
import { chat, getHistory, suggestWorkout } from '../controllers/ai.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);

/**
 * @route POST /api/ai/chat
 * @protected
 * @body messageText
 * @returns AI response
 */
router.post('/chat', chat);

/**
 * @route GET /api/ai/history
 * @protected
 * @returns Full chat history for the user
 */
router.get('/history', getHistory);

/**
 * @route GET /api/ai/suggest-workout
 * @protected
 * @returns AI-suggested workout based on fatigue
 */
router.get('/suggest-workout', suggestWorkout);

export default router;

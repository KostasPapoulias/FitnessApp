import { Router } from 'express';
import { sendMessage, getWorkoutSuggestion } from '../controllers/ai.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = Router();

router.use(verifyToken);

/**
 * @route POST /api/ai/chat
 * @protected
 * @body messageText
 * @returns AI response
 */
router.post('/chat', sendMessage);

/**
 * @route GET /api/ai/suggest-workout
 * @protected
 * @returns AI-suggested workout based on fatigue
 */
router.get('/suggest-workout', getWorkoutSuggestion);

export default router;

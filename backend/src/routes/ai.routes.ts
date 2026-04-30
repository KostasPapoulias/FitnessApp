import { Router } from 'express';
import {
  chat, getHistory, suggestWorkout,
  getThreads, createThread, deleteThread
} from '../controllers/ai.controller'
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);


/**
 * @route GET /api/ai/threads
 * @protected
 * @returns List of user's chat threads with last message preview
 */
router.get('threads', getThreads);
/**
 * @route POST /api/ai/threads
 * @protected
 * @body title
 * @returns Created chat thread
 */
router.post('threads', createThread);
/**
 * @route DELETE /api/ai/threads/:id
 * @protected
 * @returns Deletion confirmation
 */
router.delete('threads/:id', deleteThread);
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

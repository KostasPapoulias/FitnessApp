import { Router } from 'express';
import {
  chat, getHistory, suggestWorkout, getUsage,
  getThreads, createThread, deleteThread,
  acceptProposal, dismissProposal
} from '../controllers/ai.controller'
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);


/**
 * @route GET /api/ai/threads
 * @protected
 * @returns List of user's chat threads with last message preview
 */
router.get('/threads', getThreads);
/**
 * @route POST /api/ai/threads
 * @protected
 * @returns Created chat thread
 */
router.post('/threads', createThread);
/**
 * @route DELETE /api/ai/threads/:id
 * @protected
 * @returns Deletion confirmation
 */
router.delete('/threads/:id', deleteThread);
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

/**
 * @route GET /api/ai/usage
 * @protected
 * @returns today's AI spend against the daily cap
 */
router.get('/usage', getUsage);

/**
 * @route POST /api/ai/proposals/:id/accept
 * @protected
 * @returns The plan (and schedule) created from a drafted card. This is the
 *          only place an AI suggestion becomes real data, and it needs a
 *          request carrying the athlete's own token.
 */
router.post('/proposals/:id/accept', acceptProposal);
/**
 * @route POST /api/ai/proposals/:id/reject
 * @protected — dismisses a drafted card without applying it
 */
router.post('/proposals/:id/reject', dismissProposal);

export default router;

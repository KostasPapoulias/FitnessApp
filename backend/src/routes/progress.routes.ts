import { Router } from 'express'
import { verifyToken } from '../middleware/auth.middleware'
import {
  getExerciseHistoryForUser,
  getExerciseStrengthSeries,
  getProgressSummary,
  getWorkoutHistory,
} from '../controllers/progress.controller'

const router = Router()

// Every route here reads one athlete's own training history. There is no public
// read — unlike the exercise catalogue, none of this exists without a user.
router.use(verifyToken)

/**
 * @route GET /api/progress/summary?weeks=12&days=30
 * @protected
 * @returns weekly volume, strength estimates and per-muscle fatigue history
 */
router.get('/summary', getProgressSummary)

/**
 * @route GET /api/progress/history?cursor=&limit=&modality=
 * @protected
 * @returns a page of finished sessions, newest first, plus the next cursor
 *
 * Declared before `/strength/:exerciseId` and friends purely for readability —
 * the paths do not collide.
 */
router.get('/history', getWorkoutHistory)

/**
 * @route GET /api/progress/strength/:exerciseId
 * @protected
 * @returns estimated 1RM per session for one exercise, PRs flagged
 */
router.get('/strength/:exerciseId', getExerciseStrengthSeries)

/**
 * @route GET /api/progress/exercises/:exerciseId/history?limit=10
 * @protected
 * @returns the athlete's own recent sets of one exercise
 */
router.get('/exercises/:exerciseId/history', getExerciseHistoryForUser)

export default router

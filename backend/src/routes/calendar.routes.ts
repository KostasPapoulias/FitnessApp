import { Router } from 'express';
import { getCalendarMonth, getCalendarDay, getCalendarActivity, getCalendarMuscles } from '../controllers/calendar.controller';
import { verifyToken } from '../middleware/auth.middleware';
const router = Router();

router.use(verifyToken);

/**
 * @route GET /api/calendar?month=4&year=2026
 * @protected
 * @returns per-day summaries for one month
 */
router.get('/', getCalendarMonth);

/**
 * @route GET /api/calendar/activity
 * @protected
 * @returns 53-week training heatmap + streak stats
 */
router.get('/activity', getCalendarActivity);

/**
 * @route GET /api/calendar/muscles
 * @protected
 * @returns weekly muscle-group set volume + imbalance insights
 */
router.get('/muscles', getCalendarMuscles);

/**
 * @route GET /api/calendar/:date   (YYYY-MM-DD)
 * @protected
 * @returns the sessions, sets and fatigue snapshot for one day
 */
router.get('/:date', getCalendarDay);

export default router;
import { Router } from 'express';
import { getCalendarMonth, getCalendarDay, getCalendarActivity, getCalendarMuscles } from '../controllers/calendar.controller';
import { verifyToken } from '../middleware/auth.middleware';
const router = Router();

router.use(verifyToken);

/** * @route GET /api/calendar?month=4&year=2026
 * @private
 * @returns user's calendar
 */
router.get('/', getCalendarMonth);

/** * @route GET /api/calendar/activity
 * @private
 * @returns 53-week training heatmap + streak stats
 */
router.get('/activity', getCalendarActivity);

/** * @route GET /api/calendar/muscles
 * @private
 * @returns weekly muscle-group set volume + imbalance/coach insights
 */
router.get('/muscles', getCalendarMuscles);

/** * @route GET /api/calendar/:date  date = "2026-04-25"
 * @private
 * @returns details of a specific day in the calendar
 */
router.get('/:date', getCalendarDay);

export default router;
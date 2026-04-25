import { Router } from 'express';
import { getCalendarMonth, getCalendarDay } from '../controllers/calendar.controller';
import { verifyToken } from '../middleware/auth.middleware';
const router = Router();

router.use(verifyToken);

/** * @route GET /api/calendar?month=4&year=2026
 * @private
 * @returns user's calendar
 */
router.get('/', getCalendarMonth);

/** * @route GET /api/calendar/:date  date = "2026-04-25"
 * @private
 * @returns details of a specific day in the calendar
 */
router.get('/:date', getCalendarDay); 

export default router;
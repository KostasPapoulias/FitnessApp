import { Router } from 'express';
import { getCalendarData, getDayDetail } from '../controllers/calendar.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';
const router = Router();

router.use(verifyToken);

/** * @route GET /api/calendar
 * @private
 * @returns user's calendar
 */
router.get('/', getCalendarData);

/** * @route GET /api/calendar/day/:date
 * @private
 * @returns details of a specific day in the calendar
 */
router.get('/day/:date', getDayDetail); 

export default router;